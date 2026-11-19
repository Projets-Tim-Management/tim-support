import { describe, expect, it } from "vitest";

import { buildGoogleAds, competitorIn } from "@/modules/analytics/lib/google-ads";

/**
 * Google Ads en lecture : ce que lit Thomas (chef Google Ads) et ce qu'il
 * remet à Mark — en premier, ce qui empêche Google d'enchérir juste.
 */
const camp = (name: string, status: string, cost: number, clicks: number, conversions = 0) => ({
  campaign: { id: name, name, status, advertisingChannelType: "SEARCH" },
  campaignBudget: { amountMicros: "30000000" },
  metrics: { costMicros: String(cost * 1e6), clicks: String(clicks), impressions: "1000", conversions },
});
const term = (t: string, cost: number, clicks: number, conversions = 0) => ({ searchTermView: { searchTerm: t }, metrics: { costMicros: String(cost * 1e6), clicks: String(clicks), conversions } });

describe("un concurrent dans une recherche", () => {
  it("se repère au mot près, sans casse ni accents", () => {
    expect(competitorIn("logiciel kraaft", ["Kraaft", "Traxxeo"])).toBe("Kraaft");
    expect(competitorIn("TRAXXEO mobile", ["Kraaft", "Traxxeo"])).toBe("Traxxeo");
    expect(competitorIn("eurecia avis", ["Eurécia"])).toBe("Eurécia");
    expect(competitorIn("kraaftsman", ["Kraaft"])).toBeNull();
    expect(competitorIn("feuille d heure chantier", ["Kraaft"])).toBeNull();
  });
});

describe("ce que lit Thomas", () => {
  const g = buildGoogleAds({
    monthly: [
      { segments: { month: "2026-10-01" }, metrics: { costMicros: "500000000" } },
      { segments: { month: "2026-11-01" }, metrics: { costMicros: "378500000" } },
    ],
    campaigns: [camp("Search v2", "ENABLED", 878.5, 108), camp("PMax", "PAUSED", 0, 0), camp("Ancienne", "REMOVED", 0, 0)],
    terms: [term("btp box", 40.81, 5), term("logiciel kraaft", 9.94, 1), term("pointeuse chantier", 22.1, 1), term("feuille d heure", 3.81, 2)],
    keywords: [{ adGroupCriterion: { keyword: { text: "logiciel pointage", matchType: "PHRASE" }, status: "ENABLED", qualityInfo: { qualityScore: 3 } }, metrics: { costMicros: "50000000", clicks: "6", conversions: 0 } }],
    conversionActions: [],
    competitors: ["Kraaft", "Traxxeo"],
  });

  it("additionne la dépense par mois et les 30 derniers jours, sans les campagnes supprimées sans dépense", () => {
    expect(g.spendByMonth).toEqual({ "2026-10": 500, "2026-11": 378.5 });
    expect(g.last30).toMatchObject({ cost: 878.5, clicks: 108, conversions: 0, cpc: 8.13 });
    expect(g.campaigns.map((c) => c.name)).toEqual(["Search v2", "PMax"]);
  });

  it("dit d'abord que Google enchérit à l'aveugle, puis les concurrents, puis les recherches à couper", () => {
    expect(g.findings[0]).toMatch(/^Aucune action de conversion active : Google enchérit à l'aveugle \(879 € dépensés/);
    expect(g.findings.some((f) => /recherches de concurrents suivis \(Kraaft\)/.test(f))).toBe(true);
    expect(g.findings.some((f) => /recherche\(s\) à plus de 15 € sans conversion : « btp box » \(41 €\), « pointeuse chantier » \(22 €\)/.test(f))).toBe(true);
    expect(g.findings.some((f) => /le reste est masqué/.test(f))).toBe(true);
    expect(g.findings.some((f) => /niveau de qualité de 4\/10 ou moins/.test(f))).toBe(true);
  });

  it("parle d'un suivi qui ne remonte pas quand des actions de conversion existent", () => {
    const h = buildGoogleAds({ monthly: [], campaigns: [camp("S", "ENABLED", 100, 10)], terms: [], keywords: [], conversionActions: [{ conversionAction: { status: "ENABLED" } }], competitors: [] });
    expect(h.findings[0]).toMatch(/1 action\(s\) de conversion sont actives : le suivi ne remonte pas/);
  });
});
