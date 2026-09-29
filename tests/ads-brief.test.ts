import { describe, expect, it } from "vitest";

import { AdCampaigns } from "@/modules/ads/collections/AdCampaigns";
import { AdsSettings } from "@/modules/ads/globals/AdsSettings";
import { buildAdsDashboard } from "@/modules/ads/lib/dashboard";
import { CTAS } from "@/modules/ads/lib/cta";

type AnyField = { name?: string; fields?: AnyField[]; tabs?: { fields: AnyField[] }[]; access?: Record<string, (a: unknown) => unknown>; defaultValue?: unknown; validate?: (v: unknown) => unknown; options?: { value: string }[] };
const find = (fields: AnyField[], name: string): AnyField | undefined => {
  for (const f of fields) {
    if (f.name === name) return f;
    const inner = (f.fields && find(f.fields, name)) || f.tabs?.map((t) => find(t.fields, name)).find(Boolean);
    if (inner) return inner;
  }
  return undefined;
};
const F = AdCampaigns.fields as AnyField[];
const admin = { req: { user: { roles: ["admin"] } } } as never;

describe("campagne brouillon : le brief se prépare dans le support", () => {
  it("un admin peut créer une campagne ; elle naît brouillon, sans identifiant chez la régie", () => {
    expect((AdCampaigns.access!.create as (a: unknown) => boolean)(admin)).toBe(true);
    const hook = AdCampaigns.hooks!.beforeChange![0] as (a: unknown) => Record<string, unknown>;
    expect(hook({ operation: "create", data: { name: "Pointage BTP", status: "active" } })).toMatchObject({ status: "brouillon", platform: "meta" });
  });

  it("la synchro, qui crée avec un identifiant, garde l'état lu chez la régie", () => {
    const hook = AdCampaigns.hooks!.beforeChange![0] as (a: unknown) => Record<string, unknown>;
    expect(hook({ operation: "create", data: { name: "C", externalId: "120", status: "active" } })).toMatchObject({ status: "active" });
  });

  it("verrouille le miroir de la régie, champ par champ", () => {
    for (const name of ["externalId", "status", "dailyBudget", "externalStatus", "lastSyncAt", "kpis"]) {
      const f = find(F, name)!;
      expect(f.access!.create({}), `${name} create`).toBe(false);
      expect(f.access!.update({}), `${name} update`).toBe(false);
    }
  });

  it("nom, objectif et compte ne se modifient que tant que c'est un brouillon", () => {
    for (const name of ["name", "objective", "account"]) {
      const upd = find(F, name)!.access!.update;
      expect(upd({ doc: { status: "brouillon" } }), name).toBe(true);
      expect(upd({ doc: { status: "active" } }), name).toBe(false);
    }
  });

  it("seul un brouillon se supprime", () => {
    expect((AdCampaigns.access!.delete as (a: unknown) => unknown)(admin)).toEqual({ status: { equals: "brouillon" } });
  });

  it("le brief : vouvoiement par défaut, les trois boutons d'action autorisés, une page en https", () => {
    expect(find(F, "tone")!.defaultValue).toBe("vous");
    expect(find(F, "cta")!.options!.map((o) => o.value)).toEqual(["en-savoir-plus", "s-inscrire", "reserver"]);
    expect(CTAS.map((c) => c.label)).toEqual(["En savoir plus", "S'inscrire", "Réserver"]);
    const v = find(F, "landingUrl")!.validate!;
    expect(v("https://tim-management.co/demo")).toBe(true);
    expect(v("http://tim-management.co")).toMatch(/https/);
    expect(v("")).toBe(true);
  });
});

describe("garde-fous : budgets de l'atelier", () => {
  it("porte les budgets décidés le 29/09/2026", () => {
    const f = AdsSettings.fields as AnyField[];
    expect(find(f, "textDailyEur")!.defaultValue).toBe(5);
    expect(find(f, "textMonthlyEur")!.defaultValue).toBe(50);
    expect(find(f, "imagesMonthlyEur")!.defaultValue).toBe(20);
    expect(find(f, "videoMonthlyEur")!.defaultValue).toBe(30);
    expect(find(f, "creativesPerCampaignPerWeek")!.defaultValue).toBe(6);
  });
});

describe("tableau de bord", () => {
  it("n'affiche pas les brouillons parmi les campagnes", () => {
    const d = buildAdsDashboard({
      accounts: [{ id: 1, name: "TIM", status: "connecte", currency: "EUR", externalId: "act_1" }],
      campaigns: [
        { id: 10, name: "Lue chez Meta", account: 1, externalId: "c1", status: "active" },
        { id: 11, name: "Brouillon", account: 1, status: "brouillon" },
      ],
      metrics: [],
      now: new Date("2026-09-29T08:00:00Z"),
      days: 7,
    });
    expect(d.campaigns.map((c) => c.name)).toEqual(["Lue chez Meta"]);
  });
});
