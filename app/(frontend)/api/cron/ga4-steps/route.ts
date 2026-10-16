import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { resumeGa4 } from "@/modules/analytics/lib/ga4-mp";

/**
 * Toutes les heures : la reprise des étapes commerciales à envoyer à GA4
 * (plan de mesure, phase 2.2 — voir modules/analytics/lib/ga4-mp.ts) : les
 * étapes notées mais pas encore parties — envoi en échec, signature qui
 * attendait son CA payé, réservation abandonnée. Hors production, rien.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await payloadClient();
  const r = await resumeGa4(payload);
  if (r.checked) payload.logger.info(`[cron] GA4 : ${r.checked} étape(s) vue(s), ${r.sent} envoyée(s), ${r.waiting} en attente du CA payé, ${r.failed} en échec`);
  return NextResponse.json({ ok: true, ...r });
}
