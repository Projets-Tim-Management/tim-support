import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { tickDueRuns } from "@/modules/ads/agent/run";

/**
 * Chaque minute : fait avancer les passages d'agent dont personne ne tient le
 * verrou (fonction coupée, déploiement, fin du temps après le lancement), et
 * relance ceux en pause de budget quand le plafond le permet de nouveau.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const start = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await payloadClient();
  const done = await tickDueRuns(payload, new Date(start + (maxDuration - 20) * 1000));
  if (done.length) payload.logger.info(`[cron] agents de campagne : ${done.map((d) => `${d.run} → ${typeof d.result === "string" ? d.result : d.result.outcome}`).join(", ")}`);
  return NextResponse.json({ ok: true, done });
}
