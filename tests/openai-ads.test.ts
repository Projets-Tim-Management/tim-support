import { describe, expect, it } from "vitest";

import { buildOpenAiAds } from "@/modules/analytics/lib/openai-ads";

/** Débuts de mois, en heure de Paris (le fuseau du compte), en secondes Unix. */
const parisMonthStart = (iso: string) => Date.parse(`${iso}T00:00:00+02:00`) / 1000;

describe("ChatGPT Ads (lecture) : ce que lit Sarah", () => {
  const account = { name: "Tim Management", status: "active", review: { status: "approved" } };

  it("additionne la dépense par mois (heure de Paris) et trie les campagnes", () => {
    const v = buildOpenAiAds({
      account,
      monthly: [
        { start_time: parisMonthStart("2026-10-01"), spend: 500.1 },
        { start_time: parisMonthStart("2026-09-01"), spend: "120.5" },
      ],
      campaigns: [
        { campaign_id: "c1", campaign_name: "Petite", spend: 70.47, clicks: 59, impressions: 7975, conversions: 0 },
        { campaign_id: "c2", campaign_name: "Pointage V2", spend: 800, clicks: 700, impressions: 80000, conversions: 14 },
      ],
    });
    expect(v.spendByMonth).toEqual({ "2026-10": 500.1, "2026-09": 120.5 });
    expect(v.campaigns.map((c) => c.name)).toEqual(["Pointage V2", "Petite"]);
    expect(v.last30).toEqual({ spend: 870.47, clicks: 759, impressions: 87975, conversions: 14, cpc: 1.15, costPerConversion: 62.18 });
    expect(v.campaigns[1].costPerConversion).toBeNull();
    // Deux campagnes : pas de constat « une seule campagne » ; le pixel n'est pas un lead qualifié.
    expect(v.findings.some((f) => f.includes("Une seule campagne"))).toBe(false);
    expect(v.findings.some((f) => f.includes("pas un lead qualifié"))).toBe(true);
  });

  it("signale un pixel muet, une campagne unique et une marque non approuvée", () => {
    const v = buildOpenAiAds({
      account: { ...account, review: { status: "pending" } },
      monthly: [],
      campaigns: [{ campaign_id: "c1", campaign_name: "Seule", spend: 300, clicks: 200, impressions: 9000, conversions: 0 }],
    });
    expect(v.account.review).toBe("pending");
    expect(v.findings.join(" ")).toMatch(/n'est pas approuvée/);
    expect(v.findings.join(" ")).toMatch(/Aucune conversion comptée/);
    expect(v.findings.join(" ")).toMatch(/Une seule campagne/);
  });

  it("un compte sans dépense ne produit aucun constat chiffré", () => {
    const v = buildOpenAiAds({ account, monthly: [], campaigns: [] });
    expect(v.last30).toEqual({ spend: 0, clicks: 0, impressions: 0, conversions: 0, cpc: null, costPerConversion: null });
    expect(v.findings).toEqual([]);
  });
});
