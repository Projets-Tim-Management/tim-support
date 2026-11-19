import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { refreshArticleStats } from "@/modules/editorial/lib/articles/stats";

/**
 * Chaque lundi : clics Google (Search Console) et visites (GA4) de chaque
 * article du tableau (Éditorial › Articles). Gratuit, aucun appel à un modèle.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const payload = await payloadClient();
  try {
    const out = await refreshArticleStats(payload);
    if (out.errors.length) payload.logger.warn(`[articles] chiffres : ${out.errors.slice(0, 3).join(" ; ")}`);
    return NextResponse.json(out);
  } catch (err) {
    payload.logger.error(`[articles] chiffres Search Console / GA4 impossibles : ${err}`);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
