import { parseTime, rangesForDate, resolveRules, utcToZonedParts, zonedTimeToUtc, type DateOverride, type WeeklyHours } from "@/modules/marketing/lib/scheduling";

import type { Distribution } from "@/modules/booking/lib/constants";

/**
 * LES CRÉNEAUX d'un type de rendez-vous, comme Calendly : les horaires du type (semaine type et exceptions datées, en
 * heure de Paris), un départ toutes les `incrementMin` minutes, la durée, une pause avant et après, un délai minimum,
 * une fenêtre de N jours, un maximum par jour — et, pour CHAQUE membre de l'équipe qui reçoit, ses occupations
 * (son agenda connecté et ses rendez-vous déjà pris, tous types confondus). Un créneau est proposé dès qu'au moins un
 * membre est libre ; on garde qui l'est, pour le choisir à la réservation.
 *
 * Pur : testé sans base ni agenda.
 */

export type SlotRules = {
  hours?: WeeklyHours | null;
  dateOverrides?: DateOverride[] | null;
  durationMin: number;
  incrementMin?: number | null;
  bufferBeforeMin?: number | null;
  bufferAfterMin?: number | null;
  minNoticeHours?: number | null;
  horizonDays?: number | null;
  /** Rendez-vous de CE type au plus, par membre et par jour (vide : sans limite). */
  maxPerDay?: number | null;
  /** Rien le jour même : le premier créneau est demain (16/11/2026). */
  noSameDay?: boolean | null;
  /** Quelques créneaux seulement par jour, en nombre variable (un agenda qui paraît demandé). Voir `openSlots`. */
  limitedSlots?: boolean | null;
  /** Une graine propre au type : deux types n'ouvrent pas les mêmes heures. */
  seed?: string;
};

export type HostLoad = {
  id: string;
  /** Périodes occupées : agenda connecté, et rendez-vous déjà pris (tous types). */
  busy: { start: string; end: string }[];
  /** Ses rendez-vous de CE type (pour le maximum par jour et la répartition). */
  sameType: { start: string }[];
};

export type Slot = { at: string; hosts: string[] };

const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const dayKey = (ms: number) => {
  const p = utcToZonedParts(ms);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
};

export function computeSlots(rules: SlotRules, hosts: HostLoad[], nowMs: number): Slot[] {
  const r = resolveRules({ hours: rules.hours, dateOverrides: rules.dateOverrides });
  const duration = Math.max(5, rules.durationMin);
  const step = Math.max(5, rules.incrementMin || duration);
  const before = Math.max(0, rules.bufferBeforeMin ?? 0);
  const after = Math.max(0, rules.bufferAfterMin ?? 0);
  let earliest = nowMs + Math.max(0, rules.minNoticeHours ?? 0) * 60 * MIN;
  if (rules.noSameDay) {
    const t = utcToZonedParts(nowMs + DAY);
    earliest = Math.max(earliest, zonedTimeToUtc(t.year, t.month, t.day, 0, 0));
  }
  // La fenêtre se compte en JOURS entiers (comme Calendly) : « 30 jours » va jusqu'au soir du 30e jour.
  const horizon = Math.max(0, rules.horizonDays ?? 30);
  const busy = hosts.map((h) => ({
    id: h.id,
    ranges: h.busy.map((b) => [Date.parse(b.start), Date.parse(b.end)] as const).filter(([s, e]) => Number.isFinite(s) && Number.isFinite(e) && e > s),
    perDay: h.sameType.reduce((m, b) => m.set(dayKey(Date.parse(b.start)), (m.get(dayKey(Date.parse(b.start))) ?? 0) + 1), new Map<string, number>()),
  }));
  const out: Slot[] = [];
  for (let d = 0; d <= horizon; d++) {
    const { year, month, day } = utcToZonedParts(nowMs + d * DAY);
    const iso = ((new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7) + 1;
    const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    for (const range of rangesForDate(r, year, month, day, iso)) {
      const a = parseTime(range.start);
      const b = parseTime(range.end);
      if (a == null || b == null || b <= a) continue;
      const rangeEnd = zonedTimeToUtc(year, month, day, Math.floor(b / 60), b % 60);
      for (let m = a; m + duration <= b; m += step) {
        const start = zonedTimeToUtc(year, month, day, Math.floor(m / 60), m % 60);
        const end = start + duration * MIN;
        if (start < earliest || end > rangeEnd) continue;
        const lo = start - before * MIN;
        const hi = end + after * MIN;
        const free = busy.filter((h) => (!rules.maxPerDay || (h.perDay.get(key) ?? 0) < rules.maxPerDay) && !h.ranges.some(([s, e]) => s < hi && e > lo)).map((h) => h.id);
        if (free.length) out.push({ at: new Date(start).toISOString(), hosts: free });
      }
    }
  }
  // Un jour peut apparaître deux fois si ses plages se chevauchent : un créneau, une fois.
  const seen = new Set<string>();
  const unique = out.filter((s) => (seen.has(s.at) ? false : (seen.add(s.at), true))).sort((x, y) => x.at.localeCompare(y.at));
  if (!rules.limitedSlots) return unique;
  // Les heures ouvertes se décident sur la grille ENTIÈRE du jour (sans les occupations) : un créneau réservé
  // disparaît sans être remplacé, et l'offre fond pour de vrai.
  const grid = computeSlots({ ...rules, limitedSlots: false, maxPerDay: null }, [{ id: "grille", busy: [], sameType: [] }], nowMs).map((x) => x.at);
  // Jamais deux horaires proposés collés : au moins la durée plus la pause entre deux départs ouverts.
  const gap = (duration + Math.max(before, after)) * MIN;
  const open = openSlots(grid, rules.seed ?? "", gap);
  return unique.filter((x) => open.has(x.at));
}

/**
 * Le nombre de créneaux ouverts un jour donné (comme l'ancienne page V2, décision du 23/10/2026) : trois le plus
 * souvent, parfois quatre ou cinq, parfois un ou deux. Une offre resserrée et irrégulière se lit comme un agenda
 * demandé. Tiré une fois pour toutes par jour : les mêmes heures à chaque visite.
 */
const WEIGHTS: [count: number, weight: number][] = [
  [1, 1],
  [2, 2],
  [3, 4],
  [4, 2],
  [5, 1],
];
const hash = (str: string): number => {
  let h = 2166136261;
  for (let i = 0; i < str.length; i += 1) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
};
const countFor = (key: string): number => {
  const total = WEIGHTS.reduce((n, [, w]) => n + w, 0);
  let pick = hash(`jour-${key}`) % total;
  for (const [count, weight] of WEIGHTS) {
    if (pick < weight) return count;
    pick -= weight;
  }
  return 3;
};

/**
 * Les créneaux ouverts d'une grille : par jour (heure de Paris), autant que `countFor` en accorde, tirés au hasard
 * mais fixes pour un jour donné — différents d'un jour et d'une semaine à l'autre —, et espacés d'au moins `gapMs`
 * (deux rendez-vous ne se suivent jamais). Pur (testé).
 */
export function openSlots(grid: string[], seed: string, gapMs = 0): Set<string> {
  const byDay = new Map<string, string[]>();
  for (const at of grid) byDay.set(dayKey(Date.parse(at)), [...(byDay.get(dayKey(Date.parse(at))) ?? []), at]);
  const open = new Set<string>();
  for (const [day, list] of byDay) {
    const want = countFor(`${seed}|${day}`);
    const picked: number[] = [];
    for (const at of [...list].sort((a, b) => hash(`${seed}|${a}`) - hash(`${seed}|${b}`))) {
      if (picked.length >= want) break;
      const t = Date.parse(at);
      if (picked.every((p) => Math.abs(p - t) >= gapMs)) {
        picked.push(t);
        open.add(at);
      }
    }
  }
  return open;
}

/**
 * Qui prend le rendez-vous parmi les membres libres : « disponibilité », le premier libre dans l'ordre de la liste
 * (la priorité) ; « répartition égale », celui qui a le moins de rendez-vous de ce type sur 30 jours (passés et à
 * venir), puis l'ordre de la liste. Pur (testé).
 */
export function pickHost(free: string[], order: string[], hosts: HostLoad[], at: string, distribution: Distribution): string | null {
  if (!free.length) return null;
  const t = Date.parse(at);
  const load = new Map(hosts.map((h) => [h.id, h]));
  const score = (id: string) => {
    const h = load.get(id);
    if (!h) return 0;
    return distribution === "equilibre" ? h.sameType.filter((b) => Math.abs(Date.parse(b.start) - t) <= 30 * DAY).length : 0;
  };
  const rank = (id: string) => (order.indexOf(id) < 0 ? order.length : order.indexOf(id));
  return [...free].sort((a, b) => score(a) - score(b) || rank(a) - rank(b))[0];
}
