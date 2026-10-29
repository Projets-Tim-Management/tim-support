import { describe, expect, it } from "vitest";

import { judgeTest, metricValue, winProbabilities, type VariantData } from "@/modules/ads/lib/ab-verdict";
import { evaluateTests, openTest } from "@/modules/ads/lib/tests-run";

const v = (label: string, over: Partial<VariantData> = {}): VariantData => ({ label, spend: 50, impressions: 10_000, linkClicks: 300, landingViews: 250, leads: 0, qualifiedLeads: 0, ...over });

describe("le verdict d'un test A/B, calculé par le code", () => {
  it("des variantes identiques se partagent la probabilité", () => {
    const [a, b] = winProbabilities([v("A"), v("B")], "ctr");
    expect(a).toBeGreaterThan(0.4);
    expect(b).toBeGreaterThan(0.4);
    expect(a + b).toBeCloseTo(1, 2);
  });

  it("déterministe : les mêmes chiffres, le même verdict", () => {
    expect(winProbabilities([v("A"), v("B", { linkClicks: 330 })], "ctr")).toEqual(winProbabilities([v("A"), v("B", { linkClicks: 330 })], "ctr"));
  });

  it("un écart net, avec le volume et la durée : gagnant à confiance forte", () => {
    const r = judgeTest([v("C17", { linkClicks: 300 }), v("C19", { linkClicks: 450 })], "ctr", 8);
    expect(r).toMatchObject({ status: "conclu", winner: 1, confidence: "forte" });
    expect(r.status === "conclu" && r.probability).toBeGreaterThan(0.99);
  });

  it("sous la durée ou le volume minimum : en attente, aucune conclusion", () => {
    expect(judgeTest([v("A", { linkClicks: 300 }), v("B", { linkClicks: 450 })], "ctr", 3)).toMatchObject({ status: "en-attente-de-volume", reason: "3 jour(s) sur 7 au minimum" });
    expect(judgeTest([v("A", { linkClicks: 10 }), v("B", { linkClicks: 450 })], "ctr", 10)).toMatchObject({ status: "en-attente-de-volume", reason: expect.stringMatching(/A 10\/30/) });
  });

  it("aucun lead : un test sur le coût par lead finit sans verdict au bout de 42 jours", () => {
    expect(judgeTest([v("A"), v("B")], "cpl", 20).status).toBe("en-attente-de-volume");
    expect(judgeTest([v("A"), v("B")], "cpl", 42)).toMatchObject({ status: "sans-verdict", reason: expect.stringMatching(/^42 jours écoulés/) });
  });

  it("une avance de 80 à 95 % ne conclut qu'après deux fois la durée minimum", () => {
    const close = [v("A", { linkClicks: 300 }), v("B", { linkClicks: 328 })];
    const p = Math.max(...winProbabilities(close, "ctr"));
    expect(p).toBeGreaterThan(0.8);
    expect(p).toBeLessThan(0.95);
    expect(judgeTest(close, "ctr", 8).status).toBe("en-cours");
    expect(judgeTest(close, "ctr", 14)).toMatchObject({ status: "conclu", confidence: "moyenne" });
  });

  it("un coût par lead : moins cher gagne", () => {
    const r = judgeTest([v("A", { leads: 60, spend: 600 }), v("B", { leads: 60, spend: 300 })], "cpl", 10);
    expect(r).toMatchObject({ status: "conclu", winner: 1 });
    expect(metricValue(v("B", { leads: 60, spend: 300 }), "cpl")).toBe(5);
    expect(metricValue(v("A"), "ctr")).toBe(3);
  });
});

type Doc = Record<string, unknown> & { id: number };
function memory(seed: Record<string, Doc[]>) {
  const tables: Record<string, Doc[]> = { "ad-tests": [], "ad-objects": [], "ad-campaigns": [], "ad-metrics-daily": [], ...seed };
  let next = 100;
  const ok = (d: Doc, w: Record<string, unknown>): boolean =>
    Object.entries(w).every(([k, c]) => {
      if (k === "and") return (c as Record<string, unknown>[]).every((x) => ok(d, x));
      const cond = c as Record<string, unknown>;
      if ("equals" in cond) return String(d[k]) === String(cond.equals);
      if ("in" in cond) return (cond.in as unknown[]).map(String).includes(String(d[k]));
      if ("greater_than_equal" in cond) return String(d[k]) >= String(cond.greater_than_equal);
      return true;
    });
  const find = async ({ collection, where }: { collection: string; where?: Record<string, unknown> }) => ({ docs: tables[collection].filter((d) => ok(d, where ?? {})) });
  const payload = {
    find,
    count: async (a: { collection: string; where?: Record<string, unknown> }) => ({ totalDocs: (await find(a)).docs.length }),
    findByID: async ({ collection, id }: { collection: string; id: number }) => tables[collection].find((d) => d.id === Number(id)),
    create: async ({ collection, data }: { collection: string; data: Doc }) => {
      const d = { ...data, id: next++ };
      tables[collection].push(d);
      return d;
    },
    update: async ({ collection, id, data }: { collection: string; id: number; data: Doc }) => Object.assign(tables[collection].find((d) => d.id === id)!, data),
  };
  return { payload: payload as never, tables };
}

describe("ouvrir puis juger un test", () => {
  const seed = () => ({
    "ad-campaigns": [{ id: 7, externalId: "C7" }],
    "ad-objects": [
      { id: 1, level: "ad", externalId: "111111", campaignExternalId: "C7" },
      { id: 2, level: "ad", externalId: "222222", campaignExternalId: "C7" },
      { id: 3, level: "ad", externalId: "333333", campaignExternalId: "C8" },
    ],
  });
  const variants = [
    { label: "C17", ads: ["111111"] },
    { label: "C19", ads: ["222222"] },
  ];

  it("refuse ce qui ne se compare pas", async () => {
    const { payload } = memory(seed());
    const base = { campaign: 7, hypothesis: "La météo accroche mieux", dimension: "angle", metric: "ctr" };
    await expect(openTest(payload, { ...base, variants: [variants[0]] })).rejects.toThrow(/2 à 4 variantes/);
    await expect(openTest(payload, { ...base, variants: [variants[0], { label: "X", ads: ["111111"] }] })).rejects.toThrow(/qu'à une variante/);
    await expect(openTest(payload, { ...base, variants: [variants[0], { label: "X", ads: ["333333"] }] })).rejects.toThrow(/hors de cette campagne/);
    await expect(openTest(payload, { ...base, metric: "magie", variants })).rejects.toThrow(/Métrique inconnue/);
  });

  it("un seul à la fois ; jugé sur les chiffres depuis l'ouverture, puis clos", async () => {
    const { payload, tables } = memory(seed());
    const opened = new Date("2026-11-09T08:00:00Z");
    const id = await openTest(payload, { campaign: 7, hypothesis: "La météo accroche mieux", dimension: "angle", metric: "ctr", variants }, opened);
    await expect(openTest(payload, { campaign: 7, hypothesis: "Autre", dimension: "ton", metric: "ctr", variants })).rejects.toThrow(/un seul à la fois/);
    const days = ["2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12", "2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"];
    for (const d of days) {
      tables["ad-metrics-daily"].push({ id: 0, level: "ad", externalId: "111111", day: d, spend: 5, impressions: 1500, linkClicks: 40, landingViews: 30 } as Doc);
      tables["ad-metrics-daily"].push({ id: 0, level: "ad", externalId: "222222", day: d, spend: 5, impressions: 1500, linkClicks: 70, landingViews: 55 } as Doc);
    }
    expect(await evaluateTests(payload, new Date("2026-11-12T08:00:00Z"))).toEqual({ judged: 1, closed: 0 });
    expect(tables["ad-tests"][0]).toMatchObject({ status: "en-attente-de-volume" });
    expect(await evaluateTests(payload, new Date("2026-11-17T08:00:00Z"))).toEqual({ judged: 1, closed: 1 });
    const t = tables["ad-tests"].find((x) => x.id === id)!;
    expect(t).toMatchObject({ status: "conclu", winner: "C19", confidence: "forte" });
    // Le jour d'avant l'ouverture ne compte pas : 8 jours × 40 clics.
    expect((t.results as { label: string; linkClicks: number }[])[0]).toMatchObject({ label: "C17", linkClicks: 320 });
  });
});
