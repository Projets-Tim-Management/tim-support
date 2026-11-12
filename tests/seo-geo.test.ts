import { describe, expect, it } from "vitest";

import { bingDate, buildBing } from "@/modules/analytics/lib/seo-bing";
import { buildGsc, gscRanges, isBranded, type GscRow } from "@/modules/analytics/lib/seo-gsc";
import { keyUrls, parsePsi } from "@/modules/analytics/lib/seo-pagespeed";
import { buildOrganicAnalytics, classifySource } from "@/modules/analytics/lib/seo-sources";

const NOW = new Date("2026-11-12T10:00:00Z");

describe("d'où vient un lead non payé", () => {
  it("reconnaît les assistants IA par leur référent ou l'UTM que ChatGPT ajoute", () => {
    expect(classifySource({ id: 1, utmSource: "chatgpt.com" })?.key).toBe("chatgpt");
    expect(classifySource({ id: 1, referrer: "https://www.perplexity.ai/search?q=x" })?.key).toBe("perplexity");
    expect(classifySource({ id: 1, referrer: "https://copilot.microsoft.com/" })?.key).toBe("copilot");
    expect(classifySource({ id: 1, referrer: "https://claude.ai/chat/abc" })?.kind).toBe("ai");
  });

  it("ne confond pas Gemini avec Google, ni Google avec un domaine qui le contient", () => {
    expect(classifySource({ id: 1, referrer: "https://gemini.google.com/app" })?.key).toBe("gemini");
    expect(classifySource({ id: 1, utmSource: "gemini.google.com" })?.key).toBe("gemini");
    expect(classifySource({ id: 1, referrer: "https://www.google.fr/" })).toMatchObject({ key: "google", kind: "search" });
    expect(classifySource({ id: 1, referrer: "https://notgoogle.example.com/" })).toBeNull();
  });

  it("écarte tout clic payant, même venu de Google ou de ChatGPT", () => {
    expect(classifySource({ id: 1, referrer: "https://www.google.fr/", gclid: "abc" })).toBeNull();
    expect(classifySource({ id: 1, channel: "chatgpt", utmSource: "chatgpt" })).toBeNull();
    expect(classifySource({ id: 1, referrer: "https://www.bing.com/", utmMedium: "cpc" })).toBeNull();
  });

  it("laisse le direct et les autres sites hors du compte", () => {
    expect(classifySource({ id: 1 })).toBeNull();
    expect(classifySource({ id: 1, referrer: "https://www.linkedin.com/" })).toBeNull();
  });
});

describe("les leads organiques de la période", () => {
  const rows = [
    { id: 1, createdAt: "2026-11-02T10:00:00Z", referrer: "https://www.google.fr/", landingPath: "/logiciel" },
    { id: 2, createdAt: "2026-10-15T10:00:00Z", utmSource: "chatgpt.com", landingPath: "/logiciel" },
    { id: 3, createdAt: "2026-09-15T10:00:00Z", referrer: "https://www.perplexity.ai/" },
    { id: 4, createdAt: "2026-11-03T10:00:00Z", gclid: "x", referrer: "https://www.google.fr/" },
    // Période d'avant (3 mois) : juin–août.
    { id: 5, createdAt: "2026-07-10T10:00:00Z", referrer: "https://www.google.com/" },
  ];
  const a = buildOrganicAnalytics(rows, [{ formSubmission: 2, clientStatus: "actif" }], 3, NOW);

  it("sépare moteurs et IA, et compare à la période d'avant", () => {
    expect(a.kpis.search).toMatchObject({ current: 1, previous: 1 });
    expect(a.kpis.ai).toMatchObject({ current: 2, previous: 0 });
    expect(a.kpis.aiShare).toBeCloseTo(66.7);
    expect(a.allLeads).toBe(4);
  });

  it("suit chaque source jusqu'au client gagné", () => {
    const chatgpt = a.engines.find((e) => e.key === "chatgpt")!;
    expect(chatgpt).toMatchObject({ leads: 1, opportunities: 1, won: 1, conversion: 100 });
    expect(a.kpis.won).toBe(1);
  });

  it("range les pages d'arrivée par volume", () => {
    expect(a.pages[0]).toMatchObject({ path: "/logiciel", search: 1, ai: 1, total: 2 });
  });
});

describe("Search Console", () => {
  const row = (keys: string[], clicks: number, impressions: number, position: number): GscRow => ({ keys, clicks, impressions, ctr: impressions ? clicks / impressions : 0, position });

  it("plafonne la période aux 16 mois que garde Google, et s'arrête 3 jours avant aujourd'hui", () => {
    const r = gscRanges(3, NOW);
    expect(r.cur).toEqual({ startDate: "2026-09-01", endDate: "2026-11-09" });
    expect(r.prev).toEqual({ startDate: "2026-06-01", endDate: "2026-08-31" });
    expect(gscRanges(24, NOW)).toMatchObject({ prev: null, truncated: true });
  });

  it("reconnaît la marque au mot près", () => {
    expect(isBranded("avis tim management", ["tim management"])).toBe(true);
    expect(isBranded("timing management", ["tim management"])).toBe(false);
  });

  const g = buildGsc(
    {
      byDate: [row(["2026-10-01"], 10, 200, 8), row(["2026-11-01"], 30, 800, 6)],
      queries: [row(["tim management"], 20, 100, 1.2), row(["logiciel gestion parc"], 5, 600, 7), row(["logiciel flotte"], 0, 5, 9)],
      prevQueries: [row(["logiciel gestion parc"], 10, 400, 9)],
      pages: [row(["https://www.ex.fr/logiciel"], 20, 500, 5)],
      prevPages: [row(["https://www.ex.fr/logiciel"], 25, 450, 5), row(["https://www.ex.fr/ancienne"], 8, 90, 7)],
      devices: [row(["MOBILE"], 25, 600, 6)],
      countries: [row(["fra"], 38, 900, 6)],
      prevTotals: [row([], 20, 500, 9)],
      truncated: false,
    },
    3,
    NOW,
    ["tim management"],
  );

  it("pondère la position moyenne par les impressions", () => {
    expect(g.totals).toMatchObject({ clicks: 40, impressions: 1000, ctr: 4, position: 6.4 });
    expect(g.kpis.clicks.pct).toBe(100);
    expect(g.monthly.map((m) => m.clicks)).toEqual([0, 10, 30]);
    expect(g.monthly.map((m) => m.position)).toEqual([null, 8, 6]);
  });

  it("sépare les clics de marque des clics génériques", () => {
    expect(g.brand).toMatchObject({ brandedClicks: 20, nonBrandedClicks: 5, brandedShare: 80 });
  });

  it("propose les requêtes génériques vues mais peu cliquées, pas celles trop peu vues", () => {
    expect(g.opportunities.map((o) => o.query)).toEqual(["logiciel gestion parc"]);
    expect(g.opportunities[0].potentialClicks).toBe(61);
    expect(g.queries.find((q) => q.query === "logiciel gestion parc")).toMatchObject({ clicksDelta: -50, positionChange: 2 });
  });

  it("signale les pages en baisse, y compris celles qui ont disparu", () => {
    expect(g.decliningPages.map((p) => [p.page, p.lostClicks])).toEqual([
      ["/ancienne", 8],
      ["/logiciel", 5],
    ]);
    expect(g.countries[0].label).toBe("France");
  });
});

describe("PageSpeed", () => {
  it("lit les Core Web Vitals réels et les scores, CLS remis à l'échelle", () => {
    const a = parsePsi("https://ex.fr/", {
      loadingExperience: {
        metrics: {
          LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2100, category: "FAST" },
          INTERACTION_TO_NEXT_PAINT: { percentile: 250, category: "AVERAGE" },
          CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 5, category: "FAST" },
        },
      },
      lighthouseResult: { categories: { performance: { score: 0.87 }, seo: { score: 1 } } },
    });
    expect(a).toMatchObject({ cwvPass: false, performance: 87, seo: 100, accessibility: null });
    expect(a.cls.p75).toBe(0.05);
  });

  it("ne conclut rien sans données terrain", () => {
    expect(parsePsi("https://ex.fr/", {}).cwvPass).toBeNull();
  });

  it("conclut sur LCP et CLS quand l'INP manque, comme Google", () => {
    const a = parsePsi("https://ex.fr/", {
      loadingExperience: { metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 2000, category: "FAST" }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 0, category: "FAST" } } },
    });
    expect(a.cwvPass).toBe(true);
    expect(a.inp.category).toBeNull();
  });

  it("audite l'accueil de la propriété Search Console à défaut de liste", () => {
    expect(keyUrls({ GSC_SITE_URL: "sc-domain:ex.fr" })).toEqual(["https://ex.fr/"]);
    expect(keyUrls({ SEO_KEY_URLS: "https://a.fr/, https://a.fr/b" })).toEqual(["https://a.fr/", "https://a.fr/b"]);
  });
});

describe("Bing Webmaster", () => {
  it("lit les dates WCF et agrège les requêtes de la période", () => {
    const d = (iso: string) => `/Date(${Date.parse(iso)}-0800)/`;
    expect(bingDate(d("2026-10-01T00:00:00Z"))).toBe(Date.parse("2026-10-01T00:00:00Z"));
    const b = buildBing(
      [{ Date: d("2026-10-05T00:00:00Z"), Clicks: 3, Impressions: 100 }, { Date: d("2026-05-01T00:00:00Z"), Clicks: 50, Impressions: 50 }],
      [
        { Query: "logiciel flotte", Date: d("2026-10-05T00:00:00Z"), Clicks: 2, Impressions: 40, AvgImpressionPosition: 4 },
        { Query: "logiciel flotte", Date: d("2026-10-12T00:00:00Z"), Clicks: 1, Impressions: 60, AvgImpressionPosition: 6 },
      ],
      3,
      NOW,
    );
    expect(b).toMatchObject({ clicks: 3, impressions: 100, ctr: 3, hasPeriodData: true, lastDay: "2026-10-05" });
    expect(b.queries[0]).toMatchObject({ query: "logiciel flotte", clicks: 3, impressions: 100, position: 5.2 });
  });

  it("dit jusqu'où vont les données quand Bing s'arrête avant la période", () => {
    const d = (iso: string) => `/Date(${Date.parse(iso)})/`;
    const b = buildBing([{ Date: d("2026-02-28T00:00:00Z"), Clicks: 4, Impressions: 50 }], [], 3, NOW);
    expect(b).toMatchObject({ clicks: 0, hasPeriodData: false, lastDay: "2026-02-28" });
  });
});

describe("GA4 : d'où vient une visite", () => {
  it("range les moteurs organiques, les IA, et écarte les clics payants", async () => {
    const { classifyGa4Source } = await import("@/modules/analytics/lib/seo-ga4");
    expect(classifyGa4Source("google", "organic")).toMatchObject({ key: "google", kind: "search" });
    expect(classifyGa4Source("bing", "organic")).toMatchObject({ key: "bing", kind: "search" });
    expect(classifyGa4Source("fr.search.yahoo.com", "referral")).toMatchObject({ key: "yahoo", kind: "search" });
    expect(classifyGa4Source("chatgpt.com", "ai-assistant")).toMatchObject({ key: "chatgpt", kind: "ai" });
    expect(classifyGa4Source("gemini.google.com", "ai-assistant")).toMatchObject({ key: "gemini", kind: "ai" });
    expect(classifyGa4Source("chatgpt", "cpc")).toBeNull();
    expect(classifyGa4Source("google", "cpc")).toBeNull();
    expect(classifyGa4Source("(direct)", "(none)")).toBeNull();
    expect(classifyGa4Source("x", "referral")).toBeNull();
    expect(classifyGa4Source("nouvelle-ia.example", "ai-assistant")).toMatchObject({ kind: "ai" });
  });

  it("agrège la période, la compare à la précédente, et range les pages d'arrivée", async () => {
    const { buildGa4 } = await import("@/modules/analytics/lib/seo-ga4");
    const row = (month: string, source: string, medium: string, sessions: number, engaged = 0, keyEvents = 0) => ({ month, source, medium, sessions, engaged, keyEvents });
    const g = buildGa4(
      [
        row("202611", "google", "organic", 100, 10, 1),
        row("202610", "chatgpt.com", "ai-assistant", 20, 8, 1),
        row("202607", "google", "organic", 50),
        row("202611", "chatgpt", "cpc", 999),
      ],
      [
        { page: "/blog/rtt", source: "chatgpt.com", medium: "ai-assistant", sessions: 15, engaged: 6, keyEvents: 1 },
        { page: "/", source: "google", medium: "organic", sessions: 100, engaged: 10, keyEvents: 1 },
      ],
      3,
      NOW,
    );
    expect(g.search.sessions).toMatchObject({ current: 100, previous: 50, pct: 100 });
    expect(g.search.engagedRate).toBe(10);
    expect(g.ai.sessions.current).toBe(20);
    expect(g.monthly.map((m) => [m.search, m.ai])).toEqual([[0, 0], [0, 20], [100, 0]]);
    expect(g.sources.map((s) => s.key)).toEqual(["google", "chatgpt"]);
    expect(g.aiPages[0]).toMatchObject({ page: "/blog/rtt", sessions: 15, engagedRate: 40 });
  });
});
