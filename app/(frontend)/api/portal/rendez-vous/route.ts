import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { busyForPartner } from "@/modules/marketing/lib/calendar";
import { sessionSummary } from "@/modules/marketing/lib/journey";
import { getPortalClient } from "@/modules/marketing/lib/portal-server";
import { notifyAdminsSessionBooked } from "@/modules/marketing/lib/notify";
import { markJourneyEmailSent, sendJourneyEmail } from "@/modules/marketing/lib/send";
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

  // Le compte de l'espace client : son adresse et son identité pré-remplissent
  // le formulaire tant que le client n'a pas déclaré quelqu'un d'autre.
  const ctxAccount = (await payload
    .findByID({
      collection: "client-portal-accounts",
      id: ctx.session.aid,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null)) as { email?: string; firstName?: string; lastName?: string } | null;

  const booking = bookingModeOf(
    (partner as { scheduling?: Record<string, unknown> } | null)?.scheduling as never,
  );

  return NextResponse.json({
    mode: booking.mode,
    bookingUrl: booking.bookingUrl,
    slots: await currentSlots(payload, run, partner, taken),
    booked: run.sessionAt ?? null,
    // De quoi pré-remplir le formulaire de réservation : l'espace client connaît
    // déjà la personne, la lui faire retaper serait une corvée sans objet.
    contact: {
      email: (run as { attendeeEmail?: string | null }).attendeeEmail ?? ctxAccount?.email ?? null,
      firstName: (run as { attendeeFirstName?: string | null }).attendeeFirstName ?? ctxAccount?.firstName ?? null,
      lastName: (run as { attendeeLastName?: string | null }).attendeeLastName ?? ctxAccount?.lastName ?? null,
      role: (run as { attendeeRole?: string | null }).attendeeRole ?? null,
    },
    // Les invités déclarés : le récapitulatif doit pouvoir confirmer QUI a été
    // convié, sinon le client n'a aucun moyen de vérifier ce qu'il a saisi.
    guests: ((run as { sessionGuests?: { email?: string; name?: string }[] }).sessionGuests ?? [])
      .filter((g) => g?.email)
      .map((g) => ({ email: g.email as string, name: g.name ?? null })),
    modality: sessionSummary(run),
    meetingUrl: run.sessionMode === "sur-place" ? null : (run.sessionLink ?? null),
    startDate: run.startDate ?? null,
  });
}

/** Nombre d'invités supplémentaires acceptés. Au-delà, ce n'est plus une session
 *  de prise en main mais une réunion, et l'agenda du partenaire n'est pas fait
 *  pour ça. */
const MAX_GUESTS = 8;

type BookingBody = {
  at?: string;
  attendee?: { firstName?: string; lastName?: string; role?: string; email?: string };
  guests?: { email?: string; name?: string }[];
};

/** Texte de formulaire : espaces retirés, longueur bornée, vide → null. */
const clean = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
};

const isEmail = (v: unknown): v is string =>
  typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

export async function POST(req: Request) {
  const ctx = await getPortalClient();
  if (!ctx) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: BookingBody | null = null;
  try {
    body = (await req.json()) as BookingBody;
  } catch {
    /* corps illisible */
  }
  const at = body?.at;
  if (!at) return NextResponse.json({ error: "missing_slot" }, { status: 400 });

  // Participants : nettoyés et bornés ICI, quoi qu'ait envoyé l'écran. Le
  // formulaire limite déjà le nombre d'invités, mais un formulaire n'est pas un
  // contrôle — et chaque adresse acceptée devient un invité d'agenda.
  const attendee = {
    attendeeFirstName: clean(body?.attendee?.firstName, 60),
    attendeeLastName: clean(body?.attendee?.lastName, 60),
    attendeeRole: clean(body?.attendee?.role, 80),
    attendeeEmail: isEmail(body?.attendee?.email) ? body!.attendee!.email!.trim() : null,
  };

  // Identité EXIGÉE, et vérifiée ici : sans elle, le partenaire reçoit un
  // rendez-vous avec une entreprise et personne en face, et l'événement d'agenda
  // n'a aucun invité à convier. L'écran l'impose déjà, mais un formulaire
  // n'empêche rien — un appel direct à cette route le contournerait.
  if (!attendee.attendeeFirstName || !attendee.attendeeLastName || !attendee.attendeeEmail) {
    return NextResponse.json({ error: "missing_attendee" }, { status: 400 });
  }

  const guests = (body?.guests ?? [])
    .filter((g) => isEmail(g?.email))
    .slice(0, MAX_GUESTS)
    .map((g) => ({ email: g.email!.trim(), name: clean(g.name, 60) }));

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
    // Les participants partent dans la MÊME écriture que le créneau : le hook
    // d'agenda se déclenche sur cette mise à jour, il doit donc déjà connaître
    // les invités. Écrits après, ils n'auraient pas été conviés.
    data: { sessionAt: at, ...attendee, sessionGuests: guests },
    overrideAccess: true,
  });

  // Relecture : le lien est écrit par le hook APRÈS cette mise à jour, il n'est
  // donc pas dans le document qu'elle renvoie.
  const saved = (await payload
    .findByID({ collection: "journey-runs", id: run.id, depth: 0, overrideAccess: true })
    .catch(() => null)) as { sessionLink?: string | null; sessionEventId?: string | null } | null;

  // Deux messages, deux destinataires, et aucun n'est facultatif.
  //
  // Le partenaire anime la session : il doit l'apprendre autrement qu'en
  // consultant son agenda. Le client vient de réserver : sans accusé de
  // réception, il ne sait pas si son clic a produit quelque chose — il n'était
  // prévenu que par l'invitation d'agenda, donc seulement si le partenaire avait
  // connecté son calendrier.
  //
  // Placés APRÈS la création de l'événement, pour que les messages portent le
  // lien de visio : `sendJourneyEmail` relit le parcours et voit donc l'état
  // écrit entre-temps par le hook d'agenda.
  await sendJourneyEmail(payload, {
    run,
    key: "creneau-confirme",
    // Les personnes DÉCLARÉES reçoivent la confirmation, pas seulement le compte
    // qui a réservé : celui-ci n'est pas forcément celui qu'on forme, et un
    // invité qui n'a rien reçu se présente ou ne se présente pas au hasard.
    // L'adresse du compte reste servie — `alsoTo` s'ajoute, ne remplace pas.
    alsoTo: [attendee.attendeeEmail, ...guests.map((g) => g.email)],
  });
  await sendJourneyEmail(payload, { run, key: "creneau-reserve" });

  // TIM aussi : la prise en main est l'étape qui conditionne la première semaine
  // du test, et l'équipe n'apprenait sa date qu'en ouvrant la fiche.
  await notifyAdminsSessionBooked(
    payload,
    { id: run.id },
    {
      clientId: ctx.client.id,
      clientName: ctx.client.companyName ?? null,
      partnerName: (partner as { displayName?: string } | null)?.displayName ?? null,
      when: at,
      modality: sessionSummary({ ...run, sessionAt: at } as never),
      attendees: [
        [attendee.attendeeFirstName, attendee.attendeeLastName].filter(Boolean).join(" ") +
          (attendee.attendeeRole ? ` (${attendee.attendeeRole})` : "") +
          ` — ${attendee.attendeeEmail}`,
        ...guests.map((g) => (g.name ? `${g.name} — ${g.email}` : g.email)),
      ],
    },
  );
  await markJourneyEmailSent(payload, run.id, "creneau-reserve-tim");

  payload.logger.info(
    `[agenda] créneau ${formatSlot(at)} réservé pour le parcours ${run.id}${
      saved?.sessionEventId ? " (événement créé)" : ""
    }.`,
  );

  return NextResponse.json({ ok: true, booked: at, meetingUrl: saved?.sessionLink ?? null });
}
