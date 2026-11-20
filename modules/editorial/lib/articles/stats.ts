import type { Payload } from "payload";

import { classifyGa4Source, ga4LandingPages, type Ga4PageRow } from "@/modules/analytics/lib/seo-ga4";
import { gscPages, gscQueryPages, gscWindow, type GscRow } from "@/modules/analytics/lib/seo-gsc";
import { reviewSnapshots } from "@/modules/editorial/lib/articles/after-publish";
import { judgeChanges } from "@/modules/editorial/lib/articles/changes";

/**
 * LES CHIFFRES DE CHAQUE ARTICLE (demande de Charlie, 18/11/2026) — une fois par
 * semaine (cron du lundi) et à la demande (« Rafraîchir les chiffres »). Gratuit :
 * API Search Console et GA4, aucun appel à un modèle.
 *
 *  - Search Console = les CLICS DEPUIS GOOGLE : cumulés sur tout ce que Google
 *    garde (16 mois), les 28 derniers jours et les 28 d'avant, les impressions,
 *    la position moyenne des 3 derniers mois (pondérée par les impressions).
 *    Données fiables jusqu'à J-3.
 *  - GA4 = toutes les VISITES arrivées sur l'article (Google, IA, réseaux,
 *    direct…) sur la même période, dont celles venues d'un assistant IA.
 */

const DAY = 86_400_000;
const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/** Le chemin d'une adresse, en minuscules, sans « / » final ni paramètres : la clé commune aux trois sources. */
export function pathKey(url: string | null | undefined): string | null {
  const v = String(url ?? "").trim();
  if (!v) return null;
  let path = v;
  try {
    path = new URL(v, "https://tim-management.co").pathname;
  } catch {
    path = v.split(/[?#]/)[0];
  }
  path = decodeURIComponent(path).toLowerCase().replace(/\/+$/, "");
  return path || "/";
}

export type ArticleStats = {
  gscClicks: number;
  gscImpressions: number;
  gscPosition: number | null;
  gscClicks28: number;
  gscClicks28Prev: number;
  ga4Sessions: number;
  ga4AiSessions: number;
};

const sumBy = (rows: GscRow[]) => {
  const m = new Map<string, { clicks: number; impressions: number; posWeighted: number }>();
  for (const r of rows) {
    const k = pathKey(r.keys[0]);
    if (!k) continue;
    const e = m.get(k) ?? { clicks: 0, impressions: 0, posWeighted: 0 };
    e.clicks += r.clicks;
    e.impressions += r.impressions;
    e.posWeighted += r.position * r.impressions;
    m.set(k, e);
  }
  return m;
};

/** Les chiffres de chaque article, à partir des lignes lues. Pur (testé). Clé = id de la fiche. */
export function buildArticleStats(
  articles: { id: number | string; wpLink?: string | null }[],
  src: { total: GscRow[]; last28: GscRow[]; prev28: GscRow[]; last90: GscRow[]; ga4: Ga4PageRow[] },
): Map<number | string, ArticleStats> {
  const total = sumBy(src.total);
  const l28 = sumBy(src.last28);
  const p28 = sumBy(src.prev28);
  const l90 = sumBy(src.last90);
  const ga4 = new Map<string, { sessions: number; ai: number }>();
  for (const r of src.ga4) {
    const k = pathKey(r.page);
    if (!k) continue;
    const e = ga4.get(k) ?? { sessions: 0, ai: 0 };
    e.sessions += r.sessions;
    if (classifyGa4Source(r.source, r.medium)?.kind === "ai") e.ai += r.sessions;
    ga4.set(k, e);
  }
  const out = new Map<number | string, ArticleStats>();
  for (const a of articles) {
    // Sans adresse publique (brouillon : « ?p=123 ») : zéro partout, plutôt que vide —
    // sinon le tri par clics place les brouillons en tête du tableau.
    const path = pathKey(a.wpLink);
    const k = path && path !== "/" ? path : "\u0000aucune-page";
    const t = total.get(k);
    const p90 = l90.get(k);
    out.set(a.id, {
      gscClicks: t?.clicks ?? 0,
      gscImpressions: t?.impressions ?? 0,
      gscPosition: p90 && p90.impressions ? Math.round((p90.posWeighted / p90.impressions) * 10) / 10 : null,
      gscClicks28: l28.get(k)?.clicks ?? 0,
      gscClicks28Prev: p28.get(k)?.clicks ?? 0,
      ga4Sessions: ga4.get(k)?.sessions ?? 0,
      ga4AiSessions: ga4.get(k)?.ai ?? 0,
    });
  }
  return out;
}

/** Les 5 requêtes Search Console qui amènent le plus d'impressions sur chaque page (90 jours). Pur. */
export function topQueriesByPath(rows: GscRow[]): Map<string, { requete: string; impressions: number; clics: number; position: number }[]> {
  const map = new Map<string, { requete: string; impressions: number; clics: number; position: number }[]>();
  for (const r of rows) {
    const path = pathKey(r.keys?.[1]);
    if (!path || !r.keys?.[0]) continue;
    const list = map.get(path) ?? [];
    list.push({ requete: r.keys[0], impressions: r.impressions, clics: r.clicks, position: Math.round(r.position * 10) / 10 });
    map.set(path, list);
  }
  for (const [k, list] of map) map.set(k, list.sort((a, b) => b.impressions - a.impressions).slice(0, 5));
  return map;
}

export type StatsResult = { articles: number; updated: number; withClicks: number; errors: string[]; period: { from: string; to: string } };

/** Lit Search Console et GA4, puis écrit les chiffres sur chaque fiche. */
export async function refreshArticleStats(payload: Payload, now = new Date()): Promise<StatsResult> {
  const w = gscWindow(now);
  const r28 = { from: day(w.endMs - 27 * DAY), to: w.end };
  const p28 = { from: day(w.endMs - 55 * DAY), to: day(w.endMs - 28 * DAY) };
  const r90 = { from: day(w.endMs - 89 * DAY), to: w.end };
  const errors: string[] = [];
  const [total, last28, prev28, last90, ga4, queryPages] = await Promise.all([
    gscPages(w.start, w.end),
    gscPages(r28.from, r28.to),
    gscPages(p28.from, p28.to),
    gscPages(r90.from, r90.to),
    // GA4 absent ou en erreur : les clics Google restent utiles, les visites restent à 0.
    ga4LandingPages(w.start).catch((e) => {
      errors.push(`GA4 : ${e instanceof Error ? e.message : String(e)}`);
      return [] as Ga4PageRow[];
    }),
    // Les requêtes de chaque page sur 90 jours (19/11/2026) : le vrai mot-clé de chaque article.
    gscQueryPages(now).catch((e) => {
      errors.push(`Requêtes par page : ${e instanceof Error ? e.message : String(e)}`);
      return [] as GscRow[];
    }),
  ]);
  const queriesByPath = topQueriesByPath(queryPages);
  const docs = (await payload.find({ collection: "articles" as never, pagination: false, depth: 0, overrideAccess: true, select: { wpLink: true, publishedAt: true, review30: true, review90: true, status: true, changesLog: true } as never })).docs as unknown as { id: number; wpLink?: string; publishedAt?: string; review30?: unknown; review90?: unknown; status?: string; changesLog?: unknown }[];
  const byId = new Map(docs.map((d) => [d.id, d]));
  const stats = buildArticleStats(docs, { total, last28, prev28, last90, ga4 });
  const at = now.toISOString();
  let updated = 0;
  let withClicks = 0;
  for (const [id, s] of stats) {
    try {
      // Les bilans à 30 et 90 jours de la publication (étape 7), pris une fois.
      const doc = (byId.get(id as number) ?? {}) as Record<string, unknown>;
      const reviews = reviewSnapshots(doc, s, now);
      // Les modifications qui ont 4 semaines complètes d'après : jugées avec les chiffres de ce lundi.
      const judged = judgeChanges({ ...doc, ...s }, now);
      const path = pathKey(String(doc.wpLink ?? ""));
      const gscQueries = path && queryPages.length ? (queriesByPath.get(path) ?? []) : undefined;
      await payload.update({ collection: "articles" as never, id, data: { ...s, ...reviews, ...(judged ? { changesLog: judged } : {}), ...(gscQueries ? { gscQueries } : {}), statsUpdatedAt: at } as never, overrideAccess: true, context: { fromWordPress: true } });
      updated++;
      if (s.gscClicks > 0) withClicks++;
    } catch (e) {
      errors.push(`Fiche ${id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // Les fiches métier (étape 9) : mêmes chiffres, mêmes sources, relevés en même temps.
  const jobs = (await payload.find({ collection: "job-sheets" as never, pagination: false, depth: 0, overrideAccess: true, select: { wpLink: true } as never }).catch(() => ({ docs: [] }))).docs as unknown as { id: number; wpLink?: string }[];
  for (const [id, s] of buildArticleStats(jobs, { total, last28, prev28, last90, ga4 })) {
    await payload.update({ collection: "job-sheets" as never, id, data: { ...s, statsUpdatedAt: at } as never, overrideAccess: true }).catch((e) => errors.push(`Fiche métier ${id} : ${e instanceof Error ? e.message : String(e)}`));
  }
  return { articles: docs.length, updated, withClicks, errors, period: { from: w.start, to: w.end } };
}
