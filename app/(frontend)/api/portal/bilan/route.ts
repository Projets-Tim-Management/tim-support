import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { busyForPartner } from "@/modules/marketing/lib/calendar";
import { sessionSummary } from "@/modules/marketing/lib/journey";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { sendJourneyEmail } from "@/modules/marketing/lib/send";
import { bookingModeOf, generateSlots, resolveRules } from "@/modules/marketing/lib/scheduling";

import { takenForPartner } from "../rendez-vous/route";

/**
 * Créneaux du BILAN de fin de test, côté espace client.
 *
 * GET  → créneaux libres du partenaire, dans les derniers jours du test.
 * POST → réserve un créneau ({ at }) et crée l'événement dans son agenda.
 *
 * Mêmes garde-fous que la prise en main, pour les mêmes raisons :
 *  1. le partenaire et le parcours viennent de la SESSION, jamais du corps de la
 *     requête — un client ne peut pas réserver dans l'agenda d'un autre ;
 *  2. le créneau demandé est revérifié contre la liste générée à l'instant : ce
 *     contrôle unique ferme la date arbitraire, le conflit d'agenda et la
 *     double réservation.
 *
 * Ce qui change : la FENÊTRE. La prise en main s'arrête au démarrage du test —
 * c'est une préparation. Le bilan, lui, ne vit que dans les derniers jours, et
 * pas au-delà de la fin : un bilan après l'extinction des accès arrive quand le
 * client n'a plus rien à regarder.
 *
 * Il n'y a pas de formulaire de participants ici, contrairement à la prise en
 * main : les gens se connaissent déjà, ce sont ceux de la session.
 */
export const dynamic = "force-dynamic";

const CLOSED = ["gagne", "perdu", "annule"];

/** Le bilan ne s'ouvre que dans les derniers jours du test. */
const WINDOW_DAYS = 10;

type Run = {
  id: number | string;
  partner?: number | string;
  endDate?: string | null;
  reviewAt?: string | null;
  sessionMode?: string | null;
  sessionLocation?: string | null;
  reviewLink?: string | null;
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

  return { payload, run, partner, taken: await takenForPartner(payload, run.partner, run.id) };
}

/** Offre courante, bornée à la dernière ligne droite du test. */
async function currentSlots(
  payload: Awaited<ReturnType<typeof payloadClient>>,
  run: Run,
  partner: unknown,
  taken: string[],
): Promise<string[]> {
  const rules = (partner as { scheduling?: Record<string, unknown> } | null)?.scheduling;
  if (bookingModeOf(rules as never).mode !== "creneaux") return [];
  if (!run.endDate) return [];

  const resolved = resolveRules(rules as never);
  const from = new Date().toISOString();
  const to = new Date(Date.now() + resolved.horizonDays * 86_400_000).toISOString();

  const busy = run.partner
    ? await busyForPartner(payload, run.partner, from, to)
    : { periods: [], reliable: true };

  // Agenda illisible ⇒ aucun créneau : on ne propose pas une heure dont on ne
  // sait pas si elle est libre. Même règle que la prise en main.
  if (!busy.reliable) return [];

  const ouverture = Date.parse(run.endDate) - WINDOW_DAYS * 86_400_000;

  return generateSlots({
    rules: rules as never,
    nowMs: Date.now(),
    taken,
    busy: busy.periods,
    // Pas de bilan après la fin du test : les accès s'éteignent, il n'y aurait
    // plus rien à regarder ensemble.
    until: run.endDate,
  }).filter((slot) => Date.parse(slot) >= ouverture);
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
    booked: run.reviewAt ?? null,
    modality: sessionSummary(run as never),
    meetingUrl: run.sessionMode === "sur-place" ? null : (run.reviewLink ?? null),
    endDate: run.endDate ?? null,
  });
}

export async function POST(req: Request) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { at?: string } | null;
  const at = body?.at?.trim();
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
  if (!slots.includes(at)) {
    return NextResponse.json({ error: "slot_unavailable" }, { status: 409 });
  }

  // On n'enregistre QUE le créneau : l'événement d'agenda et le lien de visio
  // sont produits par le hook `syncReviewCalendar` du parcours. Un second
  // chemin de création serait un second chemin à corriger.
  await payload.update({
    collection: "journey-runs",
    id: run.id,
    data: { reviewAt: at },
    overrideAccess: true,
  });

  // Envoyée APRÈS l'écriture, pour que la confirmation porte le lien de visio :
  // `sendJourneyEmail` relit le parcours et voit ce que le hook vient d'écrire.
  await sendJourneyEmail(payload, { run: run as never, key: "bilan-confirme" });

  payload.logger.info(`[parcours] bilan réservé le ${at} (parcours ${run.id}).`);
  return NextResponse.json({ ok: true, at });
}
