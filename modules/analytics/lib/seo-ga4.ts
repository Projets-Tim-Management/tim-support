import { cached, httpError, missingEnv, type SourceResult } from "@/modules/analytics/lib/seo-cache";
import { googleAccessToken } from "@/modules/analytics/lib/seo-google-auth";
import { delta, lastMonths, type Delta } from "@/modules/analytics/lib/growth";
import { ENGINES, type Engine } from "@/modules/analytics/lib/seo-sources";

/**
 * GA4 en LECTURE (Data API) — ce que les formulaires ne voient pas : toutes
 * les VISITES envoyées par un moteur ou une IA, pas seulement celles qui
 * finissent en prospect ; et ce qu'elles font une fois sur le site (visite
 * engagée, conversion).
 *
 * Même compte de service que Search Console (`GSC_SERVICE_ACCOUNT_JSON`),
 * ajouté en « Lecteur » sur la propriété GA4. Seul l'identifiant de la
 * propriété est à poser.
 *
 * ⚠️ GA4 ne compte que les visiteurs qui acceptent les cookies : les chiffres
 * sont un plancher, leur évolution reste juste. Un clic depuis une application
 * mobile (ChatGPT, Gemini) arrive souvent sans provenance et tombe en direct.
 *
 * Le classement (`classifyGa4Source`) et l'agrégation (`buildGa4`) sont purs.
 */

export const GA4_ENV = ["GA4_PROPERTY_ID"];
const TTL = 6 * 3600_000;

/** Les mediums d'un clic acheté : jamais du SEO ni du GEO (chatgpt / cpc, c'est ChatGPT Ads). */
const PAID = /(cpc|ppc|cpm|paid|display|retarget)/i;
const byKey = new Map(ENGINES.map((e) => [e.key, e]));

/**
 * Le moteur ou l'assistant d'une session GA4, d'après sa source et son medium.
 * GA4 range déjà les IA en `ai-assistant` (chatgpt.com, gemini.google.com…) ;
 * les moteurs arrivent en `organic` (google, bing…) ou en `referral` depuis
 * un domaine de recherche (fr.search.yahoo.com).
 */
export function classifyGa4Source(source: string, medium: string): Engine | null {
  const src = source.trim().toLowerCase();
  const med = medium.trim().toLowerCase();
  if (!src || PAID.test(med)) return null;
  const host = src.replace(/^www\./, "");
  const hit = ENGINES.find(
    (e) =>
      e.utm?.includes(host) ||
      e.hosts.some(
        (h) =>
          (h.endsWith(".") ? host === h.slice(0, -1) || host.startsWith(h) || host.includes(`.${h}`) : host === h || host.endsWith(`.${h}`)) ||
          // GA4 nomme les moteurs sans domaine (« bing », « duckduckgo ») — raccourci réservé aux moteurs :
          // pour une IA, « x » (x.ai) ou « meta » (meta.ai) désigneraient à tort un réseau social.
          (e.kind === "search" && host === h.split(".")[0]),
      ),
  );
  if (hit) {
    // Un moteur n'est du SEO qu'en organique ou en référent ; une IA, quel que soit le medium non payant.
    if (hit.kind === "search" && med !== "organic" && med !== "referral") return null;
    return { key: hit.key, label: hit.label, kind: hit.kind };
  }
  if (med === "ai-assistant") return { key: host, label: host, kind: "ai" };
  if (med === "organic") return { key: host, label: host, kind: "search" };
  return null;
}

export type Ga4Row = { month: string; source: string; medium: string; sessions: number; engaged: number; keyEvents: number };
export type Ga4PageRow = { page: string; source: string; medium: string; sessions: number; engaged: number; keyEvents: number };

type Totals = { sessions: Delta; engagedRate: number | null; keyEvents: number };
export type Ga4SourceStat = { key: string; label: string; kind: "ai" | "search"; sessions: number; engaged: number; keyEvents: number; delta: Delta };
export type Ga4PageStat = { page: string; sessions: number; engagedRate: number | null; keyEvents: number };

export type Ga4Analytics = {
  search: Totals;
  ai: Totals;
  monthly: { month: string; search: number; ai: number }[];
  sources: Ga4SourceStat[];
  aiPages: Ga4PageStat[];
  searchPages: Ga4PageStat[];
};

const rate = (engaged: number, sessions: number) => (sessions ? Math.round((engaged / sessions) * 1000) / 10 : null);

/** `month` : « AAAAMM » comme GA4 le rend. La période courante = les `months` derniers mois (mois en cours compris). */
export function buildGa4(rows: Ga4Row[], pages: Ga4PageRow[], months: number, now: Date): Ga4Analytics {
  const keys = lastMonths(months, now);
  const ym = (iso: string) => iso.slice(0, 4) + iso.slice(5, 7);
  const cur = new Set(keys.map(ym));
  const monthly = new Map(keys.map((k) => [ym(k), { month: k, search: 0, ai: 0 }]));
  const sum = { search: { s: 0, e: 0, k: 0, p: 0 }, ai: { s: 0, e: 0, k: 0, p: 0 } };
  const stats = new Map<string, Omit<Ga4SourceStat, "delta"> & { prev: number }>();

  for (const r of rows) {
    const e = classifyGa4Source(r.source, r.medium);
    if (!e) continue;
    const s = stats.get(e.key) ?? { ...e, sessions: 0, engaged: 0, keyEvents: 0, prev: 0 };
    stats.set(e.key, s);
    if (!cur.has(r.month)) {
      sum[e.kind].p += r.sessions;
      s.prev += r.sessions;
      continue;
    }
    sum[e.kind].s += r.sessions;
    sum[e.kind].e += r.engaged;
    sum[e.kind].k += r.keyEvents;
    s.sessions += r.sessions;
    s.engaged += r.engaged;
    s.keyEvents += r.keyEvents;
    monthly.get(r.month)![e.kind] += r.sessions;
  }

  const pageStats = (kind: "ai" | "search") => {
    const m = new Map<string, { page: string; sessions: number; engaged: number; keyEvents: number }>();
    for (const p of pages) {
      if (classifyGa4Source(p.source, p.medium)?.kind !== kind) continue;
      const x = m.get(p.page) ?? { page: p.page, sessions: 0, engaged: 0, keyEvents: 0 };
      x.sessions += p.sessions;
      x.engaged += p.engaged;
      x.keyEvents += p.keyEvents;
      m.set(p.page, x);
    }
    return [...m.values()]
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 50)
      .map((x) => ({ page: x.page, sessions: x.sessions, engagedRate: rate(x.engaged, x.sessions), keyEvents: x.keyEvents }));
  };

  const totals = (t: { s: number; e: number; k: number; p: number }): Totals => ({ sessions: delta(t.s, t.p), engagedRate: rate(t.e, t.s), keyEvents: t.k });
  const order = new Map(ENGINES.map((e, i) => [e.key, i]));
  return {
    search: totals(sum.search),
    ai: totals(sum.ai),
    monthly: [...monthly.values()],
    sources: [...stats.values()]
      .filter((s) => s.sessions || s.prev)
      .map(({ prev, ...s }) => ({ ...s, label: byKey.get(s.key)?.label ?? s.label, delta: delta(s.sessions, prev) }))
      .sort((a, b) => b.sessions - a.sessions || (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99)),
    aiPages: pageStats("ai"),
    searchPages: pageStats("search"),
  };
}

/* ─── Appels ──────────────────────────────────────────────────────────────── */

type ReportJson = { rows?: { dimensionValues: { value: string }[]; metricValues: { value: string }[] }[] };

async function runReport(body: Record<string, unknown>): Promise<ReportJson> {
  const id = process.env.GA4_PROPERTY_ID!.trim();
  const res = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(id)}:runReport`, {
    method: "POST",
    headers: { authorization: `Bearer ${await googleAccessToken()}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw await httpError(res, "GA4");
  return (await res.json()) as ReportJson;
}

const METRICS = [{ name: "sessions" }, { name: "engagedSessions" }, { name: "keyEvents" }];
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: string) => Math.round(Number(v) || 0);

export async function loadGa4(months: number, now: Date): Promise<SourceResult<Ga4Analytics>> {
  const missing = missingEnv([...GA4_ENV, "GSC_SERVICE_ACCOUNT_JSON"]);
  if (missing.length) return { status: "missing", missing };
  try {
    return await cached(`ga4:${process.env.GA4_PROPERTY_ID}:${months}:${iso(now)}`, TTL, async () => {
      const prevFrom = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2 * months + 1, 1));
      const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1));
      const [bySource, byPage] = await Promise.all([
        runReport({
          dateRanges: [{ startDate: iso(prevFrom), endDate: "yesterday" }],
          dimensions: [{ name: "yearMonth" }, { name: "sessionSource" }, { name: "sessionMedium" }],
          metrics: METRICS,
          limit: 10000,
        }),
        runReport({
          dateRanges: [{ startDate: iso(from), endDate: "yesterday" }],
          dimensions: [{ name: "landingPage" }, { name: "sessionSource" }, { name: "sessionMedium" }],
          metrics: METRICS,
          limit: 10000,
        }),
      ]);
      const rows: Ga4Row[] = (bySource.rows ?? []).map((r) => ({
        month: r.dimensionValues[0].value,
        source: r.dimensionValues[1].value,
        medium: r.dimensionValues[2].value,
        sessions: num(r.metricValues[0].value),
        engaged: num(r.metricValues[1].value),
        keyEvents: num(r.metricValues[2].value),
      }));
      const pages: Ga4PageRow[] = (byPage.rows ?? []).map((r) => ({
        page: r.dimensionValues[0].value || "/",
        source: r.dimensionValues[1].value,
        medium: r.dimensionValues[2].value,
        sessions: num(r.metricValues[0].value),
        engaged: num(r.metricValues[1].value),
        keyEvents: num(r.metricValues[2].value),
      }));
      return { status: "ok" as const, data: buildGa4(rows, pages, months, now), fetchedAt: new Date().toISOString() };
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Le test de la page Connexions : les visites d'hier, la requête la plus légère. */
export async function pingGa4(): Promise<string> {
  const j = await runReport({ dateRanges: [{ startDate: "7daysAgo", endDate: "yesterday" }], metrics: [{ name: "sessions" }] });
  return `GA4 répond pour la propriété ${process.env.GA4_PROPERTY_ID} : ${num(j.rows?.[0]?.metricValues[0].value ?? "0")} visites sur 7 jours.`;
}
