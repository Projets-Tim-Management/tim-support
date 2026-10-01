import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";

import { submitRefusal } from "@/modules/ads/agent/atelier-port";
import { toApiRequest } from "@/modules/ads/agent/claude";
import { launchRun, LaunchError, runBudget, stopRun } from "@/modules/ads/agent/run";
import type { CreativeView } from "@/modules/ads/agent/types";

/**
 * Le pilotage de l'agent (plan, §9 quater, commit 6) : ce qui part vers l'API,
 * ce qui se dépose, et les garde-fous du lancement et de l'arrêt.
 */

const NOW = new Date("2026-10-05T08:00:00Z");

describe("la requête envoyée à Claude", () => {
  const req = (model: "claude-opus-5-5" | "claude-haiku-4-5") => ({
    model,
    system: "Règles",
    messages: [
      { role: "user" as const, content: "Mission" },
      { role: "assistant" as const, content: [{ type: "text", text: "…" }] as Anthropic.ContentBlockParam[] },
      { role: "user" as const, content: [{ type: "tool_result", tool_use_id: "a", content: "{}" }] as Anthropic.ContentBlockParam[] },
    ],
    tools: [
      { name: "a", description: "", input_schema: { type: "object" as const } },
      { name: "b", description: "", input_schema: { type: "object" as const } },
    ],
    maxTokens: 12_000,
  });

  it("met en cache les instructions, les outils et la fin de la conversation", () => {
    const r = toApiRequest(req("claude-opus-5-5"));
    expect(r.system).toEqual([{ type: "text", text: "Règles", cache_control: { type: "ephemeral" } }]);
    expect(r.tools!.at(-1)).toMatchObject({ name: "b", cache_control: { type: "ephemeral" } });
    expect(r.tools![0]).not.toHaveProperty("cache_control");
    expect((r.messages.at(-1)!.content as { cache_control?: unknown }[]).at(-1)!.cache_control).toEqual({ type: "ephemeral" });
    expect(r.messages[0].content).toBe("Mission");
  });

  it("effort « medium » pour Opus et Sonnet, rien pour Haiku", () => {
    expect(toApiRequest(req("claude-opus-5-5"))).toMatchObject({ output_config: { effort: "medium" } });
    expect(toApiRequest(req("claude-haiku-4-5"))).not.toHaveProperty("output_config");
  });

  it("sans outil (un résumé), n'envoie pas de liste d'outils vide", () => {
    expect(toApiRequest({ ...req("claude-haiku-4-5"), tools: [] })).not.toHaveProperty("tools");
  });
});

describe("déposer une créa « À valider »", () => {
  const c = (over: Partial<CreativeView> = {}): CreativeView => ({ id: 1, angle: "a", requestedAngle: null, status: "brouillon", publishable: true, visuals: 3, texts: [], ...over });
  it("seulement une créa en brouillon, aux textes passés, avec ses trois formats", () => {
    expect(submitRefusal(c())).toBeNull();
    expect(submitRefusal(c({ publishable: false }))).toMatch(/texte principal ou un titre/);
    expect(submitRefusal(c({ visuals: 2 }))).toMatch(/2 sur 3 formats/);
    expect(submitRefusal(c({ status: "validee" }))).toMatch(/Déjà/);
  });
});

/** Juste ce que le lancement lit et écrit. */
function fakePayload(o: { settings?: Record<string, unknown>; campaign?: Record<string, unknown>; spent?: number; creativesThisWeek?: number; activeRuns?: number; agents?: { id: number; status: string }[]; run?: Record<string, unknown> } = {}) {
  const created: { collection: string; data: Record<string, unknown> }[] = [];
  const updated: { collection: string; id: unknown; data: Record<string, unknown> }[] = [];
  const payload = {
    findGlobal: async ({ slug }: { slug: string }) => (slug === "ads-settings" ? { enabled: true, agentPrepMaxEur: 5, agentDailyEur: 15, agentMonthlyEur: 150, creativesPerCampaignPerWeek: 6, ...o.settings } : { defaultTone: "vous" }),
    findByID: async ({ collection }: { collection: string }) =>
      collection === "ad-agent-runs"
        ? { status: "en-cours", ...o.run }
        : { id: 4, name: "Test", status: "brouillon", brief: { audience: "BTP", pain: "Papier", offer: "Démo", proofs: [], angles: [] }, ...o.campaign },
    find: async ({ collection }: { collection: string }) =>
      collection === "ad-ai-usage"
        ? { docs: o.spent ? [{ eur: o.spent }] : [] }
        : collection === "ad-agent-runs"
          ? { docs: Array.from({ length: o.activeRuns ?? 0 }, (_, i) => ({ id: 50 + i })) }
          : collection === "ad-agents"
            ? { docs: o.agents ?? [] }
            : { docs: [] },
    count: async () => ({ totalDocs: o.creativesThisWeek ?? 0 }),
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => (created.push({ collection, data }), { id: created.length, ...data }),
    update: async ({ collection, id, data }: { collection: string; id: unknown; data: Record<string, unknown> }) => (updated.push({ collection, id, data }), { id, ...data }),
  };
  return { payload: payload as never, created, updated };
}

describe("budget d'un passage", () => {
  it("le plafond choisi (2 € pour le premier vrai passage) l'emporte sur les 5 € de préparation", async () => {
    const { payload } = fakePayload();
    expect((await runBudget(payload, 2, NOW)).prep).toEqual({ ok: true, budgetEur: 2 });
    expect((await runBudget(payload, null, NOW)).prep).toEqual({ ok: true, budgetEur: 5 });
  });

  it("et jamais plus que ce qui reste au plafond global des agents", async () => {
    const { payload } = fakePayload({ spent: 13.8 });
    expect((await runBudget(payload, 2, NOW)).prep).toEqual({ ok: true, budgetEur: 1.2 });
  });
});

describe("lancer", () => {
  const input = { campaign: 4, objective: "Obtenir des démos auprès des PME du BTP", capEur: 2, userId: 9 };

  it("crée le passage et son orchestrateur, au budget du passage, sans rien exécuter d'autre", async () => {
    const { payload, created } = fakePayload();
    const r = await launchRun(payload, input, NOW);
    expect(r.budgetEur).toBe(2);
    expect(created.map((c) => c.collection)).toEqual(["ad-agent-runs", "ad-agents"]);
    expect(created[0].data).toMatchObject({ status: "en-cours", budgetEur: 2, objective: input.objective, startedBy: 9, limits: expect.objectContaining({ plafondDuPassageEur: 2 }) });
    expect(created[1].data).toMatchObject({ role: "orchestrateur", depth: 0, budgetEur: 2, model: "claude-opus-5-5", tools: expect.arrayContaining(["deposer_a_valider"]) });
  });

  it.each([
    ["sans objectif", { objective: " " }, {}, /objectif/],
    ["sur une campagne publiée", {}, { campaign: { status: "active" } }, /brouillon/],
    ["avec un brief incomplet", {}, { campaign: { brief: { audience: "", pain: "", offer: "" } } }, /Brief incomplet/],
    ["quota de la semaine atteint", {}, { creativesThisWeek: 6 }, /Quota/],
    ["un passage déjà en cours", {}, { activeRuns: 1 }, /déjà en cours/],
    ["interrupteur coupé", {}, { settings: { enabled: false } }, /Interrupteur/],
    ["plafond global épuisé", {}, { spent: 14.8 }, /Plafond global des agents/],
  ])("refuse %s, en le disant", async (_label, over, fake, reason) => {
    const { payload, created } = fakePayload(fake as never);
    await expect(launchRun(payload, { ...input, ...over }, NOW)).rejects.toThrow(reason);
    expect(created).toHaveLength(0);
  });
});

describe("arrêter", () => {
  it("arrête le passage et chaque agent qui n'a pas fini ; ceux qui ont fini restent tels quels", async () => {
    const { payload, updated } = fakePayload({ agents: [{ id: 1, status: "en-cours" }, { id: 2, status: "termine" }, { id: 3, status: "en-attente" }] });
    await stopRun(payload, 7, "cpiancatelli@tim-management.co", NOW);
    expect(updated[0]).toMatchObject({ collection: "ad-agent-runs", id: 7, data: { status: "arrete", error: expect.stringMatching(/Arrêté par cpiancatelli@tim-management.co à 10:00/) } });
    expect(updated.filter((u) => u.collection === "ad-agents").map((u) => u.id)).toEqual([1, 3]);
  });

  it("refuse d'arrêter un passage déjà fini", async () => {
    const { payload } = fakePayload({ run: { status: "a-valider" } });
    await expect(stopRun(payload, 7, "x", NOW)).rejects.toThrow(LaunchError);
  });
});

