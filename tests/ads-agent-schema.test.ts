import type { CollectionBeforeChangeHook } from "payload";
import { describe, expect, it } from "vitest";

import { AI_SHARE_MAX_PCT, metaRoomEur, validateAgentBudget } from "@/modules/ads/agent/limits";
import { AdAgentRuns } from "@/modules/ads/collections/AdAgentRuns";
import { AdAgents } from "@/modules/ads/collections/AdAgents";
import { AdAgentSteps } from "@/modules/ads/collections/AdAgentSteps";
import { AdCompetitors } from "@/modules/ads/collections/AdCompetitors";
import { AdDecisions } from "@/modules/ads/collections/AdDecisions";

const admin = { req: { user: { roles: ["admin"] } } } as never;
const partner = { req: { user: { roles: ["partner-metier"] } } } as never;
const call = (fn: unknown, arg: unknown) => (fn as (a: unknown) => unknown)(arg);

describe("agent de campagne : ce que l'agent écrit, personne d'autre ne l'écrit", () => {
  it.each([AdAgentRuns, AdAgents, AdAgentSteps, AdDecisions].map((c) => [c.slug, c] as const))(
    "%s : lecture admin seule, aucune écriture par l'API (même admin)",
    (_slug, col) => {
      expect(call(col.access!.read, admin)).toBe(true);
      expect(call(col.access!.read, partner)).toBe(false);
      for (const op of ["create", "update", "delete"] as const) expect(call(col.access![op], admin), op).toBe(false);
    },
  );

  it("une étape reprise ne se rejoue pas : clé d'idempotence unique, rang unique par agent", () => {
    const key = AdAgentSteps.fields.find((f) => "name" in f && f.name === "idempotencyKey");
    expect(key && "unique" in key && key.unique).toBe(true);
    expect(AdAgentSteps.indexes).toEqual([{ fields: ["agent", "seq"], unique: true }]);
  });

  it("la liste des concurrents se tient à la main (admin), pas par un partenaire", () => {
    for (const op of ["read", "create", "update", "delete"] as const) {
      expect(call(AdCompetitors.access![op], admin), op).toBe(true);
      expect(call(AdCompetitors.access![op], partner), op).toBe(false);
    }
  });
});

describe("concurrents : la date du geste", () => {
  const hook = AdCompetitors.hooks!.beforeChange![0] as CollectionBeforeChangeHook;
  const run = (data: Record<string, unknown>, originalDoc?: Record<string, unknown>) =>
    hook({ data, originalDoc, operation: originalDoc ? "update" : "create" } as never) as Record<string, unknown>;

  it("est posée quand une proposition devient suivie ou refusée", () => {
    expect(run({ status: "suivi" }, { status: "propose" }).decidedAt).toEqual(expect.any(String));
    expect(run({ status: "refuse" }, { status: "propose" }).decidedAt).toEqual(expect.any(String));
  });

  it("ne l'est pas pour une proposition de l'agent, ni sans changement d'état", () => {
    expect(run({ status: "propose" }).decidedAt).toBeUndefined();
    expect(run({ status: "suivi", name: "X" }, { status: "suivi" }).decidedAt).toBeUndefined();
  });
});

describe("bornes du budget d'une campagne", () => {
  it("accepte les défauts validés (15 % de part IA, 5 € de plancher)", () => {
    expect(validateAgentBudget({ totalDailyEur: 30, maxAiSharePct: 15, metaFloorEur: 5 })).toBe(true);
  });

  it("ne vérifie rien tant qu'aucun budget n'est saisi", () => {
    expect(validateAgentBudget({})).toBe(true);
  });

  it(`refuse une part IA au-delà de ${AI_SHARE_MAX_PCT} %, ou négative`, () => {
    expect(validateAgentBudget({ totalDailyEur: 30, maxAiSharePct: AI_SHARE_MAX_PCT + 1, metaFloorEur: 0 })).toMatch(/part IA/);
    expect(validateAgentBudget({ totalDailyEur: 30, maxAiSharePct: -1, metaFloorEur: 0 })).toMatch(/part IA/);
  });

  it("refuse un plancher Meta qui ne tient pas dans ce que laisse la part IA", () => {
    // 10 € avec 50 % de part IA : 5 € pour Meta ; un plancher de 6 € n'y tient pas.
    expect(metaRoomEur(10, 50)).toBe(5);
    expect(validateAgentBudget({ totalDailyEur: 10, maxAiSharePct: 50, metaFloorEur: 6 })).toMatch(/n'y tient pas/);
    expect(validateAgentBudget({ totalDailyEur: 10, maxAiSharePct: 50, metaFloorEur: 5 })).toBe(true);
  });

  it("refuse un total nul ou négatif", () => {
    expect(validateAgentBudget({ totalDailyEur: 0, maxAiSharePct: 15, metaFloorEur: 0 })).toMatch(/positif/);
  });
});
