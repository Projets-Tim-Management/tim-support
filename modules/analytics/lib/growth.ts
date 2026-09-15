import { round2 } from "@/modules/partner/lib/format";
import { monthKey, monthStart } from "@/modules/partner/lib/month";

/**
 * Outils communs des analyses : variations, séries mensuelles, moyennes.
 * Purs, sans date implicite — « maintenant » est toujours passé en paramètre.
 */

/** Une variation : la valeur de la période, celle d'avant, et le % (null si rien avant). */
export type Delta = { current: number; previous: number; pct: number | null };

export const delta = (current: number, previous: number): Delta => ({
  current: round2(current),
  previous: round2(previous),
  pct: previous > 0 ? round2(((current - previous) / previous) * 100) : null,
});

/** Les `months` derniers mois (1er du mois, ISO), du plus ancien au mois en cours. */
export function lastMonths(months: number, now: Date): string[] {
  const out: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    out.push(monthStart(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))));
  }
  return out;
}

/** Début (inclus) de la période de `months` mois qui se termine maintenant, et de la précédente. */
export function periodBounds(months: number, now: Date): { from: number; prevFrom: number } {
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1);
  const prevFrom = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2 * months + 1, 1);
  return { from, prevFrom };
}

/** Compte des éléments par mois (clé = 1er du mois ISO) sur `months` mois, série continue. */
export function countByMonth<T>(items: T[], dateOf: (t: T) => string | null | undefined, months: number, now: Date): { month: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const it of items) {
    const d = dateOf(it);
    if (!d) continue;
    const k = monthKey(d);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  return lastMonths(months, now).map((m) => ({ month: m, count: counts.get(monthKey(m)) ?? 0 }));
}

/** Variation « période vs période précédente » d'un compte d'événements datés. */
export function periodDelta<T>(items: T[], dateOf: (t: T) => string | null | undefined, months: number, now: Date): Delta {
  const { from, prevFrom } = periodBounds(months, now);
  let cur = 0;
  let prev = 0;
  for (const it of items) {
    const d = dateOf(it);
    if (!d) continue;
    const t = Date.parse(d);
    if (t >= from) cur += 1;
    else if (t >= prevFrom) prev += 1;
  }
  return delta(cur, prev);
}

export const DAY_MS = 86_400_000;

export const daysBetween = (a: string | number, b: string | number): number =>
  ((typeof b === "number" ? b : Date.parse(b)) - (typeof a === "number" ? a : Date.parse(a))) / DAY_MS;

export const average = (xs: number[]): number | null => (xs.length ? round2(xs.reduce((s, x) => s + x, 0) / xs.length) : null);

export const median = (xs: number[]): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return round2(s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2);
};

/** Un compte par clé, rendu en liste triée décroissante avec libellés. */
export function tally<T>(items: T[], keyOf: (t: T) => string | null | undefined, labelOf: (key: string) => string): { key: string; label: string; count: number }[] {
  const m = new Map<string, number>();
  for (const it of items) {
    const k = keyOf(it) ?? "";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([key, count]) => ({ key, label: labelOf(key), count })).sort((a, b) => b.count - a.count);
}
