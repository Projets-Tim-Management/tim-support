/**
 * Créneaux de la session de prise en main — génération à partir des règles du
 * partenaire.
 *
 * Tant qu'aucun agenda n'est connecté, ce sont ces règles QUI FONT les créneaux :
 * le partenaire décrit ses disponibilités une fois, et le client réserve dans
 * son espace. Aucune saisie de créneau à la main, aucune liste à tenir à jour.
 * Quand l'OAuth arrivera, ces mêmes règles resteront la base — les agendas
 * viendront seulement en RETIRER ce qui est déjà occupé.
 *
 * ⚠️ Tout est raisonné en heure de PARIS puis stocké en UTC : un partenaire qui
 * dit « 9 h » veut dire 9 h chez lui, pas 9 h UTC (2 h d'écart l'été).
 */

export const TIMEZONE = "Europe/Paris";

/** Jours de la semaine, en numérotation ISO (1 = lundi, 7 = dimanche). */
export const WEEKDAY_OPTIONS = [
  { label: "Lundi", value: "1" },
  { label: "Mardi", value: "2" },
  { label: "Mercredi", value: "3" },
  { label: "Jeudi", value: "4" },
  { label: "Vendredi", value: "5" },
  { label: "Samedi", value: "6" },
  { label: "Dimanche", value: "7" },
] as const;

/** Initiale affichée devant chaque jour dans l'éditeur de disponibilités. */
export const WEEKDAY_INITIALS: Record<string, string> = {
  "1": "L", "2": "M", "3": "M", "4": "J", "5": "V", "6": "S", "7": "D",
};

/** Heures proposées, par demi-heure — évite un champ libre à valider. */
export const HOUR_OPTIONS = Array.from({ length: 33 }, (_, i) => {
  const minutes = 6 * 60 + i * 30; // 06:00 → 22:00
  const label = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { label, value: label };
});

/**
 * Une plage de disponibilité, en heure locale : « 09:00 » → « 12:00 ».
 */
export type TimeRange = { start: string; end: string };

/**
 * Disponibilités hebdomadaires : pour chaque jour ISO, ses plages.
 *
 * Un jour ABSENT ou à liste vide est un jour non travaillé. C'est ce qui
 * remplace l'ancien couple « jours cochés + une plage horaire commune » : ce
 * modèle-là ne savait pas dire « lundi matin seulement », alors que c'est la
 * situation ordinaire de quelqu'un qui a aussi un métier à exercer.
 */
export type WeeklyHours = Record<string, TimeRange[]>;

/**
 * Exception à une date précise — congé, jour férié, journée déplacée.
 *
 * `ranges: []` ferme la journée. Sinon, ces plages REMPLACENT celles du jour de
 * semaine correspondant : une exception n'ajoute jamais, elle se substitue.
 * Sans quoi « je travaille exceptionnellement le samedi matin » et « ce lundi-là
 * je ne suis là que le matin » ne pourraient pas s'exprimer tous les deux.
 */
export type DateOverride = { date: string; ranges: TimeRange[] };

/** Semaine par défaut : lundi → vendredi, 9 h – 18 h. */
export const DEFAULT_HOURS: WeeklyHours = {
  "1": [{ start: "09:00", end: "18:00" }],
  "2": [{ start: "09:00", end: "18:00" }],
  "3": [{ start: "09:00", end: "18:00" }],
  "4": [{ start: "09:00", end: "18:00" }],
  "5": [{ start: "09:00", end: "18:00" }],
};

/**
 * Comment le client réserve sa session.
 *
 * Deux façons de faire, au choix du partenaire :
 *  - `creneaux` : TIM propose des créneaux, calculés depuis ses règles et son
 *    agenda connecté. Le rendez-vous est connu, daté et suivi dans le parcours.
 *  - `lien`     : le partenaire garde son propre outil (Calendly, Cal.com,
 *    Microsoft Bookings…). TIM se contente de renvoyer le client vers ce lien.
 *
 * ⚠️ Compromis assumé du mode `lien` : la réservation se passe HORS de TIM, donc
 * la date retenue n'est pas connue automatiquement. Le partenaire renseigne le
 * créneau sur la phase de test s'il veut qu'il apparaisse dans le parcours.
 */
export const BOOKING_MODES = [
  { label: "Créneaux dans l'espace client", value: "creneaux" },
  { label: "Lien externe (Calendly, Cal.com…)", value: "lien" },
] as const;

export type BookingMode = (typeof BOOKING_MODES)[number]["value"];

export type SchedulingRules = {
  enabled?: boolean | null;
  mode?: string | null;
  bookingUrl?: string | null;
  /** Disponibilités par jour de semaine. Vide = on retombe sur DEFAULT_HOURS. */
  hours?: WeeklyHours | null;
  /** Exceptions datées, prioritaires sur la semaine type. */
  dateOverrides?: DateOverride[] | null;
  durationMin?: number | null;
  bufferMin?: number | null;
  minNoticeHours?: number | null;
  horizonDays?: number | null;
};

/**
 * Règles effectives — toutes les valeurs présentes et non nulles.
 * Type distinct de `SchedulingRules` : `Required<>` retire l'optionnalité mais
 * conserverait les `| null`, ce qui obligerait à re-tester partout en aval.
 */
export type ResolvedRules = {
  hours: WeeklyHours;
  dateOverrides: DateOverride[];
  durationMin: number;
  bufferMin: number;
  minNoticeHours: number;
  horizonDays: number;
};

export const DEFAULT_RULES: ResolvedRules = {
  hours: DEFAULT_HOURS,
  dateOverrides: [],
  durationMin: 45,
  bufferMin: 15,
  minNoticeHours: 24,
  horizonDays: 15,
};

/** Un nombre exploitable, sinon le défaut : couvre null, undefined et absurde. */
const num = (value: unknown, fallback: number, min: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= min ? value : fallback;

/** « HH:MM » → minutes depuis minuit, ou null si la forme ne tient pas. */
export const parseTime = (value?: string | null): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(value ?? "").trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
};

/**
 * Nettoie une liste de plages : formes valides, fin après début, tri, puis
 * FUSION des chevauchements.
 *
 * Sans la fusion, « 09:00–12:00 » et « 11:00–13:00 » saisies toutes les deux
 * produiraient deux fois le créneau de 11 h. On ne refuse pas la saisie — un
 * partenaire qui se corrige ne doit pas être bloqué —, on la rend cohérente.
 */
export const normalizeRanges = (ranges?: TimeRange[] | null): TimeRange[] => {
  const parsed = (ranges ?? [])
    .map((r) => ({ start: parseTime(r?.start), end: parseTime(r?.end) }))
    .filter((r): r is { start: number; end: number } => r.start !== null && r.end !== null && r.end > r.start)
    .sort((a, b) => a.start - b.start);

  const merged: { start: number; end: number }[] = [];
  for (const range of parsed) {
    const last = merged[merged.length - 1];
    if (last && range.start <= last.end) last.end = Math.max(last.end, range.end);
    else merged.push({ ...range });
  }

  const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
  return merged.map((r) => ({ start: fmt(r.start), end: fmt(r.end) }));
};

/**
 * Semaine effective.
 *
 * Le repli sur la semaine par défaut ne vaut QUE pour un partenaire qui n'a
 * jamais rien réglé — champ absent ou objet vide. Dès qu'il a saisi quelque
 * chose, on s'en tient à ce qu'il a dit, même si le nettoyage n'en laisse rien.
 *
 * La nuance a du poids : replier une saisie devenue invalide sur « lundi à
 * vendredi, 9 h – 18 h » reviendrait à publier au nom du partenaire des
 * disponibilités qu'il n'a jamais annoncées. Mieux vaut ne rien proposer — il le
 * voit immédiatement dans l'aperçu, juste sous l'éditeur.
 */
export const resolveHours = (hours?: WeeklyHours | null): WeeklyHours => {
  if (!hours || Object.keys(hours).length === 0) return DEFAULT_HOURS;
  const clean: WeeklyHours = {};
  for (const { value } of WEEKDAY_OPTIONS) {
    const day = normalizeRanges(hours[value]);
    if (day.length) clean[value] = day;
  }
  return clean;
};

/** Complète les règles d'un partenaire avec les défauts. */
export const resolveRules = (rules?: SchedulingRules | null): ResolvedRules => ({
  hours: resolveHours(rules?.hours),
  dateOverrides: (rules?.dateOverrides ?? [])
    .filter((o) => /^\d{4}-\d{2}-\d{2}$/.test(String(o?.date ?? "")))
    .map((o) => ({ date: o.date, ranges: normalizeRanges(o.ranges) })),
  durationMin: num(rules?.durationMin, DEFAULT_RULES.durationMin, 5),
  bufferMin: num(rules?.bufferMin, DEFAULT_RULES.bufferMin, 0),
  minNoticeHours: num(rules?.minNoticeHours, DEFAULT_RULES.minNoticeHours, 0),
  horizonDays: num(rules?.horizonDays, DEFAULT_RULES.horizonDays, 1),
});

/**
 * Plages ouvertes un jour donné, exceptions comprises.
 *
 * L'exception datée l'emporte TOUJOURS, y compris quand elle est vide : c'est
 * ainsi qu'on ferme un jour férié tombant un mardi ouvré.
 */
export const rangesForDate = (
  rules: ResolvedRules,
  year: number,
  month: number,
  day: number,
  isoDay: number,
): TimeRange[] => {
  const key = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const override = rules.dateOverrides.find((o) => o.date === key);
  if (override) return override.ranges;
  return rules.hours[String(isoDay)] ?? [];
};

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

/**
 * Décalage du fuseau (en ms) à un instant donné. Mesuré via Intl plutôt que
 * codé en dur : gère l'heure d'été sans table de correspondance.
 */
const zoneOffsetMs = (utcMs: number, timeZone = TIMEZONE): number => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // `hour` peut valoir 24 à minuit selon les implémentations.
  const hour = get("hour") % 24;
  const asIfUTC = Date.UTC(get("year"), get("month") - 1, get("day"), hour, get("minute"), get("second"));
  return asIfUTC - utcMs;
};

/** Instant UTC correspondant à une heure locale de Paris. */
export const zonedTimeToUtc = (
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): number => {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // Deux passes : la première approximation peut tomber du mauvais côté d'un
  // changement d'heure, la seconde converge.
  const once = guess - zoneOffsetMs(guess);
  return guess - zoneOffsetMs(once);
};

/** Composantes calendaires locales (Paris) d'un instant UTC. */
export const utcToZonedParts = (utcMs: number) => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIMEZONE,
    hour12: false,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(utcMs));
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    year: Number(get("year")),
    month: Number(get("month")),
    day: Number(get("day")),
  };
};

/** Jour ISO (1 = lundi … 7 = dimanche) d'un instant, en heure de Paris. */
const isoWeekday = (utcMs: number): number => {
  const { year, month, day } = utcToZonedParts(utcMs);
  const d = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return d === 0 ? 7 : d;
};

/**
 * Créneaux proposables, en ISO UTC.
 *
 * @param rules   règles du partenaire (les valeurs manquantes prennent le défaut)
 * @param nowMs   instant de référence (injecté : rend la fonction testable)
 * @param taken   créneaux déjà réservés, en ISO — retirés du résultat
 * @param until   borne haute facultative (ex. le lundi de démarrage du test)
 */
export function generateSlots({
  rules,
  nowMs,
  taken = [],
  busy = [],
  until,
}: {
  rules?: SchedulingRules | null;
  nowMs: number;
  taken?: string[];
  /** Périodes occupées lues dans les agendas connectés du partenaire. */
  busy?: { start: string; end: string }[];
  until?: string | null;
}): string[] {
  const r = resolveRules(rules);
  const { durationMin: duration, bufferMin: buffer, horizonDays: horizon } = r;

  const earliest = nowMs + r.minNoticeHours * 60 * MINUTE;
  const latest = Math.min(nowMs + horizon * DAY, until ? Date.parse(until) : Infinity);
  if (!(latest > earliest)) return [];

  const takenSet = new Set(taken.map((t) => Date.parse(t)).filter((n) => !Number.isNaN(n)));

  // Périodes occupées de l'agenda : un créneau est écarté dès qu'il CHEVAUCHE
  // l'une d'elles, même partiellement — un rendez-vous de 9 h 30 à 10 h rend le
  // créneau de 9 h indisponible tout autant qu'un rendez-vous de 9 h pile.
  const busyRanges = busy
    .map((b) => ({ start: Date.parse(b.start), end: Date.parse(b.end) }))
    .filter((b) => !Number.isNaN(b.start) && !Number.isNaN(b.end) && b.end > b.start);

  const step = duration + buffer;
  const out: string[] = [];

  // On balaie jour par jour depuis aujourd'hui, en heure locale.
  for (let dayOffset = 0; dayOffset <= horizon; dayOffset += 1) {
    const { year, month, day } = utcToZonedParts(nowMs + dayOffset * DAY);
    const dayStart = zonedTimeToUtc(year, month, day, 0, 0);

    // Chaque plage du jour est parcourue pour elle-même : le pas repart de son
    // début. Sinon une matinée 08:00–09:30 et une soirée 18:30–19:00 seraient
    // traitées comme un seul bloc de 8 h à 19 h.
    for (const range of rangesForDate(r, year, month, day, isoWeekday(dayStart))) {
      const from = parseTime(range.start);
      const to = parseTime(range.end);
      if (from === null || to === null) continue;

      for (let minutes = from; minutes + duration <= to; minutes += step) {
        const at = zonedTimeToUtc(year, month, day, Math.floor(minutes / 60), minutes % 60);
        if (at < earliest || at > latest) continue;
        if (takenSet.has(at)) continue;

        const ends = at + duration * MINUTE;
        if (busyRanges.some((b) => at < b.end && ends > b.start)) continue;

        out.push(new Date(at).toISOString());
      }
    }
  }

  return out;
}

/**
 * Comment ce partenaire fait réserver ses sessions — une seule lecture des
 * règles, partagée par l'écran de réglage, l'API et l'espace client.
 */
export const bookingModeOf = (
  rules?: SchedulingRules | null,
): { mode: "aucun" | BookingMode; bookingUrl: string | null } => {
  if (rules?.enabled === false) return { mode: "aucun", bookingUrl: null };
  if (rules?.mode === "lien") {
    const url = rules.bookingUrl?.trim() || null;
    // Un mode « lien » sans lien ne mène nulle part : on retombe sur « aucun »
    // plutôt que d'afficher un bouton mort au client.
    return url ? { mode: "lien", bookingUrl: url } : { mode: "aucun", bookingUrl: null };
  }
  return { mode: "creneaux", bookingUrl: null };
};

/** Libellé d'un créneau en heure de Paris — même rendu partout. */
export const formatSlot = (iso: string): string =>
  new Date(iso).toLocaleString("fr-FR", {
    timeZone: TIMEZONE,
    weekday: "long",
    day: "2-digit",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
