import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { adminUrl, internalNotice } from "@/core/lib/email-template";
import { payloadClient } from "@/core/payload-client";
import { createRateLimiter, maskIp } from "@/modules/analytics/lib/video-views";
import { clientIp } from "@/modules/forms/lib/ingest";
import {
  APP_V2_BOOKING_UNTIL,
  APP_V2_DEFAULT_HOST,
  APP_V2_RULES,
  appV2HostId,
  appV2Path,
  openSlots,
} from "@/modules/marketing/lib/app-v2";
import { leadFromBooking } from "@/modules/marketing/lib/app-v2-lead";
import { accessTokenFor, busyForPartner, getProvider, targetConnection } from "@/modules/marketing/lib/calendar";
import { formatSlot, generateSlots, resolveRules } from "@/modules/marketing/lib/scheduling";
import { takenForPartner } from "../../portal/rendez-vous/route";

/**
 * Créneaux du tour de l'app mobile V2, sur la page publique
 * /app-mobile-v2/<interlocuteur>.
 *
 * GET  ?hote=…            → créneaux libres dans l'agenda de l'interlocuteur.
 * POST { hote, at, … }    → réserve un créneau, crée l'événement (Google Meet,
 *                           client invité) et prévient l'interlocuteur.
 *
 * Page publique, donc aucune session : l'interlocuteur vient de l'URL, mais il
 * n'est accepté que s'il figure dans la liste fermée APP_V2_HOSTS — on ne
 * réserve pas dans l'agenda de n'importe qui. Et comme pour l'espace
 * client, le créneau demandé est revérifié contre l'offre générée à l'instant —
 * ce seul contrôle ferme la date arbitraire, le conflit d'agenda et la double
 * réservation ; l'index unique sur `at` couvre les deux clics à la même seconde.
 */
export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE });

// Une personne réserve une fois ; dix essais à l'heure laissent la place aux
// erreurs de saisie sans ouvrir l'agenda à un script.
const limiter = createRateLimiter({ max: 10, windowMs: 60 * 60 * 1000 });

type Payload = Awaited<ReturnType<typeof payloadClient>>;

/** Créneaux déjà pris : les tours V2, plus les sessions des parcours. */
async function taken(payload: Payload, hostId: number): Promise<string[]> {
  const booked = await payload.find({
    collection: "presentation-bookings",
    where: { at: { greater_than: new Date().toISOString() } },
    limit: 500,
    depth: 0,
    overrideAccess: true,
  });
  return [
    ...booked.docs.map((d) => (d as { at?: string }).at).filter((v): v is string => Boolean(v)),
    ...(await takenForPartner(payload, hostId)),
  ];
}

async function currentSlots(payload: Payload, hostId: number): Promise<string[] | null> {
  const from = new Date().toISOString();
  const busy = await busyForPartner(payload, hostId, from, APP_V2_BOOKING_UNTIL);
  // Agenda illisible ⇒ aucun créneau (voir busyForPartner) : null, pour que
  // l'écran dise « momentanément indisponible » plutôt que « plus de place ».
  if (!busy.reliable) return null;
  const free = generateSlots({
    rules: APP_V2_RULES,
    nowMs: Date.now(),
    taken: await taken(payload, hostId),
    busy: busy.periods,
    until: APP_V2_BOOKING_UNTIL,
  });
  // Grille ENTIÈRE, depuis une date fixe : le choix des créneaux ouverts ne doit
  // dépendre ni de l'heure de la visite ni de ce qui est déjà pris.
  const open = openSlots(generateSlots({ rules: APP_V2_RULES, nowMs: GRID_FROM, until: APP_V2_BOOKING_UNTIL }));
  return free.filter((s) => open.has(s));
}

/** Point de départ de la grille de référence (mise en ligne de la page). */
const GRID_FROM = Date.parse("2026-10-23T00:00:00+02:00");

export async function GET(req: Request) {
  const hostId = appV2HostId(new URL(req.url).searchParams.get("hote") ?? APP_V2_DEFAULT_HOST);
  if (hostId == null) return fail("unknown_host", 404);
  const payload = await payloadClient();
  const slots = await currentSlots(payload, hostId);
  return NextResponse.json(
    { slots: slots ?? [], available: slots !== null, durationMin: resolveRules(APP_V2_RULES).durationMin },
    { headers: NO_STORE },
  );
}

type BookingBody = {
  /** Interlocuteur de la page (`cpiancatelli`) — vérifié contre APP_V2_HOSTS. */
  hote?: string;
  at?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  company?: string;
  message?: string;
  /** Champ leurre : invisible pour une personne, rempli par un robot. */
  website?: string;
};

/** Texte de formulaire : espaces retirés, longueur bornée, vide → null. */
const clean = (v: unknown, max: number): string | null => {
  const s = typeof v === "string" ? v.trim().slice(0, max) : "";
  return s || null;
};

const isEmail = (v: unknown): v is string =>
  typeof v === "string" && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v.trim());

export async function POST(req: Request) {
  let body: BookingBody | null = null;
  try {
    body = (await req.json()) as BookingBody;
  } catch {
    /* corps illisible */
  }
  if (!body) return fail("bad_body", 400);
  const hostSlug = body.hote ?? APP_V2_DEFAULT_HOST;
  const hostId = appV2HostId(hostSlug);
  if (hostId == null) return fail("unknown_host", 404);

  // Robot : on fait comme si tout allait bien, sans rien réserver.
  if (body.website) return NextResponse.json({ ok: true }, { headers: NO_STORE });

  const payload = await payloadClient();
  const { ip } = clientIp(req);
  if (ip && !limiter.hit(ip)) {
    payload.logger.warn(`[app-v2] débit de réservation dépassé pour ${maskIp(ip)}.`);
    return fail("rate_limited", 429);
  }

  const person = {
    firstName: clean(body.firstName, 60),
    lastName: clean(body.lastName, 60),
    email: isEmail(body.email) ? body.email.trim().toLowerCase() : null,
    phone: clean(body.phone, 30),
    company: clean(body.company, 120),
    message: clean(body.message, 1000),
  };
  if (!person.firstName || !person.lastName || !person.email || !person.company) {
    return fail("missing_fields", 400);
  }

  const at = body.at;
  if (!at) return fail("missing_slot", 400);
  const slots = await currentSlots(payload, hostId);
  if (slots === null) return fail("calendar_unavailable", 503);
  if (!slots.includes(at)) return fail("slot_unavailable", 409);

  let booking: { id: number | string };
  try {
    booking = await payload.create({
      collection: "presentation-bookings",
      data: { at, ...person } as never,
      overrideAccess: true,
    });
  } catch (err) {
    // L'index unique : quelqu'un vient de prendre ce créneau.
    payload.logger.warn(`[app-v2] réservation refusée sur ${at} : ${err}`);
    return fail("slot_unavailable", 409);
  }

  const durationMin = resolveRules(APP_V2_RULES).durationMin;
  const event = await createEvent(payload, hostId, booking.id, at, durationMin, person);
  if (event) {
    await payload
      .update({
        collection: "presentation-bookings",
        id: booking.id,
        data: { eventId: event.eventId, meetingUrl: event.meetingUrl ?? null } as never,
        overrideAccess: true,
      })
      .catch((err) => payload.logger.error(`[app-v2] lien de visio non enregistré sur ${booking.id} : ${err}`));
  }

  // Le rendez-vous devient un prospect (ou rejoint sa fiche) avec une tâche
  // datée : c'est là que l'équipe le traite. Un échec n'annule pas la
  // réservation — le créneau est pris, l'invitation est partie.
  const lead = await leadFromBooking(payload, {
    at,
    person,
    meetingUrl: event?.meetingUrl ?? null,
    hostId,
    path: appV2Path(hostSlug),
  }).catch((err) => {
    payload.logger.error(`[app-v2] prospect du rendez-vous ${booking.id} non créé : ${err}`);
    return null;
  });
  if (lead) {
    await payload
      .update({ collection: "presentation-bookings", id: booking.id, data: { client: lead.clientId } as never, overrideAccess: true })
      .catch(() => undefined);
  }

  await notifyHost(payload, hostId, appV2Path(hostSlug), booking.id, at, person, event?.meetingUrl ?? null, Boolean(event), lead);

  return NextResponse.json(
    { ok: true, booked: at, meetingUrl: event?.meetingUrl ?? null, invited: Boolean(event) },
    { headers: NO_STORE },
  );
}

type Person = {
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  company: string | null;
  message: string | null;
};

/**
 * Événement dans l'agenda de l'interlocuteur, client invité : Google envoie lui-même
 * l'invitation (avec le lien Meet), qui fait office de confirmation.
 *
 * Un échec ne défait PAS la réservation : le créneau est pris, Charlie est
 * prévenu que l'invitation est à envoyer à la main (voir notifyHost).
 */
async function createEvent(
  payload: Payload,
  hostId: number,
  id: number | string,
  at: string,
  durationMin: number,
  p: Person,
) {
  try {
    const target = await targetConnection(payload, hostId);
    const provider = target ? getProvider(target.connection.provider) : null;
    const token = target && provider ? await accessTokenFor(payload, target.connection) : null;
    if (!target || !provider || !token) {
      payload.logger.warn(`[app-v2] rendez-vous ${id} enregistré sans événement : agenda inaccessible.`);
      return null;
    }
    return await provider.createEvent(token, {
      calendarId: target.calendarId,
      summary: `Tour de l'app mobile V2 — ${p.company}`,
      description: [
        "Présentation de la V2 de l'application mobile Tim Management, avant sa mise en production.",
        "",
        `${p.firstName} ${p.lastName} — ${p.company}`,
        p.phone ? `Téléphone : ${p.phone}` : "",
        p.message ? `\nMessage : ${p.message}` : "",
      ]
        .filter((l) => l !== "")
        .join("\n"),
      start: at,
      end: new Date(Date.parse(at) + durationMin * 60_000).toISOString(),
      attendees: [p.email as string],
      online: true,
      requestId: `app-v2-${id}-${randomUUID()}`,
      runKey: `app-v2-${id}`,
    });
  } catch (err) {
    payload.logger.error(`[app-v2] création de l'événement du rendez-vous ${id} échouée : ${err}`);
    return null;
  }
}

/**
 * Charlie organise l'événement : Google ne le prévient pas de sa création. Sans
 * ce message, il découvrirait le rendez-vous en ouvrant son agenda.
 */
async function notifyHost(
  payload: Payload,
  hostId: number,
  path: string,
  id: number | string,
  at: string,
  p: Person,
  meetingUrl: string | null,
  invited: boolean,
  lead: { clientId: number | string; created: boolean } | null,
) {
  try {
    const host = (await payload
      .findByID({ collection: "partners", id: hostId, depth: 0, overrideAccess: true })
      .catch(() => null)) as { email?: string | null } | null;
    const to = host?.email?.trim();
    if (!to) {
      payload.logger.warn(`[app-v2] rendez-vous ${id} non notifié : aucune adresse sur la fiche partenaire.`);
      return;
    }
    const when = formatSlot(at);
    const who = `${p.firstName} ${p.lastName}`;
    // La fiche du prospect : c'est là que le rendez-vous se traite (tâche datée).
    const url = lead
      ? adminUrl(`/collections/partner-clients/${lead.clientId}`)
      : adminUrl(`/collections/presentation-bookings/${id}`);
    await payload.sendEmail({
      to,
      subject: `Tour de l'app V2 réservé — ${p.company}`,
      text: [
        `${who} (${p.company}) a réservé un tour de l'app mobile V2.`,
        "",
        `Quand : ${when}`,
        lead ? (lead.created ? "Nouveau prospect créé, avec une tâche datée." : "Ajouté à sa fiche client existante, avec une tâche datée.") : "",
        `E-mail : ${p.email}`,
        p.phone ? `Téléphone : ${p.phone}` : "",
        p.message ? `Message : ${p.message}` : "",
        meetingUrl ? `Visio : ${meetingUrl}` : "",
        invited ? "" : "⚠️ L'événement n'a pas pu être créé dans l'agenda : l'invitation est à envoyer à la main.",
        "",
        url,
      ]
        .filter((l) => l !== "")
        .join("\n"),
      html: internalNotice({
        kicker: `App mobile V2 · ${path}`,
        heading: "Tour de l'app V2 réservé",
        rows: [
          ["Société", p.company ?? ""],
          ["Contact", who],
          ["E-mail", p.email ?? ""],
          ...(p.phone ? ([["Téléphone", p.phone]] as [string, string][]) : []),
          ["Quand", when],
          ...(meetingUrl ? ([["Visio", meetingUrl]] as [string, string][]) : []),
        ],
        message: invited
          ? (p.message ?? "L'invitation est partie au client avec le lien de visio.")
          : "L'événement n'a pas pu être créé dans ton agenda : l'invitation est à envoyer à la main.",
        cta: { label: lead?.created ? "Ouvrir le nouveau prospect" : lead ? "Ouvrir la fiche client" : "Ouvrir le rendez-vous", url },
      }),
    });
  } catch (err) {
    payload.logger.error(`[app-v2] notification du rendez-vous ${id} échouée : ${err}`);
  }
}
