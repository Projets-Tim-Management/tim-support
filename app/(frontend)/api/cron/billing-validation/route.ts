import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { loadTeamEmails } from "@/core/lib/team-emails";
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
 *   - le 1er du mois : tout ce qui reste à signer ;
 *   - à J-2 d'une facture encore non signée, avec en plus l'adresse d'équipe
 *     (`team@`, groupe Workspace — réglable dans « E-mails de l'équipe ») :
 *     le dernier appel. C'est le moment où quelqu'un d'autre que l'admin peut
 *     encore corriger l'abonnement.
 * Les autres jours, rien — voir lib/billing-reminder.ts. Qui reçoit chacun se
 * règle dans Système → « E-mails de l'équipe » (core/lib/team-emails.ts).
 *
 * `dry=1` : calcule et répond, sans e-mail.
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;


export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
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

  // Les destinataires de chacun : Système → « E-mails de l'équipe » et les fiches utilisateurs.
  const messages = [
    { mail: buildValidationReminder(mois, "mois", today), key: "rapprochement-mois" as const, team: false },
    { mail: buildValidationReminder(dernierAppel, "dernier-appel", today), key: "rapprochement-dernier-appel" as const, team: true },
  ].filter((m): m is (typeof m & { mail: NonNullable<typeof m.mail> }) => m.mail != null);

  const sent: string[] = [];
  if (!dry && messages.length) {
    const teamEmails = await loadTeamEmails(payload);
    const team = teamEmails.teamAddress;
    for (const { mail, key, team: withTeam } of messages) {
      // Dédoublonné : quelqu'un qui est aussi dans le groupe d'équipe ne reçoit qu'une fois.
      const to = [...new Set([...teamEmails.recipients(key), ...(withTeam && team ? [team] : [])].map((e) => e.toLowerCase()))];
      if (!to.length) continue;
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
