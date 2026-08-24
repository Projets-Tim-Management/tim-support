import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { sendJourneyEmail } from "@/modules/marketing/lib/send";

/**
 * POST /api/admin/session-invite  { runId }
 *
 * Renvoie la confirmation de la session de prise en main à TOUTES les personnes
 * annoncées : la personne formée, ses invités, et le contact de l'espace client.
 *
 * Un message perdu ou classé en indésirable laissait le partenaire sans recours :
 * l'événement d'agenda ne se renvoie pas, et rien dans le back-office ne
 * permettait de relancer. Le forçage est assumé — le garde-fou « déjà envoyé »
 * protège des envois automatiques répétés, pas d'une demande explicite.
 *
 * Autorisé à l'admin ET au partenaire-métier PROPRIÉTAIRE du parcours : c'est
 * lui qui anime la session et qui reçoit l'appel « je n'ai rien reçu ». Un
 * partenaire ne peut relancer que ses propres clients.
 */

const KEY = "creneau-confirme";

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { runId?: string | number } | null;
  const runId = body?.runId;
  if (runId == null) return NextResponse.json({ error: "missing_run" }, { status: 400 });

  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const run = (await payload
    .findByID({ collection: "journey-runs", id: runId, depth: 0, overrideAccess: true })
    .catch(() => null)) as
    | {
        id: number | string;
        partner?: unknown;
        sessionAt?: string | null;
        attendeeEmail?: string | null;
        sessionGuests?: { email?: string | null }[] | null;
      }
    | null;
  if (!run) return NextResponse.json({ error: "no_run" }, { status: 404 });

  // Le partenaire ne relance que SES parcours. La lecture est faite en
  // `overrideAccess` (on a besoin du parcours pour vérifier), le contrôle se
  // fait donc explicitement ici.
  const runPartner = typeof run.partner === "object"
    ? ((run.partner as { id?: unknown })?.id ?? null)
    : (run.partner ?? null);
  const owns = isPartnerMetier(user) && String(partnerIdOf(user) ?? "") === String(runPartner ?? "");
  if (!hasAdminRole(user) && !owns) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  // Rien à confirmer tant qu'aucun créneau n'est retenu : le message annoncerait
  // un rendez-vous sans date.
  if (!run.sessionAt) return NextResponse.json({ error: "no_session" }, { status: 409 });

  const result = await sendJourneyEmail(payload, {
    run: run as never,
    key: KEY,
    force: true,
    alsoTo: [run.attendeeEmail, ...(run.sessionGuests ?? []).map((g) => g?.email)],
  });

  if (!result.sent) return NextResponse.json({ error: result.reason }, { status: 502 });
  return NextResponse.json({ ok: true });
}
