import { NextResponse } from "next/server";

import { hasAdminRole, isPartnerMetier, partnerIdOf } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { sessionSyncPatch, syncSessionEvent } from "@/modules/marketing/lib/session-calendar";

/**
 * Crée (ou recrée) l'événement d'agenda d'un créneau déjà réservé.
 *
 * POST { runId } → { action, sessionLink }
 *
 * POURQUOI CE BOUTON. L'événement naît normalement au moment où le client pose
 * son créneau. Si l'agenda du partenaire était injoignable ce jour-là — jeton
 * expiré, agenda connecté après coup — le créneau reste enregistré côté TIM,
 * mais sans événement ni lien de visio. Il fallait alors effacer puis reposer la
 * date pour relancer la synchronisation : une manipulation qui ressemble à une
 * bidouille, sur une donnée que le client a choisie.
 *
 * L'écriture repasse par la MÊME fonction que le hook : aucune seconde manière
 * de créer un événement, donc aucune divergence possible.
 */
export async function POST(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { runId } = (await req.json().catch(() => ({}))) as { runId?: number | string };
  if (runId == null) return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const run = (await payload
    .findByID({ collection: "journey-runs", id: String(runId), depth: 0, overrideAccess: true })
    .catch(() => null)) as
    | { id: number | string; partner?: unknown; sessionAt?: string | null; sessionEventId?: string | null }
    | null;
  if (!run) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const own = partnerIdOf(user);
  const partnerId =
    run.partner && typeof run.partner === "object" ? (run.partner as { id?: unknown }).id : run.partner;
  const allowed =
    hasAdminRole(user) || (isPartnerMetier(user) && String(own) === String(partnerId ?? ""));
  if (!allowed) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  if (!run.sessionAt) {
    return NextResponse.json(
      { error: "Aucun créneau n'est réservé : il n'y a rien à mettre à l'agenda." },
      { status: 400 },
    );
  }

  // `previousSessionAt` volontairement nul : on force la création, c'est tout
  // l'objet du bouton.
  const result = await syncSessionEvent(payload, run as never, null);

  /**
   * On écrit ce qu'on a appris AVANT de décider de la réponse, y compris en
   * échec : un identifiant d'événement devenu invalide doit être oublié, sinon
   * toutes les tentatives suivantes s'acharneraient sur un fantôme.
   *
   * Cette écriture réveille le hook du parcours, qui verra un créneau sans
   * événement et retentera une création. C'est voulu : soit l'agenda est
   * toujours injoignable et la tentative échoue de la même façon, sans
   * conséquence, soit la panne était passagère et l'événement finit par exister.
   */
  const patch = sessionSyncPatch(result);
  if (Object.keys(patch).length > 0) {
    await payload.update({
      collection: "journey-runs",
      id: run.id,
      data: patch,
      overrideAccess: true,
    });
  }

  if (result.action === "none") {
    return NextResponse.json(
      {
        error:
          "L'agenda n'a pas pu être joint. Vérifiez qu'un agenda est connecté et désigné comme cible sur la fiche du partenaire, puis réessayez.",
      },
      { status: 502 },
    );
  }

  payload.logger.info(
    `[agenda] parcours ${run.id} : événement ${result.action} à la demande${result.sessionLink ? " (lien obtenu)" : ""}.`,
  );
  return NextResponse.json({
    ok: true,
    action: result.action,
    eventId: result.sessionEventId ?? null,
    sessionLink: result.sessionLink ?? null,
  });
}
