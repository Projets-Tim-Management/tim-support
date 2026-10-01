/**
 * Envois de la formation — QUAND et À QUI, règles pures.
 *
 * Même mécanique que la phase de test (modules/marketing/lib/journey.ts) :
 * chaque journée de formation porte ses envois, datés par un décalage en jours
 * par rapport à la journée et une heure d'envoi (heure de Paris). Quand la
 * journée est fixée plus tard que prévu — la formation est dans trois jours, la
 * convocation était à J−7 —, les décalages se RESSERRENT avec la même fonction
 * que la phase de test (`compressLeadOffsets`) : rien ne naît dans le passé.
 *
 * Testé seul : tests/training-emails.test.ts.
 */

import { addDays, compressLeadOffsets } from "@/modules/marketing/lib/journey";
import { utcToZonedParts, zonedTimeToUtc } from "@/modules/marketing/lib/scheduling";

/** À qui part un envoi. */
export type TrainingAudience = "participants" | "referent" | "formateur" | "presents";

export const AUDIENCE_LABEL: Record<TrainingAudience, string> = {
  participants: "Participants",
  referent: "Référent du client",
  formateur: "Formateur",
  presents: "Présents",
};

export type TrainingEmailDef = {
  key: string;
  label: string;
  audience: TrainingAudience;
  /** Jours par rapport à la journée (négatif = avant). */
  offsetDays: number;
  /** « HH:MM », heure de Paris. */
  sendHour: string;
  detail: string;
};

/**
 * Les envois d'une journée, dans l'ordre où ils partent.
 *
 * Le récapitulatif d'après-formation ne part qu'aux PRÉSENTS : il attend donc
 * l'émargement — sans lui, il reste « en attente », jamais envoyé à l'aveugle.
 */
export const TRAINING_EMAILS: TrainingEmailDef[] = [
  {
    key: "convocation",
    label: "Convocation",
    audience: "participants",
    offsetDays: -7,
    sendHour: "09:00",
    detail: "À chaque participant : son créneau, le lieu et son complément (ou le lien et les consignes), ce qu'il faut prévoir.",
  },
  {
    key: "recap-referent",
    label: "Organisation de la journée",
    audience: "referent",
    offsetDays: -7,
    sendHour: "09:00",
    detail: "Au référent du client : qui vient à quel créneau, le lieu, ce qu'il faut préparer, la remise des accès.",
  },
  {
    key: "brief-formateur",
    label: "Brief du formateur",
    audience: "formateur",
    offsetDays: -1,
    sendHour: "08:00",
    detail: "Au formateur : le déroulé, les participants de chaque créneau, le lieu, qui remet les accès.",
  },
  {
    key: "rappel-veille",
    label: "Rappel de la veille",
    audience: "participants",
    offsetDays: -1,
    sendHour: "17:00",
    detail: "« C'est demain » : l'horaire et le lieu. Inutile si la convocation vient de partir.",
  },
  {
    key: "apres-formation",
    label: "Après la formation",
    audience: "presents",
    offsetDays: 1,
    sendHour: "10:00",
    detail: "Aux présents : les guides du site support, le mot de passe oublié, comment poser une question. Part après l'émargement.",
  },
];

export const trainingEmailDef = (key?: string | null): TrainingEmailDef | undefined =>
  TRAINING_EMAILS.find((e) => e.key === key);

/** Un envoi tel qu'il est rangé sur la journée. */
export type DayEmailRow = {
  key: string;
  scheduledAt?: string | null;
  /** Date réglée à la main (ou « ne pas envoyer ») : le calcul n'y touche plus. */
  overridden?: boolean | null;
  /** Dernier envoi effectif. */
  sentAt?: string | null;
  /** À qui c'est parti, une ligne par destinataire. */
  recipients?: { email: string; name?: string | null; sentAt?: string | null }[] | null;
};

/** Pose l'heure d'envoi sur une date, en heure de Paris. */
export const atParisHour = (iso: string, hhmm: string): string => {
  const [h, m] = hhmm.split(":").map(Number);
  const { year, month, day } = utcToZonedParts(Date.parse(iso));
  return new Date(zonedTimeToUtc(year, month, day, h, m)).toISOString();
};

/** Début de la journée de formation (minuit, heure de Paris), en ms. */
export const dayStartMs = (dayDate: string): number => Date.parse(atParisHour(dayDate, "00:00"));

/**
 * Les dates calculées d'une journée, sans tenir compte des réglages manuels.
 * Décalages resserrés si la journée est trop proche (même règle que le test).
 */
export function computedSchedule(dayDate: string, now: Date = new Date()): Record<string, string> {
  const items = TRAINING_EMAILS.map((e) => ({ key: e.key, anchor: "debut", offsetDays: e.offsetDays }));
  const fitted = compressLeadOffsets(items, dayDate, now);
  const out: Record<string, string> = {};
  for (const def of TRAINING_EMAILS) {
    const offset = fitted.find((f) => f.key === def.key)?.offsetDays ?? def.offsetDays;
    out[def.key] = atParisHour(addDays(dayDate, offset as number), def.sendHour);
  }
  return out;
}

/**
 * Les envois d'une journée : une ligne par envoi connu, dans l'ordre.
 *
 * `dateChanged` : la journée vient d'être (re)datée — le cycle REPART de zéro.
 * Une convocation partie pour l'ancienne date annonce une date fausse : elle
 * doit repartir, avec la bonne. Les réglages manuels, faits pour l'ancienne
 * date, tombent aussi.
 *
 * Sinon (ligne manquante, création) : on complète, sans toucher aux lignes
 * parties ni à celles réglées à la main.
 *
 * Journée sans date : aucun envoi daté (la date vide veut dire « rien ne part »).
 */
export function scheduleDayEmails(
  dayDate: string | null | undefined,
  current: DayEmailRow[],
  now: Date = new Date(),
  dateChanged = false,
): DayEmailRow[] {
  const byKey = new Map(current.map((r) => [r.key, r]));
  const computed = dayDate ? computedSchedule(dayDate, now) : {};
  return TRAINING_EMAILS.map((def) => {
    const row = byKey.get(def.key) ?? { key: def.key };
    if (dateChanged) {
      return { key: def.key, scheduledAt: computed[def.key] ?? null, overridden: false, sentAt: null, recipients: [] };
    }
    if (row.sentAt || row.overridden) return { ...row, key: def.key };
    return { ...row, key: def.key, scheduledAt: computed[def.key] ?? null };
  });
}

// ─── Faut-il envoyer maintenant ? ───────────────────────────────────────────

/** Fenêtre de rattrapage après l'heure prévue — celle de la phase de test. */
export const LATE_GRACE_HOURS = 36;

export type TrainingDueReason =
  | "envoyer"
  | "deja-envoye"
  | "pas-de-date"
  | "a-venir"
  | "journee-passee"
  | "trop-tard"
  | "formation-close"
  | "journee-sans-date"
  | "convocation-recente"
  | "attente-emargement"
  | "aucun-destinataire";

export const DUE_REASON_LABEL: Record<TrainingDueReason, string> = {
  envoyer: "part au prochain passage",
  "deja-envoye": "envoyé",
  "pas-de-date": "ne partira pas (date retirée)",
  "a-venir": "à venir",
  "journee-passee": "sans objet : la journée est passée",
  "trop-tard": "non parti : l'heure prévue est dépassée de plus de 36 h",
  "formation-close": "sans objet : formation close",
  "journee-sans-date": "en attente de la date de la journée",
  "convocation-recente": "sans objet : la convocation vient de partir",
  "attente-emargement": "en attente de l'émargement",
  "aucun-destinataire": "aucun destinataire",
};

export type DueFacts = {
  dayDate?: string | null;
  trainingClosed: boolean;
  /** Date prévue de la convocation de la même journée, si elle n'est pas encore partie. */
  convocationAt?: string | null;
  /** Qui a reçu la convocation, et quand (pour le rappel). */
  convokedAt?: Record<string, string>;
  /** Un créneau de la journée a-t-il été émargé ? */
  attendanceTaken: boolean;
  /** Adresses auxquelles l'envoi devrait partir maintenant. */
  recipients: string[];
};

/**
 * La décision pour UNE ligne, et à qui envoyer.
 *
 * Une ligne déjà partie peut repartir — à ceux qui ne l'ont PAS reçue : une
 * personne ajoutée à un créneau après la convocation la reçoit à son tour,
 * tant que la journée n'est pas passée. Ceux qui l'ont déjà ne la reçoivent
 * jamais deux fois.
 */
export function decideTrainingEmail(
  row: DayEmailRow,
  facts: DueFacts,
  nowMs: number,
): { reason: TrainingDueReason; to: string[] } {
  const def = trainingEmailDef(row.key);
  const none = (reason: TrainingDueReason) => ({ reason, to: [] as string[] });
  if (!def) return none("pas-de-date");
  if (facts.trainingClosed) return none("formation-close");
  if (!facts.dayDate) return none("journee-sans-date");
  if (!row.scheduledAt) return none("pas-de-date");

  const at = Date.parse(row.scheduledAt);
  const before = def.offsetDays < 0;
  const start = dayStartMs(facts.dayDate);
  const already = new Set((row.recipients ?? []).map((r) => r.email.toLowerCase()));
  const pending = facts.recipients.filter((e) => !already.has(e.toLowerCase()));

  if (before && nowMs >= start) return none(row.sentAt ? "deja-envoye" : "journee-passee");
  if (at > nowMs) return none(row.sentAt ? "deja-envoye" : "a-venir");

  // Le rappel de la veille n'a de sens que si la convocation est ancienne :
  // une convocation reçue hier soir dit déjà tout. Jugé sur l'envoi RÉEL, par
  // personne (un participant ajouté la veille a reçu la sienne à l'instant),
  // et sur la date prévue tant qu'elle n'est pas partie.
  let candidates = pending;
  if (def.key === "rappel-veille") {
    const threshold = start - LATE_GRACE_HOURS * 3_600_000;
    if (facts.convocationAt && Date.parse(facts.convocationAt) >= threshold) return none("convocation-recente");
    const convoked = facts.convokedAt ?? {};
    candidates = pending.filter((e) => {
      const at = convoked[e.toLowerCase()];
      return !at || Date.parse(at) < threshold;
    });
    if (pending.length && !candidates.length) return none("convocation-recente");
  }
  if (def.audience === "presents" && !facts.attendanceTaken) return none("attente-emargement");

  if (row.sentAt && !candidates.length) return none("deja-envoye");
  // Après la journée, pas de rattrapage au-delà de la fenêtre habituelle.
  if (!before && nowMs - at > LATE_GRACE_HOURS * 3_600_000) return none(row.sentAt ? "deja-envoye" : "trop-tard");
  if (!candidates.length) return none("aucun-destinataire");
  // Le référent et le formateur ne reçoivent leur message qu'une fois.
  if (row.sentAt && (def.audience === "referent" || def.audience === "formateur")) return none("deja-envoye");
  return { reason: "envoyer", to: candidates };
}
