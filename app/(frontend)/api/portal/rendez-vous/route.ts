import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { busyForPartner } from "@/modules/marketing/lib/calendar";
import { sessionSummary } from "@/modules/marketing/lib/journey";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import {
  bookingModeOf,
  formatSlot,
  generateSlots,
  resolveRules,
} from "@/modules/marketing/lib/scheduling";

/**
 * Créneaux de la session de prise en main, côté espace client.
 *
 * GET  → créneaux libres du partenaire qui suit ce client.
 * POST → réserve un créneau ({ at }) et crée l'événement dans son agenda.
 *
 * Deux règles de sûreté :
 *  1. le partenaire et le parcours viennent de la SESSION, jamais du corps de la
 *     requête — un client ne peut pas réserver dans l'agenda d'un autre ;
 *  2. le créneau demandé est revérifié contre la liste générée à l'instant, et
 *     non simplement enregistré. Sans ça, n'importe quelle date passerait, et
 *     deux clients pourraient prendre le même créneau.
 */

const CLOSED = ["gagne", "perdu", "annule"];

type Run = {
  id: number | string;
  partner?: number | string;
  startDate?: string;
  sessionAt?: string;
  sessionMode?: string;
  sessionLocation?: string;
  sessionLink?: string;
};

async function context(clientId: number | string) {
  const payload = await payloadClient();

  const runs = await payload.find({
    collection: "journey-runs",
    where: { client: { equals: clientId }, status: { not_in: CLOSED } },
    sort: "-createdAt",
    limit: 1,
    depth: 0,
    overrideAccess: true,
  });
  const run = runs.docs[0] as Run | undefined;
  if (!run?.partner) return { payload, run, partner: null, taken: [] as string[] };

  const partner = await payload.findByID({
    collection: "partners",
    id: run.partner,
    depth: 0,
    overrideAccess: true,
  });

  // Créneaux déjà pris chez CE partenaire, tous clients confondus.
  const booked = await payload.find({
    collection: "journey-runs",
    where: { partner: { equals: run.partner }, sessionAt: { exists: true } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });
  const taken = booked.docs
    .filter((d) => String(d.id) !== String(run.id))
    .map((d) => (d as Run).sessionAt)
    .filter((v): v is string => Boolean(v));

  return { payload, run, partner, taken };
}

/** Offre courante, agendas connectés compris. */
async function currentSlots(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  run: Run,
  partner: unknown,
  taken: string[],
) {
  const rules = (partner as { scheduling?: Record<string, unknown> } | null)?.scheduling;
  // Mode « lien externe » ou prise de RDV désactivée : aucun créneau à produire.
  if (bookingModeOf(rules as never).mode !== "creneaux") return [];

  const resolved = resolveRules(rules as never);
  const from = new Date().toISOString();
  const to = new Date(Date.now() + resolved.horizonDays * 86_400_000).toISOString();

  // Indisponibilités réelles du partenaire. `busyForPartner` ne lève jamais :
  // un agenda muet fait retomber sur les règles seules plutôt que de bloquer.
  const busy = run.partner ? await busyForPartner(payload, run.partner, from, to) : [];

  return generateSlots({
    rules: rules as never,
    nowMs: Date.now(),
    taken,
    busy,
    // Inutile de proposer un créneau après le démarrage du test : la session
    // sert justement à le préparer.
    until: run.startDate,
  });
}

export async function GET() {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { payload, run, partner, taken } = await context(ctx.client.id);
  if (!run) return NextResponse.json({ error: "no_run" }, { status: 404 });

  const booking = bookingModeOf(
    (partner as { scheduling?: Record<string, unknown> } | null)?.scheduling as never,
  );

  return NextResponse.json({
    mode: booking.mode,
    bookingUrl: booking.bookingUrl,
    slots: await currentSlots(payload, run, partner, taken),
    booked: run.sessionAt ?? null,
    modality: sessionSummary(run),
    meetingUrl: run.sessionMode === "sur-place" ? null : (run.sessionLink ?? null),
    startDate: run.startDate ?? null,
  });
}

export async function POST(req: Request) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let at: string | undefined;
  try {
    at = (await req.json())?.at;
  } catch {
    /* corps illisible */
  }
  if (!at) return NextResponse.json({ error: "missing_slot" }, { status: 400 });

  const { payload, run, partner, taken } = await context(ctx.client.id);
  if (!run) return NextResponse.json({ error: "no_run" }, { status: 404 });

  if (
    bookingModeOf((partner as { scheduling?: Record<string, unknown> } | null)?.scheduling as never)
      .mode !== "creneaux"
  ) {
    return NextResponse.json({ error: "booking_external" }, { status: 409 });
  }

  const slots = await currentSlots(payload, run, partner, taken);

  // Le créneau doit exister dans l'offre COURANTE : ce contrôle unique ferme à
  // la fois la date arbitraire, le conflit d'agenda et la double réservation.
  if (!slots.includes(at)) {
    return NextResponse.json({ error: "slot_unavailable" }, { status: 409 });
  }

  // On n'enregistre QUE le créneau : l'événement d'agenda et le lien de visio
  // sont produits par le hook `syncSessionCalendar` du parcours. Les créer aussi
  // ici donnerait deux chemins à maintenir — et c'est précisément parce qu'il
  // n'y en avait qu'un (celui-ci) qu'un créneau saisi à la main dans le
  // back-office restait sans lien.
  await payload.update({
    collection: "journey-runs",
    id: run.id,
    data: { sessionAt: at },
    overrideAccess: true,
  });

  // Relecture : le lien est écrit par le hook APRÈS cette mise à jour, il n'est
  // donc pas dans le document qu'elle renvoie.
  const saved = (await payload
    .findByID({ collection: "journey-runs", id: run.id, depth: 0, overrideAccess: true })
    .catch(() => null)) as { sessionLink?: string | null; sessionEventId?: string | null } | null;

  payload.logger.info(
    `[agenda] créneau ${formatSlot(at)} réservé pour le parcours ${run.id}${
      saved?.sessionEventId ? " (événement créé)" : ""
    }.`,
  );

  return NextResponse.json({ ok: true, booked: at, meetingUrl: saved?.sessionLink ?? null });
}
