import { describe, expect, it } from "vitest";

import { buildAcquisitionAnalytics, channelSpend, monthlyCosts, trackedMonths } from "@/modules/analytics/lib/acquisition";
import { classifyExpenses } from "@/modules/analytics/lib/expenses";

/** Acquisition : le volume par canal ne suffit pas, c'est la conversion qui dit si un canal rapporte. */
const NOW = new Date("2026-09-15T12:00:00.000Z");

describe("acquisition par canal", () => {
  const leads = [
    { id: 1, channel: "seo", createdAt: "2026-08-02T00:00:00.000Z" },
    { id: 2, channel: "seo", createdAt: "2026-09-02T00:00:00.000Z" },
    { id: 3, channel: "sea", createdAt: "2026-09-03T00:00:00.000Z" },
    { id: 4, channel: "sea", createdAt: "2026-05-03T00:00:00.000Z" }, // hors période (3 mois)
  ];
  const clients = [
    { formSubmission: 1, clientStatus: "actif" },
    { formSubmission: 2, clientStatus: "perdue" },
    { formSubmission: 3, clientStatus: "en-qualification" },
    { formSubmission: 4, clientStatus: "actif" },
    { formSubmission: null, clientStatus: "actif" }, // saisie manuelle : pas un lead
  ];
  const a = buildAcquisitionAnalytics(leads, clients, 3, NOW);

  it("mesure la conversion de chaque canal jusqu'à l'affaire gagnée", () => {
    expect(a.channels.map((c) => [c.key, c.leads, c.opportunities, c.won, c.lost, c.conversion])).toEqual([
      ["seo", 2, 2, 1, 1, 50],
      ["sea", 1, 1, 0, 0, 0],
    ]);
    expect(a.kpis).toEqual({ leads: { current: 3, previous: 1, pct: 200 }, won: 1, conversion: 33.33, spend: null, costPerLead: null, costPerWon: null });
  });

  it("étale les leads mois par mois, une colonne par canal", () => {
    expect(a.monthly.map((m) => [m.month.slice(0, 7), m.seo, m.sea])).toEqual([
      ["2026-07", 0, 0],
      ["2026-08", 1, 0],
      ["2026-09", 1, 1],
    ]);
    expect(a.channelKeys.map((c) => c.key)).toEqual(["seo", "sea"]);
  });
});

describe("coût de chaque canal", () => {
  const tx = (id: string, date: string, amount: number, label: string) => ({ id, date, amount, label, categories: [] });
  const expenses = classifyExpenses([
    tx("1", "2026-09-05", -600, "X1946 GOOGLE ADS3358483794"),
    tx("2", "2026-08-25", -156, "X1946 LINKUMA.COM"),
    tx("3", "2026-05-10", -999, "X1946 GOOGLE ADS3358483794"), // hors période (3 mois)
    tx("4", "2026-09-07", -300, "VIR INST VERS HORIZONTE"), // pas de l'acquisition
  ]);

  it("impute à chaque canal la dépense de son poste ; Meta par son API, au prorata des leads", () => {
    const spend = channelSpend(expenses, { "2026-09": 90, "2026-04": 500 }, { "meta-facebook": 2, "meta-instagram": 1 }, 3, NOW);
    expect(spend).toEqual({ seo: 156, sea: 600, chatgpt: 0, "meta-facebook": 60, "meta-instagram": 30 });
  });

  it("Meta : l'API quand elle a un chiffre ce mois-là, sinon la banque — mois par mois", () => {
    const withMetaBank = [...expenses, ...classifyExpenses([tx("9", "2026-08-12", -200, "X1946 FACEBK ADS")])];
    // Août : 200 € à la banque, rien à l'API ; septembre : 90 € à l'API.
    expect(channelSpend(withMetaBank, { "2026-09": 90 }, { "meta-facebook": 1 }, 3, NOW)["meta-facebook"]).toBe(290);
  });

  it("n'impute rien avant le premier mois où les leads sont suivis", () => {
    // Leads suivis depuis septembre : la dépense Linkuma d'août ne compte pas.
    expect(channelSpend(expenses, {}, {}, 3, NOW, "2026-09")).toMatchObject({ seo: 0, sea: 600 });
  });

  it("rapporte la dépense aux leads et aux affaires gagnées, et garde un canal qui coûte sans rien rapporter", () => {
    const leads = [
      { id: 1, channel: "seo", createdAt: "2026-08-02T00:00:00.000Z" },
      { id: 2, channel: "seo", createdAt: "2026-09-02T00:00:00.000Z" },
      { id: 3, channel: "sea", createdAt: "2026-09-03T00:00:00.000Z" },
    ];
    const a = buildAcquisitionAnalytics(leads, [{ formSubmission: 1, clientStatus: "actif" }], 3, NOW, { seo: 156, sea: 600, chatgpt: 120 });
    expect(a.channels.map((c) => [c.key, c.spend, c.costPerLead, c.costPerWon])).toEqual([
      ["seo", 156, 78, 156],
      ["sea", 600, 600, null],
      ["chatgpt", 120, null, null],
    ]);
    expect(a.kpis).toMatchObject({ spend: 876, costPerLead: 292, costPerWon: 876 });
  });
});

describe("coûts mois par mois", () => {
  const tx = (id: string, date: string, amount: number, label: string) => ({ id, date, amount, label, categories: [] });
  const expenses = classifyExpenses([
    tx("1", "2026-08-05", -400, "X1946 GOOGLE ADS"),
    tx("2", "2026-09-05", -600, "X1946 GOOGLE ADS"),
    tx("3", "2026-09-25", -156, "X1946 LINKUMA.COM"),
  ]);
  const leads = [
    { id: 1, channel: "sea", createdAt: "2026-08-10T00:00:00.000Z" },
    { id: 2, channel: "sea", createdAt: "2026-09-10T00:00:00.000Z" },
    { id: 3, channel: "sea", createdAt: "2026-09-11T00:00:00.000Z" },
    { id: 4, channel: "seo", createdAt: "2026-09-12T00:00:00.000Z" },
  ];
  // Le lead d'août est signé en septembre : il compte pour août (sa cohorte).
  const clients = [
    { formSubmission: 1, clientStatus: "actif" },
    { formSubmission: 2, clientStatus: "perdue" },
  ];

  it("ne garde que les mois suivis de la période", () => {
    expect(trackedMonths(3, NOW, "2026-08")).toEqual(["2026-08", "2026-09"]);
    expect(trackedMonths(3, NOW)).toEqual(["2026-07", "2026-08", "2026-09"]);
  });

  it("donne, par mois et par canal, la dépense, les leads et le devenir de leur cohorte", () => {
    const [aug, sep] = monthlyCosts(leads, clients, expenses, {}, ["2026-08", "2026-09"]);
    expect(aug).toMatchObject({ month: "2026-08", spend: 400, leads: 1, costPerLead: 400, opportunities: 1, won: 1, costPerWon: 400 });
    expect(sep).toMatchObject({ spend: 756, leads: 3, costPerLead: 252, opportunities: 1, won: 0, costPerWon: null });
    expect(sep.byChannel.sea).toEqual({ spend: 600, leads: 2, costPerLead: 300, opportunities: 1, won: 0, costPerWon: null });
    expect(sep.byChannel.seo).toMatchObject({ spend: 156, leads: 1, costPerLead: 156 });
  });

  it("garde la dépense d'un mois d'avant le suivi, sans y inventer de leads", () => {
    const [aug, sep] = monthlyCosts(leads, clients, expenses, {}, ["2026-08", "2026-09"], "2026-09");
    expect(aug).toMatchObject({ spend: 400, leads: null, costPerLead: null, won: null });
    expect(aug.byChannel.sea).toMatchObject({ spend: 400, leads: null });
    expect(sep).toMatchObject({ leads: 3, costPerLead: 252 });
  });
});
