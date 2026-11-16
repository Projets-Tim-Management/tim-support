import type { Payload } from "payload";

import { reminderMail, type MailView } from "@/modules/booking/lib/emails";
import { mailView, toBookingType } from "@/modules/booking/lib/engine";

/**
 * LES RAPPELS AU PROSPECT (16/11/2026, point 5) : pour chaque rendez-vous confirmé, les rappels de son type (par
 * défaut la veille et une heure avant), chacun une seule fois — `remindersSent` garde ceux partis (il se vide quand
 * le rendez-vous est déplacé). Un rappel dont l'heure est passée de plus de 30 minutes ne part plus : un « à demain »
 * reçu le matin même sonnerait faux. Tourne toutes les dix minutes.
 */

type Raw = Record<string, unknown>;
const LATE_MS = 30 * 60_000;

/** Les rappels à envoyer maintenant pour un rendez-vous. Pur (testé). */
export function dueReminders(start: string, offsets: number[], sent: number[], now: Date): number[] {
  const t = Date.parse(start);
  return offsets.filter((m) => !sent.includes(m) && now.getTime() >= t - m * 60_000 && now.getTime() <= t - m * 60_000 + LATE_MS && now.getTime() < t);
}

export async function sendDueReminders(payload: Payload, now = new Date()): Promise<{ sent: number; failed: number }> {
  const horizon = new Date(now.getTime() + 8 * 24 * 3600_000).toISOString();
  const res = await payload
    .find({ collection: "bookings" as never, where: { and: [{ status: { equals: "confirme" } }, { start: { greater_than: now.toISOString() } }, { start: { less_than: horizon } }] }, pagination: false, depth: 2, overrideAccess: true })
    .catch(() => null);
  let sent = 0;
  let failed = 0;
  for (const b of (res?.docs ?? []) as unknown as Raw[]) {
    if (!b.type || typeof b.type !== "object") continue;
    const t = toBookingType(b.type as Raw);
    const done = (Array.isArray(b.remindersSent) ? b.remindersSent : []).map(Number);
    const due = dueReminders(String(b.start), t.reminders, done, now);
    if (!due.length) continue;
    const host = t.hosts.find((h) => h.id === String(b.host && typeof b.host === "object" ? (b.host as Raw).id : b.host));
    const view: MailView = mailView(t, b, host?.name ?? "TIM Management");
    // Un seul e-mail même si deux rappels tombent ensemble : le plus proche du rendez-vous.
    const mail = reminderMail(view, Math.min(...due));
    const ok = await payload
      .sendEmail({ to: view.email, subject: mail.subject, html: mail.html, text: mail.text })
      .then(() => true)
      .catch((e) => {
        payload.logger.error(`[rendez-vous] rappel à ${view.email} non envoyé : ${e instanceof Error ? e.message : String(e)}`);
        return false;
      });
    if (ok) {
      sent += 1;
      await payload.update({ collection: "bookings" as never, id: String(b.id), data: { remindersSent: [...done, ...due] } as never, overrideAccess: true }).catch(() => null);
    } else failed += 1;
  }
  return { sent, failed };
}

