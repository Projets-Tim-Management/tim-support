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

/** Jours ouvrés par défaut : lundi → vendredi (1 = lundi, 7 = dimanche, ISO). */
export const WEEKDAY_OPTIONS = [
  { label: "Lundi", value: "1" },
  { label: "Mardi", value: "2" },
  { label: "Mercredi", value: "3" },
  { label: "Jeudi", value: "4" },
  { label: "Vendredi", value: "5" },
  { label: "Samedi", value: "6" },
  { label: "Dimanche", value: "7" },
] as const;

export const DEFAULT_WEEKDAYS = ["1", "2", "3", "4", "5"];

/** Heures proposées, par demi-heure — évite un champ libre à valider. */
export const HOUR_OPTIONS = Array.from({ length: 27 }, (_, i) => {
  const minutes = 7 * 60 + i * 30; // 07:00 → 20:00
  const label = `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
  return { label, value: label };
});

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
  weekdays?: string[] | null;
  startTime?: string | null;
  endTime?: string | null;
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
  weekdays: string[];
  startTime: string;
  endTime: string;
  durationMin: number;
  bufferMin: number;
  minNoticeHours: number;
  horizonDays: number;
};

export const DEFAULT_RULES: ResolvedRules = {
  weekdays: DEFAULT_WEEKDAYS,
  startTime: "09:00",
  endTime: "18:00",
  durationMin: 45,
  bufferMin: 15,
  minNoticeHours: 24,
  horizonDays: 15,
};

/** Un nombre exploitable, sinon le défaut : couvre null, undefined et absurde. */
const num = (value: unknown, fallback: number, min: number): number =>
  typeof value === "number" && Number.isFinite(value) && value >= min ? value : fallback;

/** Complète les règles d'un partenaire avec les défauts. */
export const resolveRules = (rules?: SchedulingRules | null): ResolvedRules => ({
  weekdays: rules?.weekdays?.length ? rules.weekdays : DEFAULT_RULES.weekdays,
  startTime: rules?.startTime || DEFAULT_RULES.startTime,
  endTime: rules?.endTime || DEFAULT_RULES.endTime,
  durationMin: num(rules?.durationMin, DEFAULT_RULES.durationMin, 5),
  bufferMin: num(rules?.bufferMin, DEFAULT_RULES.bufferMin, 0),
  minNoticeHours: num(rules?.minNoticeHours, DEFAULT_RULES.minNoticeHours, 0),
  horizonDays: num(rules?.horizonDays, DEFAULT_RULES.horizonDays, 1),
});

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

/** « 09:30 » → 570 minutes. Renvoie null si le format n'est pas reconnu. */
const parseTime = (value?: string | null): number | null => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(value ?? "");
  if (!m) return null;
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return minutes >= 0 && minutes < 24 * 60 ? minutes : null;
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
  const weekdays = new Set(r.weekdays);
  const start = parseTime(r.startTime) ?? 9 * 60;
  const end = parseTime(r.endTime) ?? 18 * 60;
  const { durationMin: duration, bufferMin: buffer, horizonDays: horizon } = r;

  if (end <= start) return [];

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
    if (!weekdays.has(String(isoWeekday(dayStart)))) continue;

    for (let minutes = start; minutes + duration <= end; minutes += step) {
      const at = zonedTimeToUtc(year, month, day, Math.floor(minutes / 60), minutes % 60);
      if (at < earliest || at > latest) continue;
      if (takenSet.has(at)) continue;

      const ends = at + duration * MINUTE;
      if (busyRanges.some((b) => at < b.end && ends > b.start)) continue;

      out.push(new Date(at).toISOString());
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
