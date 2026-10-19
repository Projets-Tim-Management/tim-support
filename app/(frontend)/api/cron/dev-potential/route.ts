import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { refreshPotentials } from "@/modules/dev/lib/potential";

/**
 * Chaque nuit : le potentiel de tous les développements demandés par des
 * prospects (voir modules/dev/lib/potential.ts). Le jour, il suit les
 * changements de statut et les échanges notés ; la nuit rattrape ce que le
 * temps seul fait bouger — un prospect silencieux depuis 30 jours refroidit,
 * un échange sorti des 60 jours ne compte plus.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const payload = await payloadClient();
  const count = await refreshPotentials(payload);
  payload.logger.info(`[cron] potentiel : ${count} développement(s) recalculé(s)`);
  return NextResponse.json({ ok: true, count });
}
