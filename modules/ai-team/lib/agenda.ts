import { randomUUID } from "node:crypto";

import type { Payload } from "payload";

import { PARIS_TZ } from "@/core/lib/dates";
import { localMidnight, localParts } from "@/modules/ads/lib/zoned";
import { accessTokenFor, busyForPartner, getProvider, type BusyPeriod, type Connection, type StoredCalendar } from "@/modules/marketing/lib/calendar";

/**
 * LES CRÉNEAUX DE LA DIRECTION dans son agenda (équipe SEO/GEO, étape 1,
 * 12/11/2026 : « il les pose directement » — la direction les déplace si
 * besoin).
 *
 * Chaque objectif reçoit des blocs de travail (30 à 90 min) dans les heures
 * ouvrées de Paris (9 h–12 h 30, 14 h–18 h), sur les CINQ PROCHAINS JOURS
 * OUVRÉS — une revue lancée un jeudi soir ne tasse pas tout sur le vendredi
 * (constaté à la première revue, 12/11/2026) — sur les trous de l'agenda,
 * AVANT son échéance, dans l'ordre d'importance. Un
 * agenda illisible ne pose rien : un créneau posé sur un rendez-vous existant
 * serait pire que pas de créneau (voir busyForPartner).
 */

const WINDOWS: [number, number][] = [
  [9 * 60, 12 * 60 + 30],
  [14 * 60, 18 * 60],
];
const MIN_BLOCK = 30;
const MAX_BLOCK = 90;
const MIN_MS = 60_000;

export type Interval = { start: number; end: number };
/** `dueDay` : l'index, dans les jours du plan, du dernier jour où l'objectif peut être travaillé. */
export type PlanItem = { id: string; minutes: number; dueDay: number };
export type PlannedSlot = { id: string; start: Date; end: Date };
export type PlanDay = { date: string; midnight: Date };

/** Après cette heure (Paris), la journée en cours ne compte plus dans le plan : il démarre le jour ouvré suivant. */
const LATE_HOUR = 16;

/**
 * Les `n` prochains jours ouvrés (lundi → vendredi) à Paris : aujourd'hui s'il
 * est ouvré et qu'il est moins de 16 h, sinon à partir du jour ouvré suivant.
 * Pure (testée).
 */
export function planDays(now: Date, n = 5): PlanDay[] {
  const { y, m, d } = localParts(now, PARIS_TZ);
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: PARIS_TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
  const out: PlanDay[] = [];
  for (let i = 0; out.length < n && i < 14; i += 1) {
    const t = new Date(Date.UTC(y, m - 1, d + i));
    const wd = t.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    if (i === 0 && hour >= LATE_HOUR) continue;
    out.push({ date: t.toISOString().slice(0, 10), midnight: localMidnight(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate(), PARIS_TZ) });
  }
  return out;
}

/** Retire les périodes occupées d'un intervalle. Pure. */
function subtract(free: Interval[], busy: Interval[]): Interval[] {
  let out = free;
  for (const b of busy) {
    out = out.flatMap((f) => {
      if (b.end <= f.start || b.start >= f.end) return [f];
      return [
        ...(b.start > f.start ? [{ start: f.start, end: b.start }] : []),
        ...(b.end < f.end ? [{ start: b.end, end: f.end }] : []),
      ];
    });
  }
  return out;
}

/**
 * Place les objectifs, dans l'ordre, sur les trous de la semaine. Pure (testée).
 * Un objectif qui ne tient pas avant son échéance reçoit ce qui reste possible ;
 * `unplaced` dit combien de minutes n'ont pas trouvé de place.
 */
export function planSlots(input: { days: PlanDay[]; now: Date; busy: BusyPeriod[]; items: PlanItem[] }): { slots: PlannedSlot[]; unplaced: Record<string, number> } {
  const busy = input.busy.map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }));
  const days = input.days;
  // Les trous de chaque jour, à partir de maintenant (arrondi au quart d'heure suivant).
  const nowMs = Math.ceil(input.now.getTime() / (15 * MIN_MS)) * 15 * MIN_MS;
  const free: Interval[][] = days.map(({ midnight }) =>
    subtract(
      WINDOWS.map(([a, b]) => ({ start: Math.max(midnight.getTime() + a * MIN_MS, nowMs), end: midnight.getTime() + b * MIN_MS })).filter((w) => w.end - w.start >= MIN_BLOCK * MIN_MS),
      busy,
    ),
  );
  const slots: PlannedSlot[] = [];
  const unplaced: Record<string, number> = {};
  for (const item of input.items) {
    let left = item.minutes;
    for (let day = 0; day <= Math.min(days.length - 1, item.dueDay) && left > 0; day += 1) {
      const holes = free[day];
      for (let i = 0; i < holes.length && left > 0; i += 1) {
        const h = holes[i];
        const room = Math.floor((h.end - h.start) / MIN_MS);
        if (room < Math.min(MIN_BLOCK, left)) continue;
        const take = Math.min(MAX_BLOCK, left, room);
        const start = h.start;
        const end = start + take * MIN_MS;
        slots.push({ id: item.id, start: new Date(start), end: new Date(end) });
        left -= take;
        holes[i] = { start: end, end: h.end };
      }
    }
    if (left > 0) unplaced[item.id] = left;
  }
  return { slots, unplaced };
}

export type AgendaTarget = { connection: Connection & { partner?: unknown; calendars?: StoredCalendar[] }; calendarId: string };

/**
 * L'agenda de la direction : celui choisi sur la fiche du chef, sinon l'unique
 * agenda Google connecté en @tim-management.co (s'il n'y en a qu'un). Null :
 * aucun agenda utilisable — les objectifs restent sans créneau.
 */
export async function directionAgenda(payload: Payload, chosen: unknown): Promise<AgendaTarget | null> {
  const chosenId = chosen && typeof chosen === "object" ? (chosen as { id: unknown }).id : chosen;
  const res = await payload.find({
    collection: "calendar-connections",
    where: chosenId != null ? { id: { equals: chosenId } } : { and: [{ provider: { equals: "google" } }, { accountEmail: { like: "@tim-management.co" } }, { status: { equals: "ok" } }] },
    limit: 2,
    depth: 0,
    overrideAccess: true,
  });
  if (res.docs.length !== 1) return null;
  const connection = res.docs[0] as unknown as AgendaTarget["connection"];
  const cals = connection.calendars ?? [];
  const target = cals.find((c) => c.target && !c.readOnly) ?? cals.find((c) => !c.readOnly);
  return target ? { connection, calendarId: target.calendarId } : null;
}

export type BookedSlot = { start: string; end: string; eventId: string; link: string | null };
export type BookingResult = { status: "posés" | "sans-agenda" | "agenda-illisible"; byId: Record<string, BookedSlot[]>; unplaced: Record<string, number> };

/**
 * Pose les créneaux de la semaine dans l'agenda de la direction. `describe`
 * donne le titre et la description de l'événement d'un objectif.
 */
export async function bookWeek(
  payload: Payload,
  input: { chosenAgenda: unknown; days: PlanDay[]; now: Date; items: PlanItem[]; describe: (id: string) => { summary: string; description: string } },
): Promise<BookingResult> {
  const agenda = await directionAgenda(payload, input.chosenAgenda);
  const provider = agenda ? getProvider(agenda.connection.provider) : null;
  if (!agenda || !provider) return { status: "sans-agenda", byId: {}, unplaced: {} };
  const days = input.days;
  const partner = agenda.connection.partner && typeof agenda.connection.partner === "object" ? (agenda.connection.partner as { id: unknown }).id : agenda.connection.partner;
  const reading = await busyForPartner(payload, partner as number | string, days[0].midnight.toISOString(), new Date(days[days.length - 1].midnight.getTime() + 24 * 3600_000).toISOString());
  if (!reading.reliable) return { status: "agenda-illisible", byId: {}, unplaced: {} };
  const token = await accessTokenFor(payload, agenda.connection);
  if (!token) return { status: "agenda-illisible", byId: {}, unplaced: {} };
  const plan = planSlots({ days, now: input.now, busy: reading.periods, items: input.items });
  const byId: Record<string, BookedSlot[]> = {};
  for (const slot of plan.slots) {
    const { summary, description } = input.describe(slot.id);
    try {
      const ev = await provider.createEvent(token, { calendarId: agenda.calendarId, summary, description, start: slot.start.toISOString(), end: slot.end.toISOString(), attendees: [], online: false, requestId: randomUUID() });
      (byId[slot.id] ??= []).push({ start: slot.start.toISOString(), end: slot.end.toISOString(), eventId: ev.eventId, link: ev.htmlLink ?? null });
    } catch (err) {
      payload.logger.warn(`[équipe IA] créneau non posé dans l'agenda (${summary}) : ${err}`);
    }
  }
  return { status: "posés", byId, unplaced: plan.unplaced };
}

/** Retire de l'agenda les créneaux d'un objectif (abandonné). Ne lève pas. */
export async function unbook(payload: Payload, chosenAgenda: unknown, slots: BookedSlot[]): Promise<void> {
  if (!slots.length) return;
  try {
    const agenda = await directionAgenda(payload, chosenAgenda);
    const provider = agenda ? getProvider(agenda.connection.provider) : null;
    const token = agenda && provider ? await accessTokenFor(payload, agenda.connection) : null;
    if (!agenda || !provider || !token) return;
    await Promise.all(slots.map((s) => provider.deleteEvent(token, agenda.calendarId, s.eventId).catch(() => undefined)));
  } catch (err) {
    payload.logger.warn(`[équipe IA] créneaux non retirés de l'agenda : ${err}`);
  }
}
