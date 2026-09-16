import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { adminEmails } from "@/modules/marketing/lib/notify";
import { buildValidationReminder, parisDay, reminderDue, type ReminderItem } from "@/modules/partner/lib/billing-reminder";
import { loadBillingReport } from "@/modules/partner/lib/billing-report";
import { monthValidation } from "@/modules/partner/lib/billing-validation";
import type { HistoryEntry } from "@/modules/partner/lib/history";
import { isPennylaneConfigured, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Rappel quotidien du rapprochement — n'envoie que deux fois par mois.
 *
 * Passe chaque matin, calcule l'état du mois de chaque fiche gagnée (le
 * rapprochement Pennylane, l'historique), et n'écrit que :
 *   - le 1er du mois, aux admins : tout ce qui reste à signer ;
 *   - à J-2 d'une facture encore non signée, aux admins ET à l'équipe TIM
 *     (`team@`, groupe Workspace — BILLING_REMINDER_TEAM_EMAIL pour changer) :
 *     le dernier appel. C'est le moment où quelqu'un d'autre que l'admin peut
 *     encore corriger l'abonnement.
 * Les autres jours, rien — voir lib/billing-reminder.ts.
 *
 * `dry=1` : calcule et répond, sans e-mail.
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/** L'équipe TIM, en plus des admins, sur le dernier appel. Vide pour ne prévenir que les admins. */
const TEAM_EMAIL = () => (process.env.BILLING_REMINDER_TEAM_EMAIL ?? "team@tim-management.co").trim();

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const payload = await payloadClient();

  if (!isPennylaneConfigured()) {
    return NextResponse.json({ ok: true, dry, skipped: "pennylane_not_configured" });
  }

  const now = new Date();
  const today = parisDay(now);

  let report;
  try {
    report = await loadBillingReport(payload);
  } catch (err) {
    const message = pennylaneErrorMessage(err);
    payload.logger.error(`[cron] rappel rapprochement : Pennylane injoignable — ${message}`);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }

  const docs = await payload.find({
    collection: "partner-clients",
    where: { id: { in: report.checks.map((c) => c.client.id) } },
    limit: 5000,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { history: true } as never,
  });
  const histories = new Map((docs.docs as { id: number | string; history?: HistoryEntry[] | null }[]).map((d) => [String(d.id), d.history ?? []]));

  const mois: ReminderItem[] = [];
  const dernierAppel: ReminderItem[] = [];
  for (const c of report.checks) {
    if (c.client.clientStatus !== "actif") continue;
    const validation = monthValidation(histories.get(String(c.client.id)) ?? [], c, now);
    const due = reminderDue(validation, today);
    if (!due) continue;
    (due === "mois" ? mois : dernierAppel).push({ clientId: c.client.id, client: c.client.name, validation });
  }

  const messages = [
    { mail: buildValidationReminder(mois, "mois", today), team: false },
    { mail: buildValidationReminder(dernierAppel, "dernier-appel", today), team: true },
  ].filter((m): m is { mail: NonNullable<typeof m.mail>; team: boolean } => m.mail != null);

  const sent: string[] = [];
  if (!dry && messages.length) {
    const admins = await adminEmails(payload);
    for (const { mail, team } of messages) {
      // Dédoublonné : un admin qui est aussi dans le groupe ne reçoit qu'une fois.
      const to = [...new Set([...admins, ...(team && TEAM_EMAIL() ? [TEAM_EMAIL()] : [])].map((e) => e.toLowerCase()))];
      if (!to.length) break;
      try {
        await payload.sendEmail({ to: to.join(","), ...mail });
        sent.push(`${mail.subject} → ${to.length} destinataire(s)`);
      } catch (e) {
        payload.logger.error(`[cron] rappel rapprochement non envoyé : ${e}`);
      }
    }
  }

  payload.logger.info(
    `[cron] rappel rapprochement (${today}) : ${mois.length} à préparer, ${dernierAppel.length} en dernier appel, ${messages.length} message(s)${dry ? " (à blanc)" : ""}.`,
  );

  return NextResponse.json({
    ok: true,
    dry,
    today,
    mois: mois.map((i) => i.client),
    dernierAppel: dernierAppel.map((i) => `${i.client} (${i.validation.invoiceDate})`),
    subjects: messages.map((m) => m.mail.subject),
    sent,
  });
}
