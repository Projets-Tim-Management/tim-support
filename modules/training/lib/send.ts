import type { Payload } from "payload";

import { isSuppressed } from "@/core/lib/email-suppression";
import { contactName, sessionTitle, sessionsOfDay } from "@/modules/training/lib/plan";
import {
  decideTrainingEmail,
  scheduleDayEmails,
  trainingEmailDef,
  type DayEmailRow,
  type DueFacts,
  type TrainingDueReason,
} from "@/modules/training/lib/email-schedule";
import { DEFAULT_TEXTS, TRAINING_EMAIL_BUILDERS, type MailSlot, type TrainingMailContext } from "@/modules/training/lib/emails";
import { trainingRefId } from "@/modules/training/collections/trainingOwned";
import { isTrainingClosed } from "@/modules/training/lib/training";

/**
 * Envois de la formation — côté serveur : qui reçoit quoi, l'envoi, la trace.
 *
 * Chaque destinataire reçoit SON message (un participant n'y lit que ses
 * créneaux), un par un. La trace (`emails[].recipients`) dit à qui c'est parti
 * et quand : c'est elle que lit l'onglet « E-mails » du plan, et elle qui
 * empêche un second envoi à la même personne.
 */

const idOf = trainingRefId;

type Doc = Record<string, unknown> & { id: number | string };

export type Recipient = {
  email: string;
  name: string;
  firstName?: string | null;
  /** Les créneaux qui le concernent (participants) — tous pour les autres. */
  slots: MailSlot[];
};

export type DayBundle = {
  day: Doc;
  training: Doc | null;
  client: Doc | null;
  sessions: Doc[];
  contacts: Map<string, Doc>;
  trainer: Doc | null;
  referent: { email: string; firstName?: string | null } | null;
  texts: Record<string, { subject?: string | null; intro?: string | null }>;
};

/** Tout ce qu'il faut pour écrire les messages d'une journée, en une fois. */
export async function loadDay(payload: Payload, dayId: number | string): Promise<DayBundle | null> {
  const day = (await payload.findByID({ collection: "training-days", id: dayId, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null;
  if (!day) return null;
  const trainingId = idOf(day.training);
  const clientId = idOf(day.client);
  const [training, client, sessionsRes, account, settings] = await Promise.all([
    trainingId != null ? payload.findByID({ collection: "trainings", id: trainingId, depth: 0, overrideAccess: true }).catch(() => null) : null,
    clientId != null ? payload.findByID({ collection: "partner-clients", id: clientId, depth: 0, overrideAccess: true }).catch(() => null) : null,
    payload.find({ collection: "training-sessions", where: { day: { equals: dayId } }, depth: 0, limit: 100, overrideAccess: true }),
    clientId != null
      ? payload
          .find({ collection: "client-portal-accounts", where: { client: { equals: clientId } }, limit: 1, depth: 0, overrideAccess: true })
          .then((r) => r.docs[0] ?? null)
          .catch(() => null)
      : null,
    payload.findGlobal({ slug: "training-settings", depth: 0, overrideAccess: true }).catch(() => null),
  ]);
  const sessions = sessionsRes.docs as unknown as Doc[];
  const ids = new Set<string>();
  for (const s of sessions) {
    for (const f of ["participants", "attendance"]) for (const r of (s[f] as unknown[]) ?? []) ids.add(String(idOf(r)));
  }
  const contacts = new Map<string, Doc>();
  if (ids.size) {
    const found = await payload.find({
      collection: "client-contacts",
      where: { id: { in: [...ids] } },
      depth: 0,
      limit: ids.size,
      overrideAccess: true,
    });
    for (const c of found.docs as unknown as Doc[]) contacts.set(String(c.id), c);
  }
  const trainerId = idOf(day.trainer);
  const trainer = trainerId != null ? ((await payload.findByID({ collection: "users", id: trainerId, depth: 0, overrideAccess: true }).catch(() => null)) as Doc | null) : null;
  const a = account as { email?: string; firstName?: string } | null;
  const c = client as { email?: string } | null;
  const referentEmail = a?.email?.trim() || c?.email?.trim();
  const texts: DayBundle["texts"] = {};
  for (const t of ((settings as { emailTexts?: { key?: string; subject?: string; intro?: string }[] } | null)?.emailTexts ?? [])) {
    if (t.key) texts[t.key] = { subject: t.subject, intro: t.intro };
  }
  return {
    day,
    training: training as Doc | null,
    client: client as Doc | null,
    sessions,
    contacts,
    trainer,
    referent: referentEmail ? { email: referentEmail, firstName: a?.firstName ?? null } : null,
    texts,
  };
}

const activeSessions = (b: DayBundle) =>
  sessionsOfDay(
    b.sessions.map((s) => ({ ...s, day: idOf(s.day) as number | string })) as (Doc & { day: number | string; startTime?: string; status?: string })[],
    b.day.id,
  ).filter((s) => s.status !== "annulee");

const toSlot = (b: DayBundle, s: Doc): MailSlot => {
  const people = ((s.participants as unknown[]) ?? []).map((r) => b.contacts.get(String(idOf(r)))).filter(Boolean) as Doc[];
  const delivery = (s.accessDelivery as string) || (b.training?.defaultAccessDelivery as string) || "formateur";
  return {
    start: (s.startTime as string) || null,
    end: (s.endTime as string) || null,
    title: sessionTitle(s.profiles as string[]),
    participants: people.map((p) => ({ name: contactName(p as never), hasEmail: Boolean((p.email as string)?.trim()) })),
    accessDelivery: delivery === "client" ? "client" : "formateur",
  };
};

/** Tous les créneaux non annulés de la journée, au format des messages. */
export const daySlots = (b: DayBundle): MailSlot[] => activeSessions(b).map((s) => toSlot(b, s));

/** Les destinataires d'un envoi, d'après l'état ACTUEL du plan. */
export function recipientsFor(key: string, b: DayBundle): Recipient[] {
  const def = trainingEmailDef(key);
  if (!def) return [];
  const sessions = activeSessions(b);
  const allSlots = sessions.map((s) => toSlot(b, s));
  if (def.audience === "referent") {
    return b.referent ? [{ email: b.referent.email, name: b.referent.email, firstName: b.referent.firstName, slots: allSlots }] : [];
  }
  if (def.audience === "formateur") {
    const email = (b.trainer?.email as string)?.trim();
    if (!email) return [];
    return [{ email, name: (b.day.trainerName as string) || email, firstName: (b.trainer?.firstName as string) ?? null, slots: allSlots }];
  }
  // Participants, ou présents : un message par personne, avec SES créneaux.
  const field = def.audience === "presents" ? "attendance" : "participants";
  const byEmail = new Map<string, Recipient>();
  for (const s of sessions) {
    for (const ref of (s[field] as unknown[]) ?? []) {
      const c = b.contacts.get(String(idOf(ref)));
      const email = (c?.email as string)?.trim();
      if (!c || !email) continue;
      const k = email.toLowerCase();
      const r = byEmail.get(k) ?? { email, name: contactName(c as never), firstName: (c.firstName as string) ?? null, slots: [] };
      r.slots.push(toSlot(b, s));
      byEmail.set(k, r);
    }
  }
  return [...byEmail.values()];
}

/** Le contexte d'écriture pour UN destinataire. */
export function mailContext(key: string, b: DayBundle, r: Recipient): TrainingMailContext {
  return {
    clientName: (b.client?.companyName as string) ?? null,
    dayDate: b.day.date as string,
    mode: b.day.mode === "distance" ? "distance" : "sur-place",
    location: (b.day.location as string) ?? null,
    locationDetails: (b.day.locationDetails as string) ?? null,
    link: (b.day.link as string) ?? null,
    trainerName: (b.day.trainerName as string) ?? null,
    firstName: r.firstName ?? null,
    slots: r.slots,
    clientId: idOf(b.day.client),
    texts: b.texts[key],
  };
}

/** Les faits qui décident d'un envoi, pour une ligne. */
export function factsFor(key: string, b: DayBundle): DueFacts {
  const rows = (b.day.emails as DayEmailRow[]) ?? [];
  const convocation = rows.find((r) => r.key === "convocation");
  const convokedAt: Record<string, string> = {};
  for (const r of convocation?.recipients ?? []) if (r.sentAt) convokedAt[r.email.toLowerCase()] = r.sentAt;
  return {
    dayDate: (b.day.date as string) ?? null,
    trainingClosed: isTrainingClosed(b.training?.status as string | undefined),
    convocationAt: convocation && !convocation.sentAt ? (convocation.scheduledAt ?? null) : null,
    convokedAt,
    attendanceTaken: activeSessions(b).some((s) => ((s.attendance as unknown[]) ?? []).length > 0),
    recipients: recipientsFor(key, b).map((r) => r.email),
  };
}

/**
 * Journée datée sans envois (créée avant leur existence) : on les date. Rien
 * n'est réécrit sur une journée qui en a déjà.
 */
export async function ensureScheduled(payload: Payload, b: DayBundle, opts: { dry?: boolean } = {}): Promise<DayBundle> {
  const rows = (b.day.emails as DayEmailRow[]) ?? [];
  if (rows.length || !b.day.date) return b;
  const emails = scheduleDayEmails(b.day.date as string, []);
  // À blanc : calculé en mémoire, rien n'est écrit.
  if (!opts.dry) {
    await payload.update({ collection: "training-days", id: b.day.id, data: { emails } as never, overrideAccess: true });
  }
  return { ...b, day: { ...b.day, emails } };
}

export type SendResult = { key: string; reason: TrainingDueReason | "envoye" | "echec"; sentTo: string[] };

/**
 * Envoie une ligne à qui de droit — ou, avec `force`, à ceux qui ne l'ont pas
 * encore reçue sans attendre l'heure (bouton « Envoyer maintenant ») ; si tout
 * le monde l'a déjà, `force` la renvoie à tous.
 */
export async function sendDayEmail(
  payload: Payload,
  dayId: number | string,
  key: string,
  opts: { force?: boolean; dry?: boolean; nowMs?: number; bundle?: DayBundle } = {},
): Promise<SendResult> {
  // Le passage horaire charge la journée une fois pour ses cinq envois.
  let b = opts.bundle ?? (await loadDay(payload, dayId));
  if (!b) return { key, reason: "pas-de-date", sentTo: [] };
  b = await ensureScheduled(payload, b, { dry: opts.dry });
  const build = TRAINING_EMAIL_BUILDERS[key];
  if (!build || !DEFAULT_TEXTS[key]) return { key, reason: "pas-de-date", sentTo: [] };

  const rows = (b.day.emails as DayEmailRow[]) ?? [];
  const row = rows.find((r) => r.key === key) ?? { key };
  // Une adresse désinscrite (ou en rejet chez Brevo) n'est pas un destinataire :
  // l'écarter ici évite un « échec » à chaque passage.
  const listed = recipientsFor(key, b);
  const suppressed = new Set<string>();
  for (const r of listed) if (await isSuppressed(payload, r.email)) suppressed.add(r.email.toLowerCase());
  const all = listed.filter((r) => !suppressed.has(r.email.toLowerCase()));
  let targets: Recipient[];
  if (opts.force) {
    const already = new Set((row.recipients ?? []).map((r) => r.email.toLowerCase()));
    const pending = all.filter((r) => !already.has(r.email.toLowerCase()));
    targets = pending.length ? pending : all;
    if (!b.day.date) return { key, reason: "journee-sans-date", sentTo: [] };
  } else {
    const facts = factsFor(key, b);
    facts.recipients = facts.recipients.filter((e) => !suppressed.has(e.toLowerCase()));
    const decision = decideTrainingEmail(row, facts, opts.nowMs ?? Date.now());
    if (decision.reason !== "envoyer") return { key, reason: decision.reason, sentTo: [] };
    const wanted = new Set(decision.to.map((e) => e.toLowerCase()));
    targets = all.filter((r) => wanted.has(r.email.toLowerCase()));
  }
  if (!targets.length) return { key, reason: "aucun-destinataire", sentTo: [] };
  if (opts.dry) return { key, reason: "envoyer", sentTo: targets.map((t) => t.email) };

  const sentTo: { email: string; name: string; sentAt: string }[] = [];
  for (const r of targets) {
    const built = build(mailContext(key, b, r));
    try {
      await payload.sendEmail({
        to: r.email,
        subject: built.subject,
        html: built.html,
        text: built.text,
        // Tag Brevo : retrouver plus tard le sort réel de ces envois.
        headers: { "X-Mailin-Tag": `training-${idOf(b.day.training)}` },
      });
      sentTo.push({ email: r.email, name: r.name, sentAt: new Date().toISOString() });
    } catch (err) {
      payload.logger.error(`[formation] envoi de « ${key} » à ${r.email} échoué : ${err}`);
    }
  }
  if (!sentTo.length) return { key, reason: "echec", sentTo: [] };

  // La trace est ce qui empêche un second envoi aux mêmes personnes : sans
  // elle, chaque passage horaire renverrait le message. On insiste donc
  // (trois essais, relecture à chaque fois — un autre envoi de la journée a pu
  // passer) avant de renoncer en le signalant.
  const now = new Date().toISOString();
  let traced = false;
  for (let attempt = 1; attempt <= 3 && !traced; attempt++) {
    try {
      const fresh = (await payload.findByID({ collection: "training-days", id: dayId, depth: 0, overrideAccess: true })) as unknown as Doc;
      const freshRows = ((fresh.emails as DayEmailRow[]) ?? []).length ? (fresh.emails as DayEmailRow[]) : rows;
      const next = freshRows.map((e) =>
        e.key === key ? { ...e, sentAt: now, recipients: [...(e.recipients ?? []), ...sentTo] } : e,
      );
      await payload.update({ collection: "training-days", id: dayId, data: { emails: next } as never, overrideAccess: true });
      traced = true;
    } catch (err) {
      payload.logger.error(`[formation] trace de « ${key} » (essai ${attempt}/3) non enregistrée : ${err}`);
      if (attempt < 3) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }
  }
  payload.logger.info(`[formation] « ${key} » envoyé à ${sentTo.map((s) => s.email).join(", ")}.`);
  return { key, reason: "envoye", sentTo: sentTo.map((s) => s.email) };
}
