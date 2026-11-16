import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/agent/suivi-port", () => ({
  payloadSuivi: () => ({
    report: async () => ({ totaux: { depenseEur: 55.47, vuesPage: 347, leadsSite: 0 } }),
    journal: async () => ({ decisions: [], alertes: [] }),
    tests: async () => [],
  }),
}));
vi.mock("@/modules/ads/agent/run", () => ({ loadNotebook: async () => ({ instructions: [], learnings: [] }) }));
vi.mock("@/modules/ads/lib/spend", async (orig) => ({ ...(await orig<object>()), assertAdsBudget: async () => ({ ok: true }), recordAdsUsage: async () => ({}) }));

const { askAgent, QuestionError } = await import("@/modules/ads/agent/question");

describe("poser une question à l'agent", () => {
  const created: Record<string, unknown>[] = [];
  const payload = {
    find: async () => ({ docs: [{ kind: "quotidien", startedAt: "2026-10-29T13:00:00Z", summary: "RAS" }] }),
    create: async ({ data }: { data: Record<string, unknown> }) => (created.push(data), { id: 5, ...data }),
  } as never;
  const model = vi.fn(async () => ({ content: [{ type: "text", text: "Meta privilégie C19, cliquée deux fois plus." }], stopReason: "end_turn", usage: { input: 6_000, output: 300, cacheRead: 0, cacheWrite: 0 } }));

  it("répond à partir des données de la campagne, et garde la question et la réponse", async () => {
    const r = await askAgent(payload, { campaign: 7, question: "Pourquoi C17 ne diffuse plus ?", userId: 1 }, { model: model as never, now: new Date("2026-10-29T15:00:00Z") });
    expect(r.answer).toBe("Meta privilégie C19, cliquée deux fois plus.");
    const req = (model.mock.calls[0] as unknown[])[0] as { model: string; messages: { content: string }[]; system: string };
    expect(req.model).toBe("claude-sonnet-5-5");
    expect(req.messages[0].content).toContain('"vuesPage":347');
    expect(req.messages[0].content).toMatch(/Question de Charlie : Pourquoi C17 ne diffuse plus \?$/);
    expect(req.system).toMatch(/Tu n'agis pas/);
    expect(created[0]).toMatchObject({ campaign: 7, question: "Pourquoi C17 ne diffuse plus ?", answer: "Meta privilégie C19, cliquée deux fois plus.", askedBy: 1 });
  });

  it("refuse une question vide ou trop longue", async () => {
    await expect(askAgent(payload, { campaign: 7, question: "  ", userId: 1 }, { model: model as never })).rejects.toBeInstanceOf(QuestionError);
    await expect(askAgent(payload, { campaign: 7, question: "x".repeat(1001), userId: 1 }, { model: model as never })).rejects.toThrow(/1000 caractères/);
  });
});
