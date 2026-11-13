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
 * récapitulatif part aux admins une fois les passages du lundi finis.
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
  // La veille web du dimanche soir : une par minute, un agent après l'autre (Équipe IA, 12/11/2026).
  const veille = await runDueVeille(payload).catch((e) => ({ status: "echec" as const, message: (e as Error).message }));
  if (veille.status === "faite" || veille.status === "echec") payload.logger.info(`[équipe IA] veille de la semaine : ${veille.status}${"member" in veille && veille.member ? ` (${veille.member})` : ""}${veille.message ? ` — ${veille.message}` : ""}.`);
  // La photo des chiffres de la semaine, le lundi dès 7 h (sans IA) : tendances et avant / après des recommandations.
  const snapshot = await ensureWeeklySnapshot(payload).catch((e) => (payload.logger.error(`[équipe IA] photo de la semaine : ${(e as Error).message}`), "echec" as const));
  if (snapshot === "prise") payload.logger.info("[équipe IA] photo de la semaine prise.");
  // Les plans de site des concurrents, le dimanche dès 18 h (sans IA), puis le rapport de Guy le lundi dès 6 h.
  const crawl = await runCompetitorCrawl(payload).catch((e) => (payload.logger.error(`[équipe IA] plans des concurrents : ${(e as Error).message}`), null));
  if (crawl && crawl.read) payload.logger.info(`[équipe IA] plans des concurrents : ${crawl.read} lu(s), ${crawl.left} restant(s).`);
  const competition = await runCompetitionReport(payload).catch((e) => ({ status: "echec" as const, message: (e as Error).message }));
  if (competition.status === "fait" || competition.status === "echec") payload.logger.info(`[équipe IA] rapport de concurrence : ${competition.status}${competition.message ? ` (${competition.message})` : ""}.`);
  // Le plan de contenu de Paige, le lundi après le rapport de Guy (au plus tard 7 h).
  const content = await runContentPlan(payload).catch((e) => ({ status: "echec" as const, message: (e as Error).message }));
  if (content.status === "fait" || content.status === "echec") payload.logger.info(`[équipe IA] plan de contenu : ${content.status}${content.message ? ` (${content.message})` : ""}.`);
  // La visibilité dans les IA (Georges) : un lot de questions par passage dès le 1er du mois, puis son rapport.
  const visibility = await runVisibilityDue(payload).catch((e) => ({ tick: { status: "echec" as const, message: (e as Error).message, measured: 0, left: 0 }, report: null }));
  if (visibility.tick.measured || visibility.tick.status === "echec" || visibility.tick.status === "budget") payload.logger.info(`[équipe IA] visibilité IA : ${visibility.tick.status}, ${visibility.tick.measured} réponse(s), ${visibility.tick.left} restante(s)${visibility.tick.message ? ` (${visibility.tick.message})` : ""}.`);
  if (visibility.report && (visibility.report.status === "fait" || visibility.report.status === "echec")) payload.logger.info(`[équipe IA] rapport de visibilité IA : ${visibility.report.status}${visibility.report.message ? ` (${visibility.report.message})` : ""}.`);
  // Le contrôle technique du site (Robert), le premier jour ouvré du mois dès 5 h — avant l'audit d'Ana.
  const tech = await runTechAudit(payload).catch((e) => ({ status: "echec" as const, message: (e as Error).message }));
  if (tech.status === "fait" || tech.status === "echec") payload.logger.info(`[équipe IA] contrôle technique : ${tech.status}${tech.message ? ` (${tech.message})` : ""}.`);
  // L'autorité (Linda), une fois le rapport de Georges du mois fait (au plus tard le 7).
  const authority = await runAuthority(payload).catch((e) => ({ status: "echec" as const, message: (e as Error).message }));
  if (authority.status === "fait" || authority.status === "echec") payload.logger.info(`[équipe IA] rapport d'autorité : ${authority.status}${authority.message ? ` (${authority.message})` : ""}.`);
  // Les réseaux et la vidéo (Cléo), le premier jour ouvré de la semaine dès 5 h — avant les objectifs de Serge.
  const social = await runSocial(payload).catch((e) => ({ status: "echec" as const, message: (e as Error).message }));
  if (social.status === "fait" || social.status === "echec") payload.logger.info(`[équipe IA] rapport réseaux & vidéo : ${social.status}${social.message ? ` (${social.message})` : ""}.`);
  // L'audit du site vitrine par l'analyste SEO/GEO, le premier jour ouvré du mois dès 6 h (avant la revue de Serge).
  const audit = await runSiteAudit(payload).catch((e) => ({ status: "echec" as const, message: (e as Error).message }));
  if (audit.status === "fait" || audit.status === "echec") payload.logger.info(`[équipe IA] audit du site : ${audit.status}${audit.message ? ` (${audit.message})` : ""}.`);
  // Les objectifs de la semaine de Serge (SEO/GEO), le lundi dès 7 h : créneaux posés dans l'agenda de la direction.
  const seoWeek = await runSeoWeekly(payload).catch((e) => ({ status: "echec" as const, message: (e as Error).message }));
  if (seoWeek.status === "faite" || seoWeek.status === "echec") payload.logger.info(`[équipe IA] objectifs SEO/GEO de la semaine : ${seoWeek.status}${seoWeek.message ? ` (${seoWeek.message})` : ""}.`);
  // La revue du lundi de Margaux (directrice SEA), après les passages du lundi de Camille (Équipe IA, 12/11/2026).
  const review = await runWeeklyReview(payload).catch((e) => ({ status: "echec" as const, message: (e as Error).message }));
  if (review.status === "faite" || review.status === "echec") payload.logger.info(`[équipe IA] revue du lundi : ${review.status}${review.message ? ` (${review.message})` : ""}.`);
  const done = await tickDueRuns(payload, new Date(start + (maxDuration - 20) * 1000));
  if (done.length) payload.logger.info(`[cron] agents de campagne : ${done.map((d) => `${d.run} → ${typeof d.result === "string" ? d.result : d.result.outcome}`).join(", ")}`);
  return NextResponse.json({ ok: true, scheduled, recap, veille: veille.status, competition: competition.status, content: content.status, visibility: visibility.tick.status, tech: tech.status, authority: authority.status, social: social.status, audit: audit.status, seoWeek: seoWeek.status, review: review.status, done });
}
