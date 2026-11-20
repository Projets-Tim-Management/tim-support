import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { publishDue } from "@/modules/editorial/lib/articles/actions";

/**
 * Les créneaux de publication des articles : le mardi et le jeudi, toutes les
 * 15 minutes de 7 h à 10 h (UTC) — 9 h à Paris, été comme hiver. Publie UN
 * article « Programmé » dont l'heure est passée, et vérifie qu'il est en ligne.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const payload = await payloadClient();
  const out = await publishDue(payload);
  if (out.status !== "pas-encore") payload.logger.info(`[articles] publication : ${out.status}${out.message ? ` — ${out.message}` : ""}`);
  return NextResponse.json(out);
}
