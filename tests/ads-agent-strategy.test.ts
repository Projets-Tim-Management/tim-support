import { describe, expect, it, vi } from "vitest";

import { ledgerOf } from "@/modules/ads/agent/engine";
import { TOOLS } from "@/modules/ads/agent/registry";
import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import { libraryBlocker } from "@/modules/ads/agent/run";
import type { LibraryAd } from "@/modules/ads/agent/sources/ad-library";
import type { ToolContext } from "@/modules/ads/agent/tools";
import type { AgentDeps, AgentRow, SourcesPort, StepRow } from "@/modules/ads/agent/types";

import { memoryStore, reply, say, unusedPort } from "./helpers/agent-memory";

/**
 * Pas de campagne à l'aveugle (premier passage réel, 13/10/2026 : des créas
 * génériques, écrites sans analyse des concurrents) : tous les concurrents
 * sont lus, et rien ne se décide ni ne s'écrit avant cette lecture.
 */

const NOW = new Date("2026-10-13T12:00:00Z");

const ad = (pageId: string, days: number): LibraryAd => ({ id: `${pageId}-${days}`, pageId, pageName: `Page ${pageId}`, texts: ["Fini le papier"], titles: [], descriptions: [], start: null, stop: null, runningDays: days, platforms: ["facebook"], euReach: null });

async function ctxFor(role: AgentRow["role"], sources: Partial<SourcesPort> = {}) {
  const mem = memoryStore();
  const run = mem.newRun(5);
  const root = await mem.newRoot(run);
  const agent = await mem.store.createAgent({ run: run.id, parent: root.id, depth: 1, role, status: "en-cours", mission: "M", tools: [...ROLE_TOOLS[role]], model: "claude-opus-5-5", budgetEur: 2 });
  const step = await mem.store.createStep({ run: run.id, agent: agent.id, seq: 0, kind: "outil", tool: "x", status: "en-cours", line: "", input: null, output: null, idempotencyKey: "k", startedAt: NOW.toISOString() });
  const deps = {
    store: mem.store,
    model: vi.fn(async () => reply("end_turn", say("Tous promettent « zéro papier » ; personne ne parle de la paie."))),
    budget: { assert: vi.fn(async () => {}), record: vi.fn(async () => {}) },
    atelier: { generate: vi.fn() },
    sources: { ...unusedPort<SourcesPort>("sources"), ...sources },
    now: () => NOW,
  } as unknown as AgentDeps;
  const agents = await mem.store.listAgents(run.id);
  const ctx: ToolContext = { deps, run, agent: agents.find((a) => a.id === agent.id)!, agents, step: step as StepRow, ledger: (a) => ledgerOf(a, agents) };
  return { ctx, mem, deps };
}

describe("lire les publicités des concurrents", () => {
  it("lit TOUS les concurrents suivis, par lots de 10 (on n'en lisait que les 10 premiers), les plus longues diffusions d'abord", async () => {
    const followed = Array.from({ length: 18 }, (_, i) => ({ pageId: String(1000 + i), name: `C${i}` }));
    const adLibrary = vi.fn(async ({ pageIds }: { pageIds?: string[] }) => (pageIds ?? []).filter((p) => p !== "1017").map((p, i) => ad(p, i * 10)));
    const { ctx } = await ctxFor("stratege", { competitors: vi.fn(async () => followed), adLibrary });
    const out = (await TOOLS.lire_pubs_concurrents.run(ctx, {})) as { output: { pubs: number; sansPubEnFrance: string[]; resume: string } };
    expect(adLibrary).toHaveBeenCalledTimes(2);
    expect(adLibrary.mock.calls.map((c) => c[0].pageIds!.length)).toEqual([10, 8]);
    expect(out.output.pubs).toBe(17);
    expect(out.output.sansPubEnFrance).toEqual(["C17"]);
    expect(out.output.resume).toMatch(/personne ne parle de la paie/);
  });
});

describe("rien ne se décide avant d'avoir lu les concurrents", () => {
  it("positionnement et angles sont refusés sans lecture des publicités concurrentes", async () => {
    const { ctx, mem } = await ctxFor("stratege");
    for (const [tool, input] of [
      ["proposer_positionnement", { positionnement: "P", concurrents: "c", justification: "j", appuis: [] }],
      ["proposer_angles", { angles: ["A"], concurrents: "c", justification: "j", appuis: [] }],
    ] as const) {
      expect(await TOOLS[tool].run(ctx, { ...input })).toMatchObject({ isError: true, output: { refus: expect.stringMatching(/lire_pubs_concurrents/) } });
    }
    expect(mem.decisions).toHaveLength(0);
  });

  it("après lecture, un angle doit dire en quoi il se démarque des concurrents, et le journal le garde", async () => {
    const { ctx, mem } = await ctxFor("stratege");
    await mem.withStrategy(ctx.run);
    ctx.agents = await mem.store.listAgents(ctx.run.id);
    expect(await TOOLS.proposer_angles.run(ctx, { angles: ["La paie juste"], concurrents: " ", justification: "j", appuis: [] })).toMatchObject({ isError: true });
    await TOOLS.proposer_angles.run(ctx, { angles: ["La paie juste"], concurrents: "Tous promettent « zéro papier », personne la paie", justification: "j", appuis: [] });
    expect(mem.decisions.at(-1)).toMatchObject({ kind: "angle", after: { angles: ["La paie juste"], concurrents: expect.stringMatching(/personne la paie/) } });
  });

  it("aucun texte ne s'écrit avant que le stratège ait choisi ses angles", async () => {
    const { ctx, deps } = await ctxFor("redacteur");
    expect(await TOOLS.generer_textes.run(ctx, { angles: ["A"] })).toMatchObject({ isError: true, output: { refus: expect.stringMatching(/stratège/) } });
    expect(deps.atelier.generate).not.toHaveBeenCalled();
  });
});

describe("pas de lancement à l'aveugle", () => {
  it("des concurrents suivis sans bibliothèque publicitaire bloquent le lancement", () => {
    expect(libraryBlocker(18, {})).toMatch(/18 concurrent\(s\) suivi\(s\)/);
    expect(libraryBlocker(18, { META_AD_LIBRARY_TOKEN: "x" })).toBeNull();
    expect(libraryBlocker(18, { ADS_AD_LIBRARY_MOCK: "1" })).toBeNull();
    expect(libraryBlocker(0, {})).toBeNull();
  });
});
