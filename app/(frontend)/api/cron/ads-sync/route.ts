import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
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
 * `live=1` : le passage de chaque heure — les comptes qui ont une campagne en
 * diffusion, sans les rappels de jetons (plan, §9 nonies).
 *
 * `dry=1` : dit quels comptes seraient synchronisés, sans rien lire chez la régie.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const params = new URL(req.url).searchParams;
  const dry = params.get("dry") === "1";
  const live = params.get("live") === "1";
  const payload = await payloadClient();
  const { results, alerted } = await runAdsSync(payload, { dry, live });

  const done = results.filter((r) => r.decision === "ok");
  payload.logger.info(
    `[cron] synchro publicité${live ? " (horaire)" : ""} : ${done.length} compte(s)${dry ? " (à blanc)" : ""}, ` +
      `${done.filter((r) => r.error).length} en échec, ${results.length - done.length} ignoré(s), ${alerted.length} alerte(s) J-7.`,
  );
  return NextResponse.json({ ok: true, dry, live, results, alerted });
}
