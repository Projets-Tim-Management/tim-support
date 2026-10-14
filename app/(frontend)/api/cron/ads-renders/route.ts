import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { processNextRender } from "@/modules/ads/video/render";

/**
 * Chaque minute : rend la plus ancienne vidéo de créa en attente (plan
 * Publicité, §9 sexies, D3), aux trois formats, dans une Sandbox Vercel. Une
 * vidéo par passage : installation de la Sandbox comprise, comptez quelques
 * minutes.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 800;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await payloadClient();
  const r = await processNextRender(payload);
  if (r) payload.logger.info(`[cron] vidéo de la créa ${r.id} → ${r.outcome}${r.error ? ` (${r.error})` : ""}`);
  return NextResponse.json({ ok: true, done: r });
}
