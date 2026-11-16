import { describe, expect, it } from "vitest";

import { buildScorecard, reachedQualified } from "@/modules/ai-team/lib/scorecard";

/**
 * La fiche des canaux : le coût par lead QUALIFIÉ (démo programmée ou plus,
 * même perdu ensuite), canal par canal, face à la période précédente.
 */
const NOW = new Date("2026-11-12T10:00:00Z");
const lead = (id: number, channel: string, at: string) => ({ id, channel, createdAt: at });

describe("un lead qualifié", () => {
  it("se lit dans le journal des étapes : démo programmée ou plus avancé", () => {
    expect(reachedQualified("Étape : Nouvelle → Démo programmée")).toBe(true);
    expect(reachedQualified("Étape : Démo programmée → En phase de test")).toBe(true);
    expect(reachedQualified("Étape : Nouvelle → En qualification")).toBe(false);
    expect(reachedQualified("Étape : Démo programmée → Perdue")).toBe(false);
    expect(reachedQualified("Contrat signé le 02/11/2026")).toBe(false);
  });
});

describe("la fiche des canaux", () => {
  const card = buildScorecard({
    months: 3,
    now: NOW,
    leads: [
      lead(1, "meta-facebook", "2026-10-02T08:00:00Z"),
      lead(2, "meta-instagram", "2026-10-05T08:00:00Z"),
      lead(3, "meta-facebook", "2026-11-01T08:00:00Z"),
      lead(4, "sea", "2026-10-10T08:00:00Z"),
      lead(5, "seo", "2026-09-10T08:00:00Z"),
      lead(6, "meta-facebook", "2026-07-01T08:00:00Z"), // période précédente
    ],
    clients: [
      { id: 101, formSubmission: 1, clientStatus: "perdue" }, // perdu, mais passé par la démo (journal)
      { id: 102, formSubmission: 2, clientStatus: "en-test" }, // qualifié par son statut actuel
      { id: 103, formSubmission: 3, clientStatus: "actif" }, // signé
      { id: 104, formSubmission: 4, clientStatus: "en-qualification" },
      { id: 105, formSubmission: 5, clientStatus: "demo-programmee" },
      { id: 106, formSubmission: 6, clientStatus: "demo-programmee" },
    ],
    journal: [{ client: 101, title: "Étape : Nouvelle → Démo programmée" }, { client: 101, title: "Étape : Démo programmée → Perdue" }],
    spendNow: { "meta-facebook": 200, "meta-instagram": 100, sea: 400 },
    spendBefore: { "meta-facebook": 150 },
    budgets: [],
  });
  const row = (k: string) => card.rows.find((r) => r.key === k)!;

  it("compte un lead qualifié même perdu ensuite, et regroupe Facebook et Instagram sous Meta", () => {
    expect(row("meta").now).toMatchObject({ spend: 300, leads: 3, qualified: 3, won: 1, costPerLead: 100, costPerQualified: 100, costPerWon: 300, qualifiedRate: 100 });
  });

  it("compare au coût par lead qualifié de la période précédente", () => {
    expect(row("meta").before).toMatchObject({ spend: 150, leads: 1, qualified: 1, costPerQualified: 150 });
    expect(row("meta").cpqTrend).toBe(-33.3);
  });

  it("désigne le canal au lead qualifié le moins cher, et dit ce qui ne donne rien", () => {
    expect(card.best).toBe("meta");
    expect(card.headlines[0]).toBe("Le lead qualifié le moins cher vient de Meta Ads : 100 €.");
    expect(card.headlines).toContain("Google Ads : 400 € dépensés et aucun lead qualifié sur la période.");
    expect(card.headlines.some((h) => h.startsWith("Le SEO apporte 1 lead qualifié"))).toBe(true);
    expect(row("google").now.costPerQualified).toBeNull();
  });
});
