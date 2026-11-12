import { cached, httpError, missingEnv, type SourceResult } from "@/modules/analytics/lib/seo-cache";
import { lastMonths } from "@/modules/analytics/lib/growth";
import { monthStart } from "@/modules/partner/lib/month";

/**
 * Bing Webmaster Tools — Bing pèse peu en clics, mais c'est l'INDEX de Copilot
 * et une des sources de ChatGPT Search : y être bien indexé, c'est aussi du GEO.
 *
 * Clé d'API : Bing Webmaster Tools → Paramètres → Accès API. On lit le trafic
 * quotidien et les requêtes (Bing en garde environ six mois).
 *
 * ⚠️ Le rapport « AI Performance » (citations dans Copilot et les résumés IA
 * de Bing, public preview depuis février 2026) n'a pas encore de méthode
 * d'API : il se consulte dans l'interface. Le jour où elle arrive, c'est ici
 * qu'elle se branche.
 */

export const BING_ENV = ["BING_WEBMASTER_API_KEY"];
const TTL = 6 * 3600_000;
const BASE = "https://ssl.bing.com/webmaster/api.svc/json";

const siteUrl = () => (process.env.BING_SITE_URL ?? process.env.GSC_SITE_URL ?? "").trim().replace(/^sc-domain:(.+)$/, "https://$1/");

/** « /Date(1730419200000-0800)/ » → horodatage. */
export const bingDate = (s: string) => Number(/\/Date\((-?\d+)/.exec(s)?.[1] ?? NaN);

type Traffic = { Date: string; Clicks: number; Impressions: number };
type QueryRow = { Query: string; Date: string; Clicks: number; Impressions: number; AvgImpressionPosition: number };

async function call<T>(method: string): Promise<T[]> {
  const q = new URLSearchParams({ siteUrl: siteUrl(), apikey: process.env.BING_WEBMASTER_API_KEY!.trim() });
  const res = await fetch(`${BASE}/${method}?${q}`, { cache: "no-store", signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw await httpError(res, "Bing Webmaster");
  return ((await res.json()) as { d?: T[] }).d ?? [];
}

export type BingAnalytics = {
  clicks: number;
  impressions: number;
  ctr: number | null;
  monthly: { month: string; clicks: number; impressions: number }[];
  queries: { query: string; clicks: number; impressions: number; ctr: number | null; position: number | null }[];
  /** Le dernier jour que Bing a renvoyé (ISO), toutes périodes : il peut s'arrêter bien avant aujourd'hui. */
  lastDay: string | null;
  /** Bing a-t-il au moins un jour de trafic dans la période ? */
  hasPeriodData: boolean;
};

export function buildBing(traffic: Traffic[], rows: QueryRow[], months: number, now: Date): BingAnalytics {
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1);
  const monthly = new Map(lastMonths(months, now).map((m) => [m, { month: m, clicks: 0, impressions: 0 }]));
  let clicks = 0;
  let impressions = 0;
  let periodDays = 0;
  const known = traffic.map((t) => bingDate(t.Date)).filter((d) => Number.isFinite(d));
  const last = known.length ? Math.max(...known) : null;
  for (const t of traffic) {
    const d = bingDate(t.Date);
    if (!(d >= from)) continue;
    periodDays += 1;
    clicks += t.Clicks;
    impressions += t.Impressions;
    const m = monthly.get(monthStart(new Date(d)));
    if (m) {
      m.clicks += t.Clicks;
      m.impressions += t.Impressions;
    }
  }
  const byQuery = new Map<string, { query: string; clicks: number; impressions: number; posW: number }>();
  for (const r of rows) {
    if (!(bingDate(r.Date) >= from)) continue;
    const q = byQuery.get(r.Query) ?? { query: r.Query, clicks: 0, impressions: 0, posW: 0 };
    q.clicks += r.Clicks;
    q.impressions += r.Impressions;
    q.posW += r.AvgImpressionPosition * r.Impressions;
    byQuery.set(r.Query, q);
  }
  const queries = [...byQuery.values()]
    .map((q) => ({ query: q.query, clicks: q.clicks, impressions: q.impressions, ctr: q.impressions ? Math.round((q.clicks / q.impressions) * 10000) / 100 : null, position: q.impressions ? Math.round((q.posW / q.impressions) * 10) / 10 : null }))
    .sort((a, b) => b.clicks - a.clicks || b.impressions - a.impressions)
    .slice(0, 100);
  return {
    clicks,
    impressions,
    ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : null,
    monthly: [...monthly.values()],
    queries,
    lastDay: last != null ? new Date(last).toISOString().slice(0, 10) : null,
    hasPeriodData: periodDays > 0,
  };
}

export async function loadBing(months: number, now: Date): Promise<SourceResult<BingAnalytics>> {
  const missing = missingEnv(BING_ENV);
  if (!siteUrl()) missing.push("BING_SITE_URL");
  if (missing.length) return { status: "missing", missing };
  try {
    return await cached(`bing:${siteUrl()}:${months}:${now.toISOString().slice(0, 10)}`, TTL, async () => {
      const [traffic, rows] = await Promise.all([call<Traffic>("GetRankAndTrafficStats"), call<QueryRow>("GetQueryStats")]);
      return { status: "ok" as const, data: buildBing(traffic, rows, months, now), fetchedAt: new Date().toISOString() };
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

export async function pingBing(): Promise<string> {
  const traffic = await call<Traffic>("GetRankAndTrafficStats");
  return `Bing Webmaster répond pour ${siteUrl()} : ${traffic.length} jour(s) de trafic lus.`;
}
