import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { queueDeadlineUpdates, runBacklinks } from "@/modules/editorial/lib/articles/after-publish";
import { runWritingTick } from "@/modules/editorial/lib/articles/writer/pipeline";
import { runJobTick } from "@/modules/editorial/lib/jobs/pipeline";
import { WRITING_STAGES } from "@/modules/editorial/lib/articles/writer/stages";

/**
 * Toutes les 5 minutes : UNE étape de la rédaction d'un article (recherche des
 * faits, préparation, rédaction et contrôle, relance) ou d'une mise à jour ;
 * sinon, le maillage retour d'un article publié. Chaque heure, les échéances. Démarre seule une idée
 * validée (1 par jour, pause dès 4 articles à relire). L'image, elle, est créée par la
 * direction dans Claude Design (prompt fourni par le support), puis déposée. Coût : budget de l'équipe SEO/GEO (plafonds du jour et du mois).
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const denied = cronGuard(req);
  if (denied) return denied;
  const payload = await payloadClient();
  // Une fois par heure : les échéances qui arrivent déclenchent une mise à jour (étape 7).
  if (new Date().getUTCMinutes() < 5) {
    const queued = await queueDeadlineUpdates(payload).catch(() => 0);
    if (queued) payload.logger.info(`[articles] échéances : ${queued} mise(s) à jour lancée(s).`);
  }
  const fail = (e: unknown) => ({ status: "echec" as const, message: e instanceof Error ? e.message : String(e) });
  // Victor, le rédacteur (Équipe IA) : « En service » décoché, rien ne s'écrit (articles, mises à jour, maillage, fiches).
  const { memberByKey } = await import("@/modules/ai-team/lib/shared-data");
  const writer = await memberByKey<{ active?: boolean | null; name?: string }>(payload, "seo-redacteur", { active: true, name: true }).catch(() => undefined);
  let out: { status: string; message?: string } = writer?.active === false ? { status: "pause", message: `${writer.name ?? "Le rédacteur"} n'est pas en service (Équipe IA).` } : await runWritingTick(payload, WRITING_STAGES).catch(fail);
  // Rien à rédiger : le maillage retour d'un article publié (étape 7).
  if (out.status === "pas-encore") out = await runBacklinks(payload).catch(fail);
  // Rien d'autre : une fiche métier (nouvelle fiche, ou chiffres de l'année), étape 9.
  if (out.status === "pas-encore") out = await runJobTick(payload).catch(fail);
  if (out.status !== "pas-encore") payload.logger.info(`[articles] ${out.status}${out.message ? ` — ${out.message}` : ""}`);
  return NextResponse.json(out);
}
