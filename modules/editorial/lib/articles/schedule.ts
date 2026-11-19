import { parisNow } from "@/modules/ads/agent/followup";

/**
 * LES CRÉNEAUX DE PUBLICATION (décision de Charlie, 18/11/2026) : au plus 2
 * articles par semaine, le MARDI et le JEUDI à 9 h (heure de Paris). Un article
 * prêt (texte validé, image déposée) prend le premier créneau libre ; sans
 * article prêt, rien ne part et le planning glisse. Pur (testé).
 */

export const SLOT_WEEKDAYS = [2, 4]; // mardi, jeudi (1 = lundi)
export const SLOT_HOUR = 9;

/** L'instant UTC de « AAAA-MM-JJ à `hour` h, heure de Paris » (heure d'été comprise). */
export function parisInstant(day: string, hour: number): Date {
  for (const offset of [1, 2]) {
    const d = new Date(`${day}T${String(hour - offset).padStart(2, "0")}:00:00Z`);
    const p = parisNow(d);
    if (p.date === day && p.hour === hour) return d;
  }
  return new Date(`${day}T${String(hour - 1).padStart(2, "0")}:00:00Z`);
}

/** Les prochains créneaux après `now` (mardi et jeudi 9 h, Paris). */
export function upcomingSlots(now: Date, count = 8): Date[] {
  const out: Date[] = [];
  const start = Date.parse(`${parisNow(now).date}T12:00:00Z`);
  for (let i = 0; out.length < count && i < 60; i++) {
    const day = new Date(start + i * 86_400_000).toISOString().slice(0, 10);
    if (!SLOT_WEEKDAYS.includes(parisNow(new Date(`${day}T12:00:00Z`)).weekday)) continue;
    const slot = parisInstant(day, SLOT_HOUR);
    if (slot.getTime() > now.getTime()) out.push(slot);
  }
  return out;
}

/** Le premier créneau libre (aucun article déjà programmé ce jour-là). */
export function firstFreeSlot(taken: (string | Date | null | undefined)[], now: Date): Date {
  const busy = new Set(taken.filter(Boolean).map((t) => parisNow(new Date(t as string | Date)).date));
  return upcomingSlots(now, 60).find((s) => !busy.has(parisNow(s).date)) as Date;
}
