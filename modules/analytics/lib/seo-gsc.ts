import { cached, httpError, missingEnv, type SourceResult } from "@/modules/analytics/lib/seo-cache";
import { googleAccessToken as accessToken } from "@/modules/analytics/lib/seo-google-auth";
import { delta, lastMonths, type Delta } from "@/modules/analytics/lib/growth";
import { monthStart } from "@/modules/partner/lib/month";

/**
 * Google Search Console — la source de vérité du SEO Google : clics,
 * impressions, CTR et position, par requête, par page, par appareil.
 *
 * Accès par COMPTE DE SERVICE (lecture seule) : on crée le compte dans Google
 * Cloud, on active l'API « Google Search Console », et on ajoute l'adresse du
 * compte comme utilisateur « Restreint » de la propriété dans Search Console.
 * Aucun OAuth à renouveler.
 *
 * ⚠️ Le rapport « IA générative » de Search Console (impressions dans AI
 * Overviews / AI Mode) n'est PAS exposé par l'API à ce jour : il se lit dans
 * l'interface. Les impressions AI Overviews sont en revanche incluses dans les
 * totaux « web » de l'API.
 *
 * Les appels vivent ici ; l'agrégation (`buildGsc`) est pure et testée.
 */

export const GSC_ENV = ["GSC_SERVICE_ACCOUNT_JSON", "GSC_SITE_URL"];
/** Search Console ne garde que 16 mois. */
const MAX_DAYS = 486;
const TTL = 6 * 3600_000;

export type GscRow = { keys: string[]; clicks: number; impressions: number; ctr: number; position: number };

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

async function query(site: string, body: Record<string, unknown>): Promise<GscRow[]> {
  const res = await fetch(`https://searchconsole.googleapis.com/webmasters/v3/sites/${encodeURIComponent(site)}/searchAnalytics/query`, {
    method: "POST",
    headers: { authorization: `Bearer ${await accessToken()}`, "content-type": "application/json" },
    body: JSON.stringify({ type: "web", dataState: "final", ...body }),
    cache: "no-store",
  });
  if (!res.ok) throw await httpError(res, "Search Console");
  return ((await res.json()) as { rows?: GscRow[] }).rows ?? [];
}

/** Les bornes de la période et de la précédente, plafonnées aux 16 mois que garde Google. */
export function gscRanges(months: number, now: Date) {
  const end = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 3);
  const from = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1);
  const prevFrom = Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2 * months + 1, 1);
  const floor = end - MAX_DAYS * 86400_000;
  return {
    cur: { startDate: day(Math.max(from, floor)), endDate: day(end) },
    prev: prevFrom >= floor ? { startDate: day(prevFrom), endDate: day(from - 86400_000) } : null,
    truncated: from < floor,
  };
}

export type GscRaw = { byDate: GscRow[]; queries: GscRow[]; prevQueries: GscRow[]; pages: GscRow[]; prevPages: GscRow[]; devices: GscRow[]; countries: GscRow[]; prevTotals: GscRow[]; truncated: boolean };

export async function loadGsc(months: number, now: Date): Promise<SourceResult<GscAnalytics>> {
  const missing = missingEnv(GSC_ENV);
  if (missing.length) return { status: "missing", missing };
  const site = process.env.GSC_SITE_URL!.trim();
  try {
    return await cached(`gsc:${site}:${months}:${day(now.getTime())}`, TTL, async () => {
      const r = gscRanges(months, now);
      const none = async () => [] as GscRow[];
      const [byDate, queries, prevQueries, pages, prevPages, devices, countries, prevTotals] = await Promise.all([
        query(site, { ...r.cur, dimensions: ["date"], rowLimit: 600 }),
        query(site, { ...r.cur, dimensions: ["query"], rowLimit: 2000 }),
        r.prev ? query(site, { ...r.prev, dimensions: ["query"], rowLimit: 2000 }) : none(),
        query(site, { ...r.cur, dimensions: ["page"], rowLimit: 500 }),
        r.prev ? query(site, { ...r.prev, dimensions: ["page"], rowLimit: 500 }) : none(),
        query(site, { ...r.cur, dimensions: ["device"] }),
        query(site, { ...r.cur, dimensions: ["country"], rowLimit: 10 }),
        r.prev ? query(site, { ...r.prev }) : none(),
      ]);
      const data = buildGsc({ byDate, queries, prevQueries, pages, prevPages, devices, countries, prevTotals, truncated: r.truncated }, months, now, brandTerms());
      return { status: "ok" as const, data, fetchedAt: new Date().toISOString() };
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Les mots de la marque, pour séparer la demande qu'on a créée de celle qu'on capte. */
export const brandTerms = (env: Record<string, string | undefined> = process.env) =>
  (env.SEO_BRAND_TERMS ?? "tim management,tim-management,timmanagement")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export const isBranded = (q: string, terms: string[]) => terms.some((t) => new RegExp(`(^|[^a-z0-9])${escapeRe(t)}($|[^a-z0-9])`, "i").test(q));

/**
 * CTR attendu par position (moyennes publiées du marché, résultats organiques
 * classiques). Sert à repérer les requêtes qui ont la visibilité mais pas le
 * clic : un titre ou une description à retravailler.
 */
const EXPECTED_CTR = [0, 27.6, 15.8, 11, 8.4, 6.3, 4.9, 3.9, 3.3, 2.7, 2.4];
export const expectedCtr = (pos: number) => (pos < 1 ? EXPECTED_CTR[1] : pos <= 10 ? EXPECTED_CTR[Math.round(pos)] : pos <= 20 ? 1 : 0.3);

export type Totals = { clicks: number; impressions: number; ctr: number | null; position: number | null };
const totalsOf = (rows: GscRow[]): Totals => {
  const clicks = rows.reduce((s, r) => s + r.clicks, 0);
  const impressions = rows.reduce((s, r) => s + r.impressions, 0);
  const posW = rows.reduce((s, r) => s + r.position * r.impressions, 0);
  return { clicks, impressions, ctr: impressions ? Math.round((clicks / impressions) * 10000) / 100 : null, position: impressions ? Math.round((posW / impressions) * 10) / 10 : null };
};

export type QueryStat = { query: string; clicks: number; impressions: number; ctr: number; position: number; branded: boolean; clicksDelta: number | null; positionChange: number | null };
export type PageStat = { page: string; clicks: number; impressions: number; ctr: number; position: number; clicksDelta: number | null; lostClicks: number };
export type Opportunity = { query: string; impressions: number; clicks: number; ctr: number; position: number; expectedCtr: number; potentialClicks: number };

export type GscAnalytics = {
  totals: Totals;
  kpis: { clicks: Delta; impressions: Delta; ctr: number | null; ctrPrev: number | null; position: number | null; positionPrev: number | null; keywords: number; top3: number; top10: number };
  /** `position` : la place moyenne du mois, pondérée par les impressions (null sans impression). */
  monthly: { month: string; clicks: number; impressions: number; position: number | null }[];
  positions: { key: string; label: string; count: number }[];
  brand: { brandedClicks: number; nonBrandedClicks: number; brandedShare: number | null; terms: string[] };
  queries: QueryStat[];
  opportunities: Opportunity[];
  pages: PageStat[];
  decliningPages: PageStat[];
  devices: { key: string; label: string; count: number }[];
  countries: { key: string; label: string; count: number }[];
  truncated: boolean;
};

const DEVICE_LABELS: Record<string, string> = { MOBILE: "Mobile", DESKTOP: "Ordinateur", TABLET: "Tablette" };
/** Search Console rend les pays en ISO 3166 alpha-3, en minuscules. */
const COUNTRY_LABELS: Record<string, string> = { fra: "France", bel: "Belgique", che: "Suisse", lux: "Luxembourg", can: "Canada", mar: "Maroc", dza: "Algérie", tun: "Tunisie", usa: "États-Unis", gbr: "Royaume-Uni", deu: "Allemagne", esp: "Espagne", ita: "Italie", prt: "Portugal" };
const pathOf = (url: string) => {
  try {
    const u = new URL(url);
    return u.pathname + u.search || "/";
  } catch {
    return url;
  }
};
const pctChange = (cur: number, prev: number | undefined) => (prev ? Math.round(((cur - prev) / prev) * 1000) / 10 : null);
const r2 = (n: number) => Math.round(n * 100) / 100;
const r1 = (n: number) => Math.round(n * 10) / 10;

export function buildGsc(raw: GscRaw, months: number, now: Date, terms: string[]): GscAnalytics {
  const totals = totalsOf(raw.byDate);
  const prev = totalsOf(raw.prevTotals);

  const monthly = new Map(lastMonths(months, now).map((m) => [m, { month: m, clicks: 0, impressions: 0, posW: 0 }]));
  for (const r of raw.byDate) {
    const m = monthly.get(monthStart(`${r.keys[0]}T00:00:00Z`));
    if (m) {
      m.clicks += r.clicks;
      m.impressions += r.impressions;
      m.posW += r.position * r.impressions;
    }
  }

  const prevQ = new Map(raw.prevQueries.map((r) => [r.keys[0], r]));
  const queries: QueryStat[] = raw.queries.map((r) => {
    const p = prevQ.get(r.keys[0]);
    return {
      query: r.keys[0],
      clicks: r.clicks,
      impressions: r.impressions,
      ctr: r2(r.ctr * 100),
      position: r1(r.position),
      branded: isBranded(r.keys[0], terms),
      clicksDelta: p ? pctChange(r.clicks, p.clicks) : null,
      // Positif = on est remonté (la position 3 est meilleure que la 8).
      positionChange: p ? r1(p.position - r.position) : null,
    };
  });

  const buckets = [
    { key: "1-3", label: "Top 3", test: (p: number) => p <= 3.5 },
    { key: "4-10", label: "4 à 10 (1re page)", test: (p: number) => p > 3.5 && p <= 10.5 },
    { key: "11-20", label: "11 à 20 (2e page)", test: (p: number) => p > 10.5 && p <= 20.5 },
    { key: "21-50", label: "21 à 50", test: (p: number) => p > 20.5 && p <= 50.5 },
    { key: "51+", label: "Au-delà de 50", test: (p: number) => p > 50.5 },
  ];
  const positions = buckets.map((b) => ({ key: b.key, label: b.label, count: queries.filter((q) => b.test(q.position)).length }));

  const brandedClicks = queries.filter((q) => q.branded).reduce((s, q) => s + q.clicks, 0);
  const nonBrandedClicks = queries.filter((q) => !q.branded).reduce((s, q) => s + q.clicks, 0);

  // Assez vue pour compter (10 impressions), sur la 1re ou 2e page, et sous le CTR de son rang.
  const opportunities: Opportunity[] = queries
    .filter((q) => q.position >= 3.5 && q.position <= 20.5 && q.impressions >= 10 && !q.branded)
    .map((q) => {
      const target = expectedCtr(3);
      return { query: q.query, impressions: q.impressions, clicks: q.clicks, ctr: q.ctr, position: q.position, expectedCtr: expectedCtr(q.position), potentialClicks: Math.max(0, Math.round((q.impressions * target) / 100 - q.clicks)) };
    })
    .filter((o) => o.potentialClicks > 0)
    .sort((a, b) => b.potentialClicks - a.potentialClicks)
    .slice(0, 50);

  const prevP = new Map(raw.prevPages.map((r) => [r.keys[0], r]));
  const pages: PageStat[] = raw.pages.map((r) => {
    const p = prevP.get(r.keys[0]);
    return { page: pathOf(r.keys[0]), clicks: r.clicks, impressions: r.impressions, ctr: r2(r.ctr * 100), position: r1(r.position), clicksDelta: p ? pctChange(r.clicks, p.clicks) : null, lostClicks: p ? Math.max(0, p.clicks - r.clicks) : 0 };
  });
  const curPages = new Set(raw.pages.map((r) => r.keys[0]));
  // Une page qui a disparu des résultats est la pire des pertes : elle doit apparaître aussi.
  const vanished: PageStat[] = raw.prevPages
    .filter((r) => !curPages.has(r.keys[0]) && r.clicks > 0)
    .map((r) => ({ page: pathOf(r.keys[0]), clicks: 0, impressions: 0, ctr: 0, position: 0, clicksDelta: -100, lostClicks: r.clicks }));
  const decliningPages = [...pages, ...vanished].filter((p) => p.lostClicks > 0).sort((a, b) => b.lostClicks - a.lostClicks).slice(0, 15);

  return {
    totals,
    kpis: {
      clicks: delta(totals.clicks, prev.clicks),
      impressions: delta(totals.impressions, prev.impressions),
      ctr: totals.ctr,
      ctrPrev: prev.ctr,
      position: totals.position,
      positionPrev: prev.position,
      keywords: queries.length,
      top3: positions[0].count,
      top10: positions[0].count + positions[1].count,
    },
    monthly: [...monthly.values()].map(({ posW, ...m }) => ({ ...m, position: m.impressions ? r1(posW / m.impressions) : null })),
    positions,
    brand: { brandedClicks, nonBrandedClicks, brandedShare: brandedClicks + nonBrandedClicks ? Math.round((brandedClicks / (brandedClicks + nonBrandedClicks)) * 1000) / 10 : null, terms },
    queries,
    opportunities,
    pages,
    decliningPages,
    devices: raw.devices.map((r) => ({ key: r.keys[0], label: DEVICE_LABELS[r.keys[0]] ?? r.keys[0], count: r.clicks })),
    countries: raw.countries.map((r) => ({ key: r.keys[0], label: COUNTRY_LABELS[r.keys[0]] ?? r.keys[0].toUpperCase(), count: r.clicks })),
    truncated: raw.truncated,
  };
}

/** Le test de la page Connexions : une requête d'un jour, la plus légère possible. */
export async function pingGsc(): Promise<string> {
  const site = process.env.GSC_SITE_URL!.trim();
  const d = day(Date.now() - 5 * 86400_000);
  const rows = await query(site, { startDate: d, endDate: d });
  return `Search Console répond pour ${site} : ${rows[0]?.clicks ?? 0} clic(s) le ${d}.`;
}
