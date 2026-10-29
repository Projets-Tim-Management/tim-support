import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { scheduleFollowUps } from "@/modules/ads/agent/followup";
import { tickDueRuns } from "@/modules/ads/agent/run";
import { maybeSendWeeklyRecap } from "@/modules/ads/lib/weekly-recap";

/**
 * Chaque minute : lance les passages de SUIVI dus sur les campagnes en ligne
 * (le matin, le lundi, le premier lundi du mois — agent/followup.ts), puis fait
 * avancer les passages d'agent dont personne ne tient le verrou (fonction
 * coupée, déploiement, fin du temps après le lancement), et relance ceux en
 * pause de budget quand le plafond le permet de nouveau. Le lundi, le
 * récapitulatif part aux admins une fois les passages du lundi finis.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const start = Date.now();
  const denied = cronGuard(req);
  if (denied) return denied;
  const payload = await payloadClient();
  // Une erreur d'ordonnancement ne doit pas empêcher les passages en cours d'avancer.
  const scheduled = await scheduleFollowUps(payload).catch((e) => (payload.logger.error(`[publicité] ordonnancement du suivi : ${(e as Error).message}`), []));
  for (const f of scheduled) {
    // Un plafond atteint reporterait le passage chaque minute : on ne le dit qu'une fois par heure.
    if (f.skipped) {
      if (new Date().getUTCMinutes() === 0) payload.logger.warn(`[publicité] suivi ${f.kind} de la campagne ${f.campaign} reporté : ${f.skipped}`);
    } else payload.logger.info(`[publicité] suivi ${f.kind} lancé sur la campagne ${f.campaign} (passage ${f.run}).`);
  }
  // Le récapitulatif du lundi, une fois les passages du lundi finis (décision du 29/10/2026).
  const recap = await maybeSendWeeklyRecap(payload).catch((e) => (payload.logger.error(`[publicité] récap du lundi : ${(e as Error).message}`), "echec" as const));
  if (recap === "envoye" || recap === "echec") payload.logger.info(`[publicité] récap du lundi : ${recap}.`);
  const done = await tickDueRuns(payload, new Date(start + (maxDuration - 20) * 1000));
  if (done.length) payload.logger.info(`[cron] agents de campagne : ${done.map((d) => `${d.run} → ${typeof d.result === "string" ? d.result : d.result.outcome}`).join(", ")}`);
  return NextResponse.json({ ok: true, scheduled, recap, done });
}
