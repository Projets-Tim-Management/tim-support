import { describe, expect, it } from "vitest";

import { parseSerp } from "@/modules/editorial/lib/competitors/dataforseo";
import { parseCompetitors, parseOverview, parseRanked, type RankedRow } from "@/modules/editorial/lib/seo/labs";
import { findOpportunities, isBrandQuery, isGeneralistDomain, isSitePage, serpUpdate } from "@/modules/editorial/lib/seo/tracking";

const NOW = new Date("2026-11-19T10:00:00Z");
const ok = (items: unknown[], extra: Record<string, unknown> = {}) => ({ status_code: 20000, tasks: [{ status_code: 20000, cost: 0.0132, result: [{ items, ...extra }] }] });

describe("relevé Google", () => {
  const serp = parseSerp(
    "pointage chantier",
    ok([
      { type: "ai_overview", references: [{ domain: "www.capeb.fr", url: "https://www.capeb.fr/a", title: "A" }], items: [{ type: "ai_overview_element", references: [{ domain: "tim-management.co", url: "https://tim-management.co/x", source: "TIM" }] }] },
      { type: "organic", rank_group: 1, url: "https://a.fr/x", domain: "a.fr", title: "A" },
      { type: "organic", rank_group: 2, url: "https://tim-management.co/pointage", domain: "tim-management.co", title: "Nous" },
    ]),
  );
  it("notre position, le n° 1 et les sources de la réponse IA", () => {
    expect(serp.ourPosition).toBe(2);
    expect(serp.ourUrl).toBe("https://tim-management.co/pointage");
    expect(serp.aiOverview?.present).toBe(true);
    expect(serp.aiOverview?.sources.map((s) => s.domain)).toEqual(["capeb.fr", "tim-management.co"]);
  });
  it("évolution, meilleure position, citation et historique", () => {
    const u = serpUpdate({ position: 5, bestPosition: 4, history: [{ date: "2026-11-12", position: 5 }] }, serp, NOW);
    expect(u.positionChange).toBe(3);
    expect(u.bestPosition).toBe(2);
    expect(u.aiCited).toBe(true);
    expect(u.top1Domain).toBe("a.fr");
    expect(u.history).toHaveLength(2);
    expect(u.serp.organic).toHaveLength(2);
  });
  it("absent du top 20 : position vide, pas d'évolution inventée", () => {
    const absent = parseSerp("x", ok([{ type: "organic", rank_group: 1, url: "https://a.fr/x", domain: "a.fr", title: "A" }]));
    const u = serpUpdate({ position: 8, bestPosition: 6 }, absent, NOW);
    expect(u.position).toBeNull();
    expect(u.positionChange).toBeNull();
    expect(u.bestPosition).toBe(6);
    expect(u.aiOverview).toBe(false);
  });
});

describe("recherche de mots-clés", () => {
  it("aperçu : volume, difficulté, intention", () => {
    const r = parseOverview(ok([{ keyword: "pointage chantier", keyword_info: { search_volume: 30, cpc: 2.1 }, keyword_properties: { keyword_difficulty: 41 }, search_intent_info: { main_intent: "commercial" } }]));
    expect(r.rows[0]).toEqual({ keyword: "pointage chantier", volume: 30, difficulty: 41, intent: "commercial", cpc: 2.1 });
  });
  it("requêtes classées : position et page", () => {
    const r = parseRanked(ok([{ keyword_data: { keyword: "calcul temps de travail", keyword_info: { search_volume: 6600 } }, ranked_serp_element: { serp_item: { type: "organic", rank_group: 6, url: "https://tim-management.co/a", etv: 120 } } }], { total_count: 744 }));
    expect(r.total).toBe(744);
    expect(r.rows[0].position).toBe(6);
    expect(r.rows[0].volume).toBe(6600);
  });
  it("concurrents : domaine et requêtes communes", () => {
    const r = parseCompetitors(ok([{ domain: "payfit.com", intersections: 182, avg_position: 12.4, full_domain_metrics: { organic: { count: 50000 } } }]));
    expect(r.rows[0]).toEqual({ domain: "payfit.com", shared: 182, avgPosition: 12.4, keywords: 50000 });
  });
  it("une erreur remonte avec son message", () => {
    expect(() => parseOverview({ status_code: 20000, tasks: [{ status_code: 40501, status_message: "Invalid Field" }] })).toThrow(/Invalid Field/);
  });
});

describe("opportunités", () => {
  const row = (keyword: string, position: number, volume: number, difficulty = 20): RankedRow => ({ keyword, position, volume, difficulty, intent: "informational", cpc: null, url: "https://x/y", type: "organic", etv: null });
  it("requêtes des concurrents où nous sommes absents, hors requêtes de marque, classées", () => {
    const ours = [row("calcul temps de travail", 6, 6600), row("smic 2026", 52, 90000), row("feuille de temps chantier", 30, 100), row("temps de travail btp", 12, 300), row("smic btp", 40, 200), row("smic horaire", 45, 300), row("feuille heures", 20, 90), row("feuille de pointage", 15, 80)];
    const theirs = [
      { domain: "payfit.com", rows: [row("calcul temps de travail", 2, 6600), row("smic 2026", 1, 90000), row("payfit avis", 1, 5000), row("feuille de temps excel", 3, 2000, 10), row("caisse allocation familiale", 2, 7_000_000), { ...row("feuille connexion", 1, 9000), intent: "navigational" }] },
      { domain: "combo.fr", rows: [row("feuille de temps excel", 5, 2000, 10), row("planning equipe", 4, 800)] },
    ];
    const ops = findOpportunities(ours, theirs);
    const keys = ops.map((o) => o.keyword);
    expect(keys).not.toContain("calcul temps de travail");
    expect(keys).not.toContain("payfit avis");
    expect(keys).toContain("smic 2026");
    expect(keys).not.toContain("caisse allocation familiale");
    expect(keys).not.toContain("feuille connexion");
    expect(ops.find((o) => o.keyword === "feuille de temps excel")?.competitors).toHaveLength(2);
  });
  it("les variantes d'une même requête n'en font qu'une (la plus recherchée)", () => {
    const ours = [row("smic net 2026", 52, 9000), row("smic brut", 40, 500), row("smic horaire 2026", 45, 300)];
    const ops = findOpportunities(ours, [{ domain: "legisocial.fr", rows: [row("smic horaire net", 3, 49500), row("net horaire smic", 5, 40000), row("horaire smic net", 6, 1000)] }]);
    expect(ops.map((o) => o.keyword)).toEqual(["smic horaire net"]);
    expect(ops[0].variantes).toBe(2);
  });
  it("une variante d'une requête où nous sommes déjà classés n'est pas une opportunité", () => {
    const ops = findOpportunities([row("calculer heure de travail", 9, 22200), row("heure travail btp", 20, 100), row("calcul heure supp", 30, 100)], [{ domain: "factorial.fr", rows: [row("calcul heure de travail", 9, 22200)] }]);
    expect(ops).toEqual([]);
  });
  it("pages du site : ni articles ni fiches, ni accueil, ni sous-domaines ; marque et sites publics écartés", () => {
    expect(isSitePage("https://tim-management.co/pointage-chantier")).toBe(true);
    expect(isSitePage("https://tim-management.co/")).toBe(false);
    expect(isSitePage("https://tim-management.co/actualite")).toBe(false);
    expect(isSitePage("https://app.tim-management.co/")).toBe(false);
    expect(isSitePage("https://support.tim-management.co/mises-a-jour")).toBe(false);
    expect(isBrandQuery("app tim")).toBe(true);
    expect(isBrandQuery("tim management avis")).toBe(true);
    expect(isBrandQuery("timbre fiscal")).toBe(false);
    expect(isGeneralistDomain("service-public.gouv.fr")).toBe(true);
    expect(isGeneralistDomain("factorial.fr", 15000)).toBe(false);
    expect(isSitePage("https://tim-management.co/actualite/x")).toBe(false);
    expect(isSitePage("https://tim-management.co/fiche-metier/macon")).toBe(false);
  });
});
