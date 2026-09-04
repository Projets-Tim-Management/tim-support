import { hasAdminRole } from "@/core/access";
import { unsubscribeUrl } from "@/core/lib/email-suppression";
import { payloadClient } from "@/core/payload-client";
import { buildSequenceEmail, type ThemeDoc } from "@/modules/marketing/lib/sequence-emails";
import { renderSignature, signatureFromPartner, signatureText } from "@/modules/partner/lib/signature";

/**
 * Rendu d'un message de séquence, tel que le prospect le recevra.
 *
 * Le HTML est REGÉNÉRÉ à la demande par `buildSequenceEmail` — la même fonction
 * que l'envoi réel, sur les mêmes données. Rien n'est stocké en double, et
 * surtout : ce qu'on regarde est ce qui partira, pas une reconstitution. Un
 * aperçu fabriqué autrement ne prouverait rien, et c'est justement pour ça qu'on
 * le consulte.
 *
 * Deux façons de demander :
 *
 *   ?run=<id>&message=<clé>       le rendu POUR CE PROSPECT : son prénom, la
 *                                 signature du partenaire qui le suit. C'est ce
 *                                 qu'on veut voir depuis une fiche.
 *
 *   ?sequence=<clé>&message=<clé> le rendu générique, sans destinataire. C'est
 *                                 ce qu'on veut voir en écrivant le contenu.
 *
 * Réservé aux administrateurs : le message porte le nom et les coordonnées d'un
 * partenaire, et l'aperçu contient un lien de désinscription signé.
 */
export const dynamic = "force-dynamic";

type Model = {
  messages?: ThemeDoc[];
  signature?: string;
  label?: string;
};

/** Prénom du contact de l'opportunité, comme à l'envoi. */
async function firstNameOf(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  clientId: unknown,
): Promise<string | undefined> {
  if (clientId == null) return undefined;
  const res = await payload
    .find({
      collection: "client-contacts",
      where: { client: { equals: clientId } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null);
  return (res?.docs?.[0] as { firstName?: string } | undefined)?.firstName?.trim() || undefined;
}

export async function GET(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user)) return new Response("Accès refusé", { status: 403 });

  const params = new URL(req.url).searchParams;
  const messageKey = params.get("message");
  const runId = params.get("run");
  const sequenceKey = params.get("sequence");
  if (!messageKey) return new Response("Paramètre `message` manquant", { status: 400 });

  // ── Le contexte : un vrai prospect, ou personne ────────────────────────────
  let key = sequenceKey;
  let email = "prospect@exemple.fr";
  let clientId: unknown = null;

  if (runId) {
    const run = (await payload
      .findByID({ collection: "sequence-runs", id: runId, depth: 0, overrideAccess: true })
      .catch(() => null)) as { sequence?: string; email?: string; client?: unknown } | null;
    if (!run) return new Response("Séquence introuvable", { status: 404 });
    key = run.sequence ?? null;
    email = run.email ?? email;
    clientId =
      run.client && typeof run.client === "object" ? (run.client as { id?: unknown }).id : run.client;
  }

  if (!key) return new Response("Paramètre `run` ou `sequence` manquant", { status: 400 });

  // `depth: 1` pour résoudre l'image du hero : sans elle on n'aurait que son
  // identifiant, et l'aperçu montrerait un message sans visuel — donc faux.
  const model = (
    await payload.find({
      collection: "sequences",
      where: { key: { equals: key } },
      limit: 1,
      depth: 1,
      overrideAccess: true,
    })
  ).docs[0] as Model | undefined;

  const theme = model?.messages?.find((m) => m.key === messageKey);
  if (!theme) return new Response("Message introuvable dans cette séquence", { status: 404 });

  // ── La signature : celle du partenaire qui suit l'opportunité ──────────────
  let sig = {};
  if (clientId != null) {
    const client = (await payload
      .findByID({ collection: "partner-clients", id: String(clientId), depth: 0, overrideAccess: true })
      .catch(() => null)) as { partner?: unknown } | null;
    const partnerId =
      client?.partner && typeof client.partner === "object"
        ? (client.partner as { id?: unknown }).id
        : client?.partner;
    if (partnerId != null) {
      const fiche = (await payload
        .findByID({ collection: "partners", id: String(partnerId), depth: 1, overrideAccess: true })
        .catch(() => null)) as Record<string, unknown> | null;
      sig = signatureFromPartner(fiche);
    }
  }

  const mail = buildSequenceEmail(theme, {
    firstName: await firstNameOf(payload, clientId),
    email,
    unsubscribeUrl: unsubscribeUrl(email),
    closing: model?.signature,
    signatureHtml: renderSignature(sig),
    signatureText: signatureText(sig),
  });

  if (!mail) {
    return new Response(
      "Ce message est incomplet (texte, objet ou bouton manquant) : en l'état, il ne partirait pas.",
      { status: 409, headers: { "content-type": "text/plain; charset=utf-8" } },
    );
  }

  return new Response(mail.html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      // Jamais mis en cache : on modifie un texte et on revient voir l'effet.
      "cache-control": "no-store",
    },
  });
}
