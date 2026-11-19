import { dfsPost, FRANCE } from "@/modules/editorial/lib/competitors/dataforseo";

/**
 * LA RECHERCHE DE MOTS-CLÉS (DataForSEO Labs, Google France ; 19/11/2026).
 * Tarif relevé le 19/11/2026 : 0,012 $ par appel + 0,00012 $ par ligne rendue.
 *  - keywordOverview : volume mensuel, difficulté (0-100), intention, CPC (≤ 700 requêtes par appel) ;
 *  - rankedKeywords  : les requêtes sur lesquelles un domaine est classé, et sa position ;
 *  - competitorsDomain : les domaines qui se classent sur les mêmes requêtes que nous.
 * Les lectures de réponse sont pures (testées).
 */

type Raw = Record<string, unknown>;
const arr = (v: unknown): Raw[] => (Array.isArray(v) ? (v as Raw[]) : []);
const obj = (v: unknown): Raw => (v && typeof v === "object" && !Array.isArray(v) ? (v as Raw) : {});
const num = (v: unknown) => (v == null || v === "" ? null : Number(v));

function taskOf(json: Raw): { items: Raw[]; result: Raw; cost: number } {
  const task = arr(json.tasks)[0] ?? {};
  if (Number(json.status_code) !== 20000 || Number(task.status_code) !== 20000) throw new Error(`DataForSEO : ${String(task.status_message ?? json.status_message ?? "réponse illisible")} (code ${String(task.status_code ?? json.status_code ?? "?")})`);
  const result = arr(task.result)[0] ?? {};
  return { items: arr(result.items), result, cost: Number(task.cost ?? 0) };
}

export type KeywordMetrics = { keyword: string; volume: number | null; difficulty: number | null; intent: string | null; cpc: number | null };

const metricsOf = (k: Raw, keyword: string): KeywordMetrics => ({
  keyword,
  volume: num(obj(k.keyword_info).search_volume),
  difficulty: num(obj(k.keyword_properties).keyword_difficulty),
  intent: (obj(k.search_intent_info).main_intent as string) ?? null,
  cpc: num(obj(k.keyword_info).cpc),
});

export function parseOverview(json: Raw): { rows: KeywordMetrics[]; cost: number } {
  const { items, cost } = taskOf(json);
  return { rows: items.map((i) => metricsOf(i, String(i.keyword ?? ""))), cost };
}

export type RankedRow = KeywordMetrics & { position: number; url: string; type: string; etv: number | null };

export function parseRanked(json: Raw): { rows: RankedRow[]; total: number; cost: number } {
  const { items, result, cost } = taskOf(json);
  return {
    rows: items.map((i) => {
      const kd = obj(i.keyword_data);
      const s = obj(obj(i.ranked_serp_element).serp_item);
      return { ...metricsOf(kd, String(kd.keyword ?? "")), position: Number(s.rank_group ?? 0), url: String(s.url ?? ""), type: String(s.type ?? "organic"), etv: num(s.etv) };
    }),
    total: Number(result.total_count ?? 0),
    cost,
  };
}

export type CompetitorDomain = { domain: string; shared: number; avgPosition: number | null; keywords: number | null };

export function parseCompetitors(json: Raw): { rows: CompetitorDomain[]; cost: number } {
  const { items, cost } = taskOf(json);
  return {
    rows: items.map((i) => ({ domain: String(i.domain ?? ""), shared: Number(i.intersections ?? 0), avgPosition: num(i.avg_position), keywords: num(obj(obj(i.full_domain_metrics).organic).count) })),
    cost,
  };
}

const LOC = { location_code: FRANCE, language_code: "fr" };

export async function keywordOverview(keywords: string[]) {
  const clean = [...new Set(keywords.map((k) => k.toLowerCase().trim()).filter((k) => k && k.length <= 80 && k.split(/\s+/).length <= 10))].slice(0, 700);
  if (!clean.length) return { rows: [] as KeywordMetrics[], cost: 0 };
  return parseOverview(await dfsPost("dataforseo_labs/google/keyword_overview/live", { keywords: clean, ...LOC }));
}

export async function rankedKeywords(target: string, o: { limit?: number; maxPosition?: number; minVolume?: number } = {}) {
  const filters: unknown[] = [["ranked_serp_element.serp_item.rank_group", "<=", o.maxPosition ?? 100]];
  if (o.minVolume) filters.push("and", ["keyword_data.keyword_info.search_volume", ">=", o.minVolume]);
  return parseRanked(await dfsPost("dataforseo_labs/google/ranked_keywords/live", { target, ...LOC, item_types: ["organic"], limit: o.limit ?? 1000, filters, order_by: ["keyword_data.keyword_info.search_volume,desc"] }));
}

export async function competitorsDomain(target: string, limit = 15) {
  return parseCompetitors(await dfsPost("dataforseo_labs/google/competitors_domain/live", { target, ...LOC, item_types: ["organic"], limit, exclude_top_domains: true, order_by: ["intersections,desc"] }));
}
