import type { Payload } from "payload";

import { MAX_NEW_PER_WEEK, MAX_WAITING_IDEAS } from "@/modules/editorial/lib/articles/proposals";
import { CHANGE_LABEL, logOf, VERDICT_LABEL } from "@/modules/editorial/lib/articles/changes";
import { diagnose, type SerpContext } from "@/modules/editorial/lib/articles/performance";
import { loadSerpContexts, serpOfArticle } from "@/modules/editorial/lib/articles/performance-data";
import { articleStatusMeta } from "@/modules/editorial/lib/articles/statuses";

/**
 * CE QUE PAIGE LIT DU TABLEAU DES ARTICLES pour sa piste « articles » (étape 3,
 * 18/11/2026) : les thématiques et leur priorité, chaque article (sujet,
 * thématique, statut, chiffres), la place pour de nouvelles idées, et ce que la
 * direction a déjà arrêté ou refusé (à ne pas reproposer).
 */

type Raw = Record<string, unknown>;
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));
const themeNumber = (t: unknown) => (t && typeof t === "object" ? num((t as Raw).number) : null);

/** Le bloc, à partir des fiches (thématique peuplée) et des thématiques. Pur (testé). */
export function buildBoardForPlan(articles: Raw[], themes: Raw[], now = new Date(), serp: Map<string, SerpContext> = new Map()) {
  const waiting = articles.filter((a) => a.status === "idee" || a.status === "validee").length;
  return {
    thematiques: [...themes]
      .sort((a, b) => Number(a.priority ?? 99) - Number(b.priority ?? 99))
      .map((t) => ({
        numero: t.number,
        nom: t.name,
        type: t.kind,
        priorite: t.priority,
        pilier: t.pillar,
        sousThematiques: Array.isArray(t.subthemes) ? (t.subthemes as Raw[]).map((s) => s.name) : [],
      })),
    articlesDecidesEnAttenteDeRedaction: waiting,
    // Plus de 4 articles validés attendent leur créneau : pas de nouvel article (19/11/2026).
    articlesProgrammes: articles.filter((a) => ["image", "pret", "programme"].includes(String(a.status))).length,
    placePourDesIdees: articles.filter((a) => ["image", "pret", "programme"].includes(String(a.status))).length > 4 ? 0 : Math.max(0, Math.min(MAX_NEW_PER_WEEK, MAX_WAITING_IDEAS - waiting)),
    articles: articles
      .filter((a) => a.status !== "arretee")
      .map((a) => ({
        titre: a.title,
        slug: a.slug,
        thematique: themeNumber(a.theme),
        statut: articleStatusMeta(String(a.status))?.label ?? a.status,
        motCle: a.keyword || null,
        intention: a.intent ?? null,
        clicsGoogleCumules: num(a.gscClicks),
        clics28j: num(a.gscClicks28),
        clics28jAvant: num(a.gscClicks28Prev),
        position: num(a.gscPosition),
        tldr: a.hasTldr === true,
        repriseEnAttente: a.refreshState === "proposee",
        // Le diagnostic de performance (19/11/2026) : verdict, pourquoi, quoi faire, raison de reprise.
        ...((a.status === "publie" || a.status === "a-rafraichir") && (() => {
          const d = diagnose(a, now, serpOfArticle(serp, a));
          const log = logOf(a);
          return {
            performance: { verdict: d.label, pourquoi: d.why, quoiFaire: d.action, raisonDeReprise: d.refreshReason ?? null, ...(d.suggestedKeyword ? { motCleSuggere: d.suggestedKeyword } : {}) },
            ...(log.length ? { modifications: log.slice(-4).map((e) => ({ le: e.le, type: CHANGE_LABEL[e.type], quoi: e.detail, verdict: e.annulee ? "annulée" : e.verdict ? VERDICT_LABEL[e.verdict] : "en attente (4 semaines)", chiffres: e.lecture ?? null })) } : {}),
          };
        })()),
      })),
    ideesArretees: articles.filter((a) => a.status === "arretee").map((a) => ({ titre: a.title, motCle: a.keyword, motif: a.decisionNote })),
    reprisesRefusees: articles.filter((a) => a.refreshState === "refusee").map((a) => ({ titre: a.title, motif: a.refreshDecisionNote, le: String(a.refreshDecidedAt ?? "").slice(0, 10) })),
  };
}

export async function loadArticleBoardForPlan(payload: Payload) {
  const [articles, themes, serp] = await Promise.all([
    payload
      .find({
        collection: "articles" as never,
        pagination: false,
        depth: 1,
        overrideAccess: true,
        select: { title: true, slug: true, theme: true, status: true, keyword: true, intent: true, publishedAt: true, gscClicks: true, gscImpressions: true, gscClicks28: true, gscClicks28Prev: true, gscPosition: true, ga4AiSessions: true, scoreCoverage: true, coverageTarget: true, gscQueries: true, changesLog: true, hasTldr: true, refreshState: true, refreshDecisionNote: true, refreshDecidedAt: true, decisionNote: true } as never,
      })
      .then((r) => r.docs as unknown as Raw[]),
    payload.find({ collection: "article-themes" as never, pagination: false, depth: 0, overrideAccess: true }).then((r) => r.docs as unknown as Raw[]),
    loadSerpContexts(payload).catch(() => new Map<string, SerpContext>()),
  ]);
  return buildBoardForPlan(articles, themes, new Date(), serp);
}
