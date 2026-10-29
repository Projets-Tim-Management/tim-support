import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { runAlerts } from "@/modules/ads/lib/alerts-run";
import { sendConversions } from "@/modules/ads/lib/conversions-run";
import { runAdsSync } from "@/modules/ads/lib/sync-run";
import { evaluateTests } from "@/modules/ads/lib/tests-run";

/**
 * Synchro quotidienne des comptes publicitaires (plan Publicité, §4.6).
 *
 * Chaque compte non archivé : ses campagnes, puis ses chiffres des 7 derniers
 * jours aux trois niveaux — la régie corrige les siens après coup. Un compte en
 * erreur n'arrête pas les autres ; son erreur s'écrit sur sa fiche. Puis
 * l'alerte J-7 des jetons OAuth qui arrivent à échéance, et les urgences des
 * campagnes en ligne (lib/alerts-run.ts).
 *
 * `live=1` : seulement les comptes qui ont une campagne en diffusion, sans les
 * rappels de jetons. Plus planifié chaque heure (décision du 29/10/2026 : la
 * relecture de nuit suffit) ; reste disponible pour une relecture à la main.
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
  // Les urgences, sur les chiffres qu'on vient de lire (§9 nonies, étape 2). Une erreur ici ne fait pas échouer la synchro.
  const alerts = dry ? null : await runAlerts(payload).catch((e) => (payload.logger.error(`[publicité] alertes : ${(e as Error).message}`), null));
  // Et le verdict des tests A/B ouverts, sur les mêmes chiffres (§9 nonies, étape 4).
  const tests = dry ? null : await evaluateTests(payload).catch((e) => (payload.logger.error(`[publicité] tests : ${(e as Error).message}`), null));
  // Puis ce que deviennent les leads, renvoyé à Meta — avec l'accord « Publicité » seulement (§9 nonies, étape 6).
  const conversions = dry ? null : await sendConversions(payload).catch((e) => (payload.logger.error(`[publicité] conversions : ${(e as Error).message}`), null));

  const done = results.filter((r) => r.decision === "ok");
  payload.logger.info(
    `[cron] synchro publicité${live ? " (horaire)" : ""} : ${done.length} compte(s)${dry ? " (à blanc)" : ""}, ` +
      `${done.filter((r) => r.error).length} en échec, ${results.length - done.length} ignoré(s), ${alerted.length} alerte(s) J-7` +
      (alerts ? `, alertes : ${alerts.opened} ouverte(s), ${alerts.confirmed} confirmée(s), ${alerts.resolved} close(s), ${alerts.notified} e-mail(s).` : "."),
  );
  return NextResponse.json({ ok: true, dry, live, results, alerted, alerts, tests, conversions });
}
