import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { processNextRetouch } from "@/modules/ads/lib/retouch";

/**
 * Chaque minute : traite la plus ancienne retouche de créa en file (plan
 * Publicité, retouche ciblée) — un appel à Claude, puis les garde-fous, le
 * montage et les visuels. Une retouche par passage.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 600;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await payloadClient();
  const r = await processNextRetouch(payload);
  if (r) payload.logger.info(`[cron] retouche ${r.id} → ${r.outcome}${r.error ? ` (${r.error})` : ""}`);
  return NextResponse.json({ ok: true, done: r });
}
