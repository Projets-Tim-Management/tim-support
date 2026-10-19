import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { tickPublications } from "@/modules/ads/lib/publish/run";

/**
 * Chaque minute : les publications chez Meta qui attendent (vidéo encore en
 * traitement, passe interrompue) avancent d'une passe, sous bail. Ne crée
 * jamais une publication : seul le geste « Publier » de Charlie en ouvre une.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const payload = await payloadClient();
  const r = await tickPublications(payload);
  if (r.checked) payload.logger.info(`[cron] publication : ${r.checked} en cours, ${r.done} terminée(s).`);
  return NextResponse.json({ ok: true, ...r });
}
