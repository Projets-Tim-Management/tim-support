import { describe, expect, it } from "vitest";

import { buildStats, topRows, type ClientRow, type SubmissionRow } from "@/modules/forms/lib/stats";

/**
 * Ces chiffres serviront à décider où mettre le budget publicitaire. Une erreur
 * d'agrégation ne casse rien : elle oriente une décision, en silence.
 */

const sub = (o: Partial<SubmissionRow> = {}): SubmissionRow => ({
  channel: "seo",
  channelSource: "defaut",
  placement: "drawer",
  sourcePagePath: "/contact",
  utmCampaign: null,
  lpVariant: null,
  ...o,
});

describe("regroupement de la longue traîne", () => {
  it("garde les plus gros et regroupe le reste", () => {
    // Sans ça, cinquante pages à un lead chacune masqueraient les trois qui comptent.
    const counts = new Map([["a", 9], ["b", 8], ["c", 1], ["d", 1], ["e", 1]]);
    expect(topRows(counts, 2)).toEqual([
      { label: "a", value: 9 },
      { label: "b", value: 8 },
      { label: "3 autres", value: 3 },
    ]);
  });

  it("n'ajoute pas de ligne « autres » quand tout tient", () => {
    expect(topRows(new Map([["a", 2]]), 8)).toEqual([{ label: "a", value: 2 }]);
    expect(topRows(new Map(), 8)).toEqual([]);
  });

  it("accorde le singulier", () => {
    const counts = new Map([["a", 1], ["b", 1]]);
    expect(topRows(counts, 1)[1].label).toBe("1 autre");
  });
});

describe("agrégats", () => {
  it("traduit les valeurs techniques en libellés lisibles", () => {
    const s = buildStats([sub({ channel: "sea", channelSource: "clic-payant" })], []);
    expect(s.parCanal[0].label).toBe("Google Ads — SEA");
    expect(s.parPreuve[0].label).toBe("Clic payant identifié");
    expect(s.parEmplacement[0].label).toBe("Tiroir global");
  });

  it("nomme ce qui manque au lieu de laisser un vide", () => {
    const s = buildStats([sub({ sourcePagePath: null, utmCampaign: null, lpVariant: null })], []);
    expect(s.parPage[0].label).toBe("page inconnue");
    expect(s.parCampagne[0].label).toBe("sans campagne");
    expect(s.parVariante[0].label).toBe("hors landing page");
  });

  it("trie du plus fréquent au moins fréquent", () => {
    const s = buildStats(
      [sub({ sourcePagePath: "/a" }), sub({ sourcePagePath: "/b" }), sub({ sourcePagePath: "/b" })],
      [],
    );
    expect(s.parPage.map((r) => r.label)).toEqual(["/b", "/a"]);
  });
});

describe("fiabilité de l'attribution SEA", () => {
  it("mesure la part attribuée par un clic réellement constaté", () => {
    const s = buildStats(
      [
        sub({ channel: "sea", channelSource: "clic-payant" }),
        sub({ channel: "sea", channelSource: "clic-payant" }),
        sub({ channel: "sea", channelSource: "landing-page" }),
        sub({ channel: "seo", channelSource: "defaut" }),
      ],
      [],
    );
    // 2 clics constatés sur 3 leads SEA — le lead SEO ne compte pas.
    expect(s.fiabiliteSea).toBeCloseTo(2 / 3);
  });

  it("ne renvoie pas zéro quand il n'y a aucun lead SEA", () => {
    // Zéro se lirait « attribution défaillante » ; il n'y a simplement rien à mesurer.
    expect(buildStats([sub({ channel: "seo" })], []).fiabiliteSea).toBeNull();
    expect(buildStats([], []).fiabiliteSea).toBeNull();
  });
});

describe("devenir des opportunités", () => {
  const clients: ClientRow[] = [
    { clientStatus: "actif" },
    { clientStatus: "actif" },
    { clientStatus: "perdue", lossReason: "prix" },
    { clientStatus: "perdue", lossReason: "prix" },
    { clientStatus: "perdue", lossReason: null },
    { clientStatus: "nouvelle" },
  ];

  it("compte les gagnées et les perdues", () => {
    const s = buildStats([], clients);
    expect(s.gagnees).toBe(2);
    expect(s.perdues).toBe(3);
  });

  it("ne compte les motifs que des affaires perdues", () => {
    const s = buildStats([], clients);
    expect(s.parMotif).toEqual([
      { label: "Prix trop élevé", value: 2, key: "prix" },
      { label: "sans motif", value: 1, key: "sans motif" },
    ]);
  });

  it("reste calme sans aucune donnée", () => {
    const s = buildStats([], []);
    expect(s.total).toBe(0);
    expect(s.gagnees).toBe(0);
    expect(s.parMotif).toEqual([]);
  });
});
