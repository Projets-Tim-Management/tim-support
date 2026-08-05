import { hasAdminRole, isSupport } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { ticketConfirmationEmail, ticketReplyEmail } from "@/modules/support/lib/email";

/**
 * Rendu HTML d'un e-mail du ticket, tel que le client le reçoit — affiché dans
 * la fiche (bouton « Voir le rendu »).
 *
 * Le HTML est REGÉNÉRÉ à la demande à partir du message enregistré : les modèles
 * sont des fonctions pures de données déjà en base, donc rien n'est stocké en
 * double. Contrepartie assumée : un message ancien s'affiche avec le modèle
 * COURANT — c'est un aperçu de ce que reçoit un client aujourd'hui, pas une
 * archive de ce qu'il a reçu à l'époque.
 *
 * GET /api/tickets/preview?id=<ticketId>&i=<index du message>
 * GET /api/tickets/preview?id=<ticketId>&kind=confirmation
 */
export async function GET(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user) && !isSupport(user)) {
    return new Response("Accès refusé", { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const id = params.get("id");
  if (!id) return new Response("Paramètre `id` manquant", { status: 400 });

  const ticket = (await payload
    .findByID({ collection: "tickets", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as {
    number?: number;
    subject?: string;
    email?: string;
    name?: string;
    messages?: { author?: string; body?: string }[];
  } | null;
  if (!ticket) return new Response("Ticket introuvable", { status: 404 });

  const common = {
    name: ticket.name,
    email: ticket.email,
    subject: ticket.subject ?? "",
    number: ticket.number ?? 0,
  };

  let html: string;
  if (params.get("kind") === "confirmation") {
    html = ticketConfirmationEmail(common).html;
  } else {
    const index = Number(params.get("i"));
    const message = ticket.messages?.[index];
    if (!message || message.author !== "support") {
      // Seuls les messages ENVOYÉS ont un rendu : un message client arrive en
      // texte (son HTML d'origine n'est pas conservé).
      return new Response("Ce message n'a pas de rendu e-mail.", { status: 404 });
    }
    html = ticketReplyEmail({ ...common, body: message.body ?? "" }).html;
  }

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      // Aperçu interne : jamais mis en cache ni indexé.
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
