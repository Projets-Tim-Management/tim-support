import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/lib/spend", () => ({ assertAdsBudget: vi.fn(async () => undefined), recordAdsUsage: vi.fn(async () => ({ id: 1 })) }));
vi.mock("@/modules/analytics/lib/seo-pagespeed", () => ({ loadPageSpeed: vi.fn(async () => ({ status: "missing", missing: [] })) }));
vi.mock("@/modules/ai-team/lib/funnel", async (orig) => ({
  ...(await orig<typeof import("@/modules/ai-team/lib/funnel")>()),
  loadFunnel: vi.fn(async () => ({ since: "2026-09-01", rows: [], totals: { sessions: 0, leads: 0, qualified: 0, won: 0, leadRate: null, qualifiedRate: null }, pages: [], attractWithoutConverting: [{ path: "/actualite/grille-de-salaire-btp", sessions: 374, leads: 0, qualified: 0 }], otherLeads: 0 })),
}));

import { buildFunnel, sourceOfLead, socialOfSession } from "@/modules/ai-team/lib/funnel";
import { pagesToRead, parseAudit, runSiteAudit } from "@/modules/ai-team/lib/site-audit";
import type { WebCall } from "@/modules/ai-team/lib/web-model";

const FROM = Date.parse("2026-09-01T00:00:00Z");
const lead = (id: number, over: Record<string, unknown>) => ({ id, createdAt: "2026-10-10T10:00:00Z", ...over });

describe("Entonnoir : d'où vient chaque visite et chaque lead gratuit", () => {
  it("reconnaît moteurs, IA et réseaux ; écarte la publicité", () => {
    expect(sourceOfLead(lead(1, { referrer: "https://www.google.com/" }))?.key).toBe("google");
    expect(sourceOfLead(lead(2, { referrer: "https://chatgpt.com/" }))?.key).toBe("chatgpt");
    expect(sourceOfLead(lead(3, { referrer: "https://www.linkedin.com/feed/" }))).toMatchObject({ key: "linkedin", kind: "social" });
    expect(sourceOfLead(lead(4, { utmSource: "youtube" }))?.key).toBe("youtube");
    expect(sourceOfLead(lead(5, { referrer: "https://l.facebook.com/", channel: "meta-facebook" }))).toBeNull();
    expect(sourceOfLead(lead(6, { utmSource: "linkedin", utmMedium: "paid_social" }))).toBeNull();
    expect(socialOfSession("lnkd.in", "referral")?.key).toBe("linkedin");
    expect(socialOfSession("m.youtube.com", "referral")?.key).toBe("youtube");
    expect(socialOfSession("facebook.com", "cpc")).toBeNull();
  });

  it("compte visites, leads, qualifiés (même perdus ensuite) et clients ; trouve les pages qui fuient", () => {
    const f = buildFunnel({
      from: FROM,
      leads: [
        lead(1, { referrer: "https://www.google.com/", landingPath: "/pointage-digital-mobile-chantier" }),
        lead(2, { referrer: "https://www.google.com/", landingPath: "/pointage-digital-mobile-chantier" }),
        lead(3, { referrer: "https://www.linkedin.com/", landingPath: "/" }),
        lead(4, { referrer: "https://www.google.com/", createdAt: "2026-08-01T10:00:00Z" }), // avant la fenêtre
        lead(5, { channel: "sea", gclid: "x" }), // payé : hors entonnoir
      ],
      clients: [
        { id: 10, formSubmission: 1, clientStatus: "actif" },
        { id: 11, formSubmission: 2, clientStatus: "perdue" },
      ],
      // Le lead 2 a atteint « Démo programmée » avant d'être perdu : il reste qualifié.
      journal: [{ client: 11, title: "Étape : Nouvelle → Démo programmée" }],
      ga4Rows: [
        { month: "202610", source: "google", medium: "organic", sessions: 400, engaged: 200, keyEvents: 3 },
        { month: "202610", source: "lnkd.in", medium: "referral", sessions: 50, engaged: 20, keyEvents: 1 },
        { month: "202608", source: "google", medium: "organic", sessions: 999, engaged: 0, keyEvents: 0 }, // avant la fenêtre
        { month: "202610", source: "(direct)", medium: "(none)", sessions: 300, engaged: 0, keyEvents: 0 },
      ],
      ga4Pages: [
        { page: "/actualite/grille-de-salaire-btp", source: "google", medium: "organic", sessions: 374, engaged: 20, keyEvents: 0 },
        { page: "/pointage-digital-mobile-chantier", source: "google", medium: "organic", sessions: 60, engaged: 30, keyEvents: 2 },
      ],
    });
    const google = f.rows.find((r) => r.key === "google")!;
    expect(google).toMatchObject({ sessions: 400, leads: 2, qualified: 2, won: 1, leadRate: 0.5, qualifiedRate: 100 });
    expect(f.rows.find((r) => r.key === "linkedin")).toMatchObject({ sessions: 50, leads: 1, qualified: 0 });
    expect(f.otherLeads).toBe(1);
    expect(f.pages[0]).toMatchObject({ path: "/pointage-digital-mobile-chantier", leads: 2, qualified: 2 });
    expect(f.attractWithoutConverting).toEqual([{ path: "/actualite/grille-de-salaire-btp", sessions: 374, leads: 0, qualified: 0 }]);
  });
});

describe("Audit du site : la réponse vérifiée, les pages à lire", () => {
  it("garde les constats complets, les plus forts d'abord, 10 au plus", () => {
    const text = `<synthese>Google convertit, le blog fuit.</synthese><constats>${JSON.stringify([
      { page: "/blog", type: "contenu", impact: "faible", probleme: "A", preuve: "1", action: "a" },
      { page: "/grille", type: "conversion", impact: "fort", probleme: "B", preuve: "374 visites, 0 lead", action: "b", prompt: "Écris…" },
      { page: "/x", impact: "moyen", probleme: "", action: "c" },
    ])}</constats>`;
    const out = parseAudit(text)!;
    expect(out.findings.map((f) => [f.problem, f.impact])).toEqual([
      ["B", "fort"],
      ["A", "faible"],
    ]);
    expect(parseAudit("rien")).toBeNull();
  });

  it("lit d'abord les pages qui fuient, puis celles qui convertissent, sans doublon", () => {
    const urls = pagesToRead({ since: "", rows: [], totals: {} as never, otherLeads: 0, attractWithoutConverting: [{ path: "/a", sessions: 50, leads: 0, qualified: 0 }], pages: [{ path: "/a", sessions: 50, leads: 1, qualified: 0 }, { path: "/", sessions: 9, leads: 2, qualified: 1 }] });
    expect(urls).toEqual(["https://tim-management.co/a", "https://tim-management.co/"]);
  });

  it("l'audit d'un bout à l'autre : réservé, écrit, compté au budget SEO/GEO", async () => {
    const created: Record<string, unknown>[] = [];
    const updated: Record<string, unknown>[] = [];
    const payload = {
      find: vi.fn(async () => ({ docs: [{ id: 60, name: "Ana", active: true }] })),
      count: vi.fn(async () => ({ totalDocs: 0 })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (created.push(data), { id: 7, ...data })),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (updated.push(data), data)),
      logger: { warn: vi.fn() },
    };
    const call: WebCall = async () => ({
      content: [{ type: "text", text: `<synthese>La grille fuit.</synthese><constats>${JSON.stringify([{ page: "/actualite/grille-de-salaire-btp", type: "conversion", impact: "fort", probleme: "Aucun appel à la démo", preuve: "374 visites, 0 lead", action: "Ajouter un encart démo" }])}</constats>`, citations: null }] as never,
      usage: { input: 20_000, output: 3_000, cacheRead: 0, cacheWrite: 0 },
      searches: 0,
      stopReason: "end_turn",
    });
    const r = await runSiteAudit(payload as never, { now: new Date("2026-11-12T10:00:00Z"), force: true, call });
    expect(r).toMatchObject({ status: "fait", findings: 1 });
    expect(created[0]).toMatchObject({ member: 60, period: "2026-11", status: "en-cours" });
    expect(updated.at(-1)).toMatchObject({ status: "fait", summary: "La grille fuit." });
    const { recordAdsUsage } = await import("@/modules/ads/lib/spend");
    expect(vi.mocked(recordAdsUsage).mock.calls[0][1]).toMatchObject({ kind: "seo" });
  });
});
