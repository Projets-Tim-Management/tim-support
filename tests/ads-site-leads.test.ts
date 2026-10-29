import { describe, expect, it } from "vitest";

import { countSiteLeads, type AdParent } from "@/modules/ads/lib/site-leads";
import { metaAction, metaIssues } from "@/modules/ads/platforms/meta";

const ads = new Map<string, AdParent>([["120256556940760309", { adsetExternalId: "120256556442340309", campaignExternalId: "120256556389760309" }]]);
const campaigns = new Set(["120256556389760309"]);
const sub = (over: Record<string, unknown> = {}) => ({ id: 1, createdAt: "2026-10-22T08:00:00.000Z", utmMedium: "paid_social", utmCampaign: "120256556389760309", utmContent: "120256556940760309", ...over });

describe("leads du site rattachés à la pub", () => {
  it("un formulaire compte sur la pub, son ensemble et sa campagne, au jour du formulaire", () => {
    const rows = countSiteLeads([sub()], [], ads, campaigns, "Europe/Paris");
    expect(rows.map((r) => [r.level, r.externalId, r.day, r.siteLeads])).toEqual([
      ["campaign", "120256556389760309", "2026-10-22", 1],
      ["adset", "120256556442340309", "2026-10-22", 1],
      ["ad", "120256556940760309", "2026-10-22", 1],
    ]);
  });

  it("le jour suit le fuseau du compte", () => {
    const [row] = countSiteLeads([sub({ createdAt: "2026-10-22T22:30:00.000Z" })], [], ads, campaigns, "Europe/Paris");
    expect(row.day).toBe("2026-10-23");
  });

  it("qualifié dès la démo programmée, gagné une fois signé ; une fiche perdue n'est pas qualifiée", () => {
    const subs = [sub({ id: 1 }), sub({ id: 2 }), sub({ id: 3 }), sub({ id: 4 })];
    const files = [
      { formSubmission: 1, clientStatus: "demo-programmee" },
      { formSubmission: 2, clientStatus: "actif" },
      { formSubmission: 3, clientStatus: "perdue" },
    ];
    const c = countSiteLeads(subs, files, ads, campaigns, "Europe/Paris").find((r) => r.level === "campaign")!;
    expect(c).toMatchObject({ siteLeads: 4, qualifiedLeads: 2, won: 1 });
  });

  it("sans pub connue, le lead remonte à sa campagne seule", () => {
    const rows = countSiteLeads([sub({ utmContent: "{{ad.id}}" })], [], ads, campaigns, "Europe/Paris");
    expect(rows.map((r) => r.level)).toEqual(["campaign"]);
  });

  it("ignore ce qui ne vient pas d'une pub Meta du compte", () => {
    expect(countSiteLeads([sub({ utmMedium: "cpc" }), sub({ utmCampaign: "999999", utmContent: "888888" })], [], ads, campaigns, "Europe/Paris")).toEqual([]);
  });
});

describe("ce que Meta dit d'une pub", () => {
  it("lit une action par son type", () => {
    expect(metaAction([{ action_type: "landing_page_view", value: "12" }, { action_type: "link_click", value: "20" }], "landing_page_view")).toBe(12);
    expect(metaAction(undefined, "landing_page_view")).toBe(0);
  });

  it("dit en clair ce que la revue et la diffusion reprochent, sans doublon", () => {
    expect(
      metaIssues({ global: { "Personal Attributes": "La pub sous-entend un attribut personnel." } }, [
        { error_summary: "Pub refusée", error_message: "Ne respecte pas les règles" },
        { error_summary: "Pub refusée", error_message: "Ne respecte pas les règles" },
      ]),
    ).toEqual(["Personal Attributes : La pub sous-entend un attribut personnel.", "Pub refusée — Ne respecte pas les règles"]);
    expect(metaIssues(null, null)).toEqual([]);
  });
});
