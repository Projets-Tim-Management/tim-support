import { NextResponse } from "next/server";

import { cronGuard } from "@/core/lib/cron-guard";
import { payloadClient } from "@/core/payload-client";
import { scheduleFollowUps } from "@/modules/ads/agent/followup";
import { tickDueRuns } from "@/modules/ads/agent/run";
import { maybeSendWeeklyRecap } from "@/modules/ads/lib/weekly-recap";
import { runWeeklyReview } from "@/modules/ai-team/lib/review";
import { runDueVeille } from "@/modules/ai-team/lib/veille";
import { runSeoWeekly } from "@/modules/ai-team/lib/seo-weekly";
import { runSiteAudit } from "@/modules/ai-team/lib/site-audit";
import { runCompetitorCrawl } from "@/modules/ai-team/lib/competitor-maps";
import { runCompetitionReport } from "@/modules/ai-team/lib/competition";
import { runContentPlan } from "@/modules/ai-team/lib/content-plan";
import { runVisibilityDue } from "@/modules/ai-team/lib/ai-visibility";
import { runTechAudit } from "@/modules/ai-team/lib/site-health";
import { runAuthority } from "@/modules/ai-team/lib/authority";
import { runSocial } from "@/modules/ai-team/lib/social";
import { ensureWeeklySnapshot } from "@/modules/ai-team/lib/snapshots";

/**
 * Chaque minute : lance les passages de SUIVI dus sur les campagnes en ligne
 * (le matin, le lundi, le premier lundi du mois — agent/followup.ts), puis fait
 * avancer les passages d'agent dont personne ne tient le verrou (fonction
 * coupée, déploiement, fin du temps après le lancement), et relance ceux en
 * pause de budget quand le plafond le permet de nouveau. Le lundi, le
 * récapitulatif part aux admins une fois les passages du lundi finis. Entre
 * les deux, le travail dû de l'équipe IA — un seul gros travail par réveil.
 *
 * Déclenché par Vercel Cron : « Authorization: Bearer <CRON_SECRET> ».
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const start = Date.now();
  const denied = cronGuard(req);
  if (denied) return denied;
  const payload = await payloadClient();
  // Une erreur d'ordonnancement ne doit pas empêcher les passages en cours d'avancer.
  const scheduled = await scheduleFollowUps(payload).catch((e) => (payload.logger.error(`[publicité] ordonnancement du suivi : ${(e as Error).message}`), []));
  for (const f of scheduled) {
    // Un plafond atteint reporterait le passage chaque minute : on ne le dit qu'une fois par heure.
    if (f.skipped) {
      if (new Date().getUTCMinutes() === 0) payload.logger.warn(`[publicité] suivi ${f.kind} de la campagne ${f.campaign} reporté : ${f.skipped}`);
    } else payload.logger.info(`[publicité] suivi ${f.kind} lancé sur la campagne ${f.campaign} (passage ${f.run}).`);
  }
  // Le récapitulatif du lundi, une fois les passages du lundi finis (décision du 29/10/2026).
  const recap = await maybeSendWeeklyRecap(payload).catch((e) => (payload.logger.error(`[publicité] récap du lundi : ${(e as Error).message}`), "echec" as const));
  if (recap === "envoye" || recap === "echec") payload.logger.info(`[publicité] récap du lundi : ${recap}.`);
  // La photo des chiffres de la semaine, le lundi dès 7 h (sans IA) : tendances et avant / après des recommandations.
  const snapshot = await ensureWeeklySnapshot(payload).catch((e) => (payload.logger.error(`[équipe IA] photo de la semaine : ${(e as Error).message}`), "echec" as const));
  if (snapshot === "prise") payload.logger.info("[équipe IA] photo de la semaine prise.");
  // Les plans de site des concurrents, le dimanche dès 18 h (sans IA, par lots).
  const crawl = await runCompetitorCrawl(payload).catch((e) => (payload.logger.error(`[équipe IA] plans des concurrents : ${(e as Error).message}`), null));
  if (crawl && crawl.read) payload.logger.info(`[équipe IA] plans des concurrents : ${crawl.read} lu(s), ${crawl.left} restant(s).`);

  // LE TRAVAIL DE L'ÉQUIPE IA : UN SEUL gros travail par réveil (14/11/2026). Le réveil a 5 minutes au plus ; enchaîner
  // un rapport avec recherche web, les objectifs de Serge et la revue de Margaux dans la même minute pouvait les
  // dépasser, et Vercel coupait le dernier en route. Chacun regarde s'il est dû ; le premier qui travaille vraiment
  // prend le réveil, les suivants attendent la minute d'après. L'ordre est celui de leurs dépendances.
  const fail = (e: unknown) => ({ status: "echec" as const, message: (e as Error).message });
  const ran = (status: string) => status === "fait" || status === "faite" || status === "echec";
  const steps: { name: string; label: string; run: () => Promise<{ status: string; message?: string; member?: string }> }[] = [
    // La veille web du dimanche soir : un agent après l'autre.
    { name: "veille", label: "veille de la semaine", run: () => runDueVeille(payload).catch(fail) },
    // Le rapport de Guy (lundi dès 6 h), puis le plan de contenu de Paige (au plus tard 7 h).
    { name: "competition", label: "rapport de concurrence", run: () => runCompetitionReport(payload).catch(fail) },
    { name: "content", label: "plan de contenu", run: () => runContentPlan(payload).catch(fail) },
    // La visibilité dans les IA (Georges) : un lot de questions par réveil dès le 1er du mois, puis son rapport.
    {
      name: "visibility",
      label: "visibilité IA",
      run: async () => {
        const v = await runVisibilityDue(payload).catch((e) => ({ tick: { ...fail(e), measured: 0, left: 0 }, report: null }));
        const report = v.report && ran(v.report.status) ? v.report : null;
        return report ?? { status: v.tick.measured || v.tick.status === "echec" ? "fait" : "pas-encore", message: `${v.tick.status}, ${v.tick.measured} réponse(s), ${v.tick.left} restante(s)${v.tick.message ? ` — ${v.tick.message}` : ""}` };
      },
    },
    // Le contrôle technique (Robert), l'autorité (Linda), les réseaux (Cléo), l'audit d'Ana.
    { name: "tech", label: "contrôle technique", run: () => runTechAudit(payload).catch(fail) },
    { name: "authority", label: "rapport d'autorité", run: () => runAuthority(payload).catch(fail) },
    { name: "social", label: "rapport réseaux & vidéo", run: () => runSocial(payload).catch(fail) },
    { name: "audit", label: "audit du site", run: () => runSiteAudit(payload).catch(fail) },
    // Les objectifs de la semaine de Serge (lundi dès 7 h), puis la revue de Margaux (lundi dès 10 h).
    { name: "seoWeek", label: "objectifs SEO/GEO de la semaine", run: () => runSeoWeekly(payload).catch(fail) },
    { name: "review", label: "revue du lundi", run: () => runWeeklyReview(payload).catch(fail) },
  ];
  const team: Record<string, string> = {};
  for (const step of steps) {
    // Un réveil déjà bien entamé (ordonnancement lent) laisse le gros travail à la minute suivante.
    if (Date.now() - start > 60_000) break;
    const t0 = Date.now();
    const r = await step.run();
    team[step.name] = r.status;
    // A vraiment travaillé : fait, ou échoué APRÈS avoir travaillé. Un échec immédiat (agent introuvable…) ne prend
    // pas le réveil : il bloquerait chaque minute tout ce qui le suit.
    if (r.status === "fait" || r.status === "faite" || (r.status === "echec" && Date.now() - t0 > 5_000)) {
      payload.logger.info(`[équipe IA] ${step.label} : ${r.status}${r.member ? ` (${r.member})` : ""}${r.message ? ` — ${r.message}` : ""}.`);
      break;
    } else if (r.status === "echec") payload.logger.warn(`[équipe IA] ${step.label} : échec immédiat${r.message ? ` — ${r.message}` : ""}.`);
  }
  const done = await tickDueRuns(payload, new Date(start + (maxDuration - 20) * 1000));
  if (done.length) payload.logger.info(`[cron] agents de campagne : ${done.map((d) => `${d.run} → ${typeof d.result === "string" ? d.result : d.result.outcome}`).join(", ")}`);
  return NextResponse.json({ ok: true, scheduled, recap, team, done });
}
