import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { processNextRush } from "@/modules/ads/lib/rush-process";

/**
 * Chaque minute : convertit les rushes importés (plan Publicité, §9 sexies,
 * D1b), le plus ancien d'abord, tant qu'il reste du temps pour en finir un.
 * Une vidéo se convertit en une à trois minutes dans une Sandbox Vercel.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 800;

/** Une conversion de plus seulement s'il reste de quoi la finir (un rush de 3 min en 4K, au pire). */
const MARGIN_MS = 6 * 60_000;

export async function GET(req: Request) {
  const start = Date.now();
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await payloadClient();
  const done = [];
  while (Date.now() - start < maxDuration * 1000 - MARGIN_MS) {
    const r = await processNextRush(payload);
    if (!r) break;
    done.push(r);
    payload.logger.info(`[cron] rush ${r.id} → ${r.outcome}${r.error ? ` (${r.error})` : ""}`);
  }
  return NextResponse.json({ ok: true, done });
}
