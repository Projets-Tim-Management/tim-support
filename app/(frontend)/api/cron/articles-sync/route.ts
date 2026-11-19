import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { syncArticlesFromWordPress } from "@/modules/editorial/lib/articles/sync";
import { isWpConfigured } from "@/modules/editorial/lib/articles/wp-client";

/**
 * Chaque heure : les articles modifiés dans WordPress depuis la dernière
 * synchronisation arrivent dans le tableau (Éditorial › Articles). Si Charlie
 * modifie un article dans WordPress, le support récupère la version à jour.
 * Lecture seule côté WordPress.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  if (!isWpConfigured()) return NextResponse.json({ skipped: "Accès WordPress de la vitrine non configuré." });
  const payload = await payloadClient();
  try {
    const out = await syncArticlesFromWordPress(payload);
    // Les fiches métier (étape 9) : même synchronisation, lecture seule.
    const { syncJobSheetsFromWordPress } = await import("@/modules/editorial/lib/jobs/sync");
    const jobs = await syncJobSheetsFromWordPress(payload).catch((e) => ({ read: 0, created: 0, updated: 0, errors: [String(e)] }));
    // Les notes SEO / GEO suivent le contenu synchronisé (aucun appel extérieur).
    if (out.created + out.updated + jobs.created + jobs.updated > 0) {
      const { scoreAll } = await import("@/modules/editorial/lib/score/run");
      await scoreAll(payload).catch((e) => payload.logger.error(`[notes] recalcul : ${e}`));
      const { coverageAll } = await import("@/modules/editorial/lib/competitors/run");
      await coverageAll(payload).catch((e) => payload.logger.error(`[couverture] recalcul : ${e}`));
    }
    // Le comparateur (étape 4) : 3 contenus réanalysés par heure au plus, étalés sur la semaine.
    const { refreshDueCompetitors } = await import("@/modules/editorial/lib/competitors/run");
    const competitors = await refreshDueCompetitors(payload).catch((e) => ({ analyzed: 0, errors: [String(e)] }));
    if (competitors.errors.length) payload.logger.warn(`[concurrents] ${competitors.errors.slice(0, 3).join(" ; ")}`);
    if (jobs.errors.length) payload.logger.warn(`[fiches métier] synchronisation : ${jobs.errors.slice(0, 3).join(" ; ")}`);
    if (out.errors.length) payload.logger.warn(`[articles] synchronisation : ${out.errors.length} erreur(s) — ${out.errors.slice(0, 3).join(" ; ")}`);
    return NextResponse.json({ ...out, competitors });
  } catch (err) {
    payload.logger.error(`[articles] synchronisation WordPress échouée : ${err}`);
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
