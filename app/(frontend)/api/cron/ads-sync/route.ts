import { NextResponse } from "next/server";

import { payloadClient } from "@/core/payload-client";
import { runAdsSync } from "@/modules/ads/lib/sync-run";

/**
 * Synchro quotidienne des comptes publicitaires (plan Publicité, §4.6).
 *
 * Chaque compte non archivé : ses campagnes, puis ses chiffres des 7 derniers
 * jours aux trois niveaux — la régie corrige les siens après coup. Un compte en
 * erreur n'arrête pas les autres ; son erreur s'écrit sur sa fiche. Puis
 * l'alerte J-7 des jetons OAuth qui arrivent à échéance.
 *
 * `dry=1` : dit quels comptes seraient synchronisés, sans rien lire chez la régie.
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
  const dry = new URL(req.url).searchParams.get("dry") === "1";
  const payload = await payloadClient();
  const { results, alerted } = await runAdsSync(payload, { dry });

  const done = results.filter((r) => r.decision === "ok");
  payload.logger.info(
    `[cron] synchro publicité : ${done.length} compte(s)${dry ? " (à blanc)" : ""}, ` +
      `${done.filter((r) => r.error).length} en échec, ${results.length - done.length} ignoré(s), ${alerted.length} alerte(s) J-7.`,
  );
  return NextResponse.json({ ok: true, dry, results, alerted });
}
