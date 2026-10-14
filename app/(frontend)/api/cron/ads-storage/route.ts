import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { cleanupAdsStorage } from "@/modules/ads/lib/storage-cleanup";

/**
 * Chaque nuit : le ménage du stockage des pubs (plan Publicité) — ZIP de plus
 * de 24 h, affiches remplacées et fichiers orphelins de plus de 7 jours. Voir
 * modules/ads/lib/storage-cleanup.ts. « ?a-blanc=1 » compte sans supprimer.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const payload = await payloadClient();
  const dryRun = new URL(req.url).searchParams.get("a-blanc") === "1";
  const r = await cleanupAdsStorage(payload, { dryRun });
  payload.logger.info(
    `[cron] ménage du stockage des pubs${dryRun ? " (à blanc)" : ""} : ${r.affiches} affiche(s), ${r.zips} ZIP, ${r.orphelins} fichier(s) orphelin(s), ${(r.octets / 1e6).toFixed(1)} Mo${r.arrete ? ` — ${r.arrete}` : ""}`,
  );
  return NextResponse.json({ ok: !r.arrete, dryRun, ...r });
}
