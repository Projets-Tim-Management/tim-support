import type { Payload } from "payload";

import { loadRecentPublications } from "@/modules/editorial/lib/articles/after-publish";
import { changesSummary } from "@/modules/editorial/lib/articles/changes";
import { diagnose, PERF_LABEL, type SerpContext } from "@/modules/editorial/lib/articles/performance";
import { loadSerpContexts, serpOfArticle } from "@/modules/editorial/lib/articles/performance-data";
import { articleStatusMeta, ARTICLE_STATUSES } from "@/modules/editorial/lib/articles/statuses";

/**
 * CE QUE LES AGENTS LISENT DU TABLEAU DES ARTICLES (règle du 16/11/2026 : « tout
 * ce qu'on fait sur le support ou la vitrine doit être analysé par les agents
 * concernés »). Joint à l'entonnoir d'Ana, donc lu par Sergey (point SEO de la
 * semaine), Paige (plan de contenu), Cléo (réseaux), l'audit et les veilles.
 *
 * L'état de la production éditoriale : combien d'articles par statut et par
 * thématique, ce qui est à vérifier, les échéances proches, les articles qui
 * n'ont pas encore le format GEO (TL;DR), les dernières publications, et les
 * chiffres de chaque article (clics Google, visites GA4, rafraîchis chaque lundi) :
 * les plus cliqués, et ceux dont les clics baissent (à rafraîchir d'abord).
 */

type Raw = Record<string, unknown>;
const DAY = 86_400_000;
const themeName = (t: unknown) => (t && typeof t === "object" ? String((t as Raw).name ?? "?") : "sans thématique");

export type ArticleInsights = ReturnType<typeof buildArticleInsights>;

/** Le bloc, à partir des fiches lues (thématique peuplée). Pur (testé). */
type Crit = { libelle?: string; statut?: string; resultat?: number | null };
const missed = (a: Raw) => ((a.scoreDetail as { criteres?: Crit[] } | null)?.criteres ?? []).filter((c) => c.statut !== "info" && c.resultat != null && c.resultat < 1).map((c) => String(c.libelle));
function notesOf(online: Raw[]) {
  const scored = online.filter((a) => a.scoreSeo != null || a.scoreGeo != null);
  if (!scored.length) return null;
  const avg = (k: string) => {
    const v = scored.map((a) => a[k]).filter((x) => x != null).map(Number);
    return v.length ? Math.round(v.reduce((x, y) => x + y, 0) / v.length) : null;
  };
  const counts = new Map<string, number>();
  for (const a of scored) for (const m of missed(a)) counts.set(m, (counts.get(m) ?? 0) + 1);
  const total = (a: Raw) => Number(a.scoreSeo ?? 100) + Number(a.scoreGeo ?? 100);
  return {
    seoMoyen: avg("scoreSeo"),
    geoMoyen: avg("scoreGeo"),
    criteresLesPlusManques: [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([critere, articles]) => ({ critere, articles })),
    // Couverture du sujet par rapport au top 10 de Google (comparateur, étape 4) : sous la cible = à enrichir.
    couvertureMoyenne: avg("scoreCoverage"),
    sousLaCibleDeCouverture: scored
      .filter((a) => a.scoreCoverage != null && a.coverageTarget != null && Number(a.scoreCoverage) < Number(a.coverageTarget))
      .sort((a, b) => Number(a.scoreCoverage) - Number(b.scoreCoverage))
      .slice(0, 10)
      .map((a) => ({ titre: a.title, couverture: a.scoreCoverage, cible: a.coverageTarget })),
    lesMoinsBienNotes: [...scored].sort((a, b) => total(a) - total(b)).slice(0, 10).map((a) => ({ titre: a.title, seo: a.scoreSeo ?? null, geo: a.scoreGeo ?? null, manques: missed(a).slice(0, 6) })),
  };
}

export function buildArticleInsights(articles: Raw[], now: Date, serp: Map<string, SerpContext> = new Map()) {
  const byStatus = Object.fromEntries(ARTICLE_STATUSES.map((s) => [s.label, articles.filter((a) => a.status === s.value).length]));
  const online = articles.filter((a) => a.status === "publie" || a.status === "a-rafraichir");
  const themes = new Map<string, { enLigne: number; enPreparation: number }>();
  for (const a of articles) {
    const k = themeName(a.theme);
    const t = themes.get(k) ?? { enLigne: 0, enPreparation: 0 };
    if (a.status === "publie" || a.status === "a-rafraichir") t.enLigne++;
    else if (a.status !== "depublie") t.enPreparation++;
    themes.set(k, t);
  }
  const soon = now.getTime() + 60 * DAY;
  const deadlines = articles
    .flatMap((a) => (Array.isArray(a.deadlines) ? (a.deadlines as Raw[]) : []).map((d) => ({ le: String(d.date ?? "").slice(0, 10), aFaire: String(d.reason ?? ""), article: String(a.title ?? "") })))
    .filter((d) => d.le && Date.parse(d.le) <= soon)
    .sort((a, b) => a.le.localeCompare(b.le));
  return {
    total: articles.length,
    parStatut: byStatus,
    parThematique: [...themes.entries()].map(([thematique, n]) => ({ thematique, ...n })),
    aVerifier: articles
      .filter((a) => a.status === "a-verifier")
      .slice(0, 15)
      .map((a) => ({ titre: a.title, motif: String(a.notes ?? "").slice(0, 200) })),
    echeancesDans60Jours: deadlines.slice(0, 15),
    // Ce qui attend la direction (Charlie) dans le tableau : relire les articles rédigés, décider des reprises.
    articlesARelire: articles.filter((a) => a.status === "a-relire").map((a) => ({ titre: a.title, thematique: themeName(a.theme) })),
    misesAJourEnCours: articles.filter((a) => a.status === "a-rafraichir").map((a) => ({ titre: a.title, raison: a.refreshReason, pourquoi: String(a.refreshWhy ?? "").slice(0, 300) })),
    enLigneSansTldr: online.filter((a) => a.hasTldr !== true).length,
    enLigneSansSource: online.filter((a) => !Number(a.sourcesCount)).length,
    lesPlusCliques: [...online]
      .filter((a) => Number(a.gscClicks) > 0)
      .sort((a, b) => Number(b.gscClicks) - Number(a.gscClicks))
      .slice(0, 10)
      .map((a) => ({ titre: a.title, clicsGoogleCumules: Number(a.gscClicks), clics28j: Number(a.gscClicks28 ?? 0), position: a.gscPosition ?? null, visitesGa4: Number(a.ga4Sessions ?? 0), visitesIa: Number(a.ga4AiSessions ?? 0) })),
    // Au moins 10 clics sur les 28 jours d'avant, et 30 % de moins sur les 28 derniers.
    clicsEnBaisse: online
      .filter((a) => Number(a.gscClicks28Prev) >= 10 && Number(a.gscClicks28 ?? 0) <= Number(a.gscClicks28Prev) * 0.7)
      .sort((a, b) => Number(b.gscClicks28Prev) - Number(b.gscClicks28 ?? 0) - (Number(a.gscClicks28Prev) - Number(a.gscClicks28 ?? 0)))
      .slice(0, 10)
      .map((a) => ({ titre: a.title, clics28j: Number(a.gscClicks28 ?? 0), clics28jAvant: Number(a.gscClicks28Prev), position: a.gscPosition ?? null })),
    // Le diagnostic de performance (19/11/2026) : combien performent, et ce qu'il faut améliorer.
    performance: (() => {
      const diags = online.map((a) => ({ a, d: diagnose(a, now, serpOfArticle(serp, a)) }));
      const count = Object.fromEntries(Object.values(PERF_LABEL).map((l) => [l, diags.filter((x) => x.d.label === l).length]));
      const pick = (v: string) =>
        diags
          .filter((x) => x.d.verdict === v)
          .sort((x, y) => Number(y.a.gscImpressions ?? 0) - Number(x.a.gscImpressions ?? 0))
          .slice(0, 10)
          .map((x) => ({ titre: x.a.title, pourquoi: x.d.why, quoiFaire: x.d.action }));
      return { lecture: "Verdict calculé sur les chiffres Search Console et GA4 du lundi (pas un avis d'IA).", parVerdict: count, aAmeliorer: pick("a-ameliorer"), moyens: pick("moyen") };
    })(),
    // Ce qu'ont donné les modifications des articles en ligne, 4 semaines après (19/11/2026).
    modificationsJugees: changesSummary(online),
    // La note SEO / GEO de conformité aux règles en vigueur (19/11/2026) : où l'équipe doit agir.
    notesSeoGeo: notesOf(online),
    dernieresPublications: [...online]
      .sort((a, b) => String(b.publishedAt ?? "").localeCompare(String(a.publishedAt ?? "")))
      .slice(0, 10)
      .map((a) => ({ le: String(a.publishedAt ?? "").slice(0, 10), titre: a.title, thematique: themeName(a.theme), statut: articleStatusMeta(String(a.status))?.label, adresse: a.wpLink })),
  };
}

/** Le bloc des articles ; null si le tableau est vide ou illisible. */
export async function loadArticleInsights(payload: Payload, now = new Date()): Promise<(ArticleInsights & { recommandationsDeReglesEnAttente: unknown[]; nouvellesPublications: unknown[] }) | null> {
  const r = await payload
    .find({
      collection: "articles" as never,
      pagination: false,
      depth: 1,
      overrideAccess: true,
      select: { title: true, keyword: true, status: true, changesLog: true, gscQueries: true, theme: true, notes: true, deadlines: true, hasTldr: true, sourcesCount: true, publishedAt: true, wpLink: true, ideaWhy: true, refreshState: true, refreshReason: true, refreshWhy: true, gscClicks: true, gscImpressions: true, gscClicks28: true, gscClicks28Prev: true, gscPosition: true, ga4Sessions: true, ga4AiSessions: true, scoreSeo: true, scoreGeo: true, scoreDetail: true, scoreCoverage: true, coverageTarget: true } as never,
    })
    .catch(() => null);
  const docs = (r?.docs ?? []) as unknown as Raw[];
  if (!docs.length) return null;
  // Les recommandations de règles de Sergey qui attendent la décision de la direction (étape 4).
  const recos = await payload
    .find({ collection: "article-rule-proposals" as never, where: { status: { equals: "proposee" } }, pagination: false, depth: 0, overrideAccess: true, select: { title: true, part: true, month: true } as never })
    .then((x) => (x.docs as unknown as Raw[]).map((d) => ({ titre: d.title, partie: d.part, mois: d.month })))
    .catch(() => []);
  // Les publications des 30 derniers jours (lien, script vidéo, visuels, bilan) : Cléo les diffuse (étape 7).
  const nouvellesPublications = await loadRecentPublications(payload, now).catch(() => []);
  const serp = await loadSerpContexts(payload).catch(() => new Map<string, SerpContext>());
  return { ...buildArticleInsights(docs, now, serp), recommandationsDeReglesEnAttente: recos, nouvellesPublications };
}
