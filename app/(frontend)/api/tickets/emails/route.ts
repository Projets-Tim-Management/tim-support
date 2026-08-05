import { NextResponse } from "next/server";

import { hasAdminRole, isSupport } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { getTicketEmailActivity } from "@/modules/support/lib/brevo";

/**
 * Activité e-mail d'un ticket (onglet « E-mails » de la fiche) : envois, remises,
 * ouvertures, clics, échecs — lus dans Brevo.
 *
 * Réservé au back-office (admin / support) : ces événements exposent l'adresse du
 * demandeur et son comportement de lecture. La clé API Brevo ne quitte jamais le
 * serveur — le composant admin passe par cette route.
 *
 * GET /api/tickets/emails?id=<ticketId>
 */
export async function GET(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!hasAdminRole(user) && !isSupport(user)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ error: "missing_id" }, { status: 400 });

  const ticket = (await payload
    .findByID({ collection: "tickets", id, depth: 0, overrideAccess: true })
    .catch(() => null)) as { number?: number; email?: string } | null;
  if (!ticket) return NextResponse.json({ error: "not_found" }, { status: 404 });

  return NextResponse.json(await getTicketEmailActivity(ticket.number, ticket.email));
}
