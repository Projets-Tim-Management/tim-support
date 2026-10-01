import type { CollectionBeforeDeleteHook } from "payload";
import { describe, expect, it, vi } from "vitest";

import { AdCampaigns } from "@/modules/ads/collections/AdCampaigns";
import { PURGE_CONTEXT } from "@/modules/ads/lib/accounts";

/**
 * Relecture du 29/09/2026, point E. Les clés vers une campagne sont « NOT NULL
 * + ON DELETE SET NULL » (le modèle de Payload pour une relation requise) :
 * supprimer un brouillon qui a un historique d'agent, ou des créas, faisait
 * lever « not-null violation » par Postgres. Une cascade écrite en SQL serait
 * défaite par la prochaine migration générée ; c'est donc un hook qui nettoie.
 */

type Call = { op: "find" | "delete" | "count"; collection: string; where: unknown };

function fakeReq({ runs = [] as number[], creatives = 0, purge = false } = {}) {
  const calls: Call[] = [];
  const payload = {
    find: vi.fn(async ({ collection, where }) => {
      calls.push({ op: "find", collection, where });
      return { docs: collection === "ad-agent-runs" ? runs.map((id) => ({ id })) : [] };
    }),
    count: vi.fn(async ({ collection, where }) => {
      calls.push({ op: "count", collection, where });
      return { totalDocs: collection === "ad-creatives" ? creatives : 0 };
    }),
    delete: vi.fn(async ({ collection, where }) => {
      calls.push({ op: "delete", collection, where });
      return { docs: [], errors: [] };
    }),
  };
  return { calls, req: { payload, context: purge ? { [PURGE_CONTEXT]: true } : {} } };
}

const hooks = (AdCampaigns.hooks?.beforeDelete ?? []) as CollectionBeforeDeleteHook[];
const run = (req: unknown) => Promise.all(hooks.map((h) => h({ req, id: 42 } as never)));

describe("supprimer un brouillon de campagne", () => {
  it("emporte l'historique de l'agent, enfants avant parents (les clés NOT NULL l'exigent)", async () => {
    const { calls, req } = fakeReq({ runs: [7, 8] });
    await run(req);
    const deletes = calls.filter((c) => c.op === "delete");
    expect(deletes.map((c) => c.collection)).toEqual(["ad-decisions", "ad-agent-steps", "ad-agents", "ad-agent-runs"]);
    expect(deletes[0].where).toEqual({ campaign: { equals: 42 } });
    expect(deletes[1].where).toEqual({ run: { in: [7, 8] } });
    expect(deletes[3].where).toEqual({ id: { in: [7, 8] } });
  });

  it("ne touche pas au registre des dépenses IA : il garde la trace de l'argent dépensé", async () => {
    const { calls, req } = fakeReq({ runs: [7] });
    await run(req);
    expect(calls.some((c) => c.collection === "ad-ai-usage")).toBe(false);
  });

  it("refuse tant que la campagne a des créas, en le disant — elles restent jusqu'à un refus explicite", async () => {
    const { calls, req } = fakeReq({ runs: [7], creatives: 3 });
    await expect(run(req)).rejects.toThrow(/3 créas/);
    expect(calls.some((c) => c.op === "delete")).toBe(false);
  });

  it("la purge d'un compte, elle, emporte aussi les créas", async () => {
    const { calls, req } = fakeReq({ creatives: 3, purge: true });
    await run(req);
    expect(calls.filter((c) => c.op === "delete").map((c) => c.collection)).toContain("ad-creatives");
  });
});
