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
const { campaignRecap, recapDue } = await import("@/modules/ads/lib/weekly-recap");

describe("le récapitulatif du lundi", () => {
  const base = {
    id: 7,
    name: "Campagne test",
    totals: { depenseEur: 55.47, vuesPage: 347, leadsSite: 0, leadsQualifies: 0, coutParLeadEur: null, tauxClicPct: 4.44 },
    trends: { depensePct: 107, leadsPct: null },
    summary: "337 vues, aucun lead : la page ne convertit pas.",
    actions: [{ summary: "Mettre en pause la publicité « C17 »", status: "executee" }, { summary: "Budget de l'ensemble « BTP » : 9 € → 10,80 €", status: "proposee" }],
    proposed: 1,
    toValidate: 2,
    alerts: [{ kind: "clics-sans-lead", detail: "347 personnes…" }],
    test: null,
    prospects: { id: 12 },
  };

  it("dit les chiffres, ce que l'analyste a fait, et ce qui attend Charlie", () => {
    const r = campaignRecap(base);
    expect(r.lines[0]).toBe("Semaine : 55,47 € (+107 %), 347 vues de la page, 0 lead(s), dont 0 qualifié(s) ; coût par lead —, taux de clic 4,44 %.");
    expect(r.lines).toEqual(expect.arrayContaining(["L'analyste : 337 vues, aucun lead : la page ne convertit pas.", "• Mettre en pause la publicité « C17 » — fait", "• Budget de l'ensemble « BTP » : 9 € → 10,80 € — à valider", "⚠ Des visites, aucun lead : 347 personnes…"]));
    expect(r.waiting).toEqual(["1 action(s) de l'agent à valider", "2 créa(s) à valider (visuels à faire dans Claude Design)", "la campagne Prospects n° 12 à publier"]);
  });

  it("part le lundi dès 10 h une fois le passage du lundi fini, à midi au plus tard", () => {
    // Lundi 9 novembre 2026, heure de Paris (UTC+1).
    expect(recapDue(new Date("2026-11-09T08:30:00Z"), false)).toBe(false); // 9 h 30
    expect(recapDue(new Date("2026-11-09T09:30:00Z"), false)).toBe(true); // 10 h 30, lundi fini
    expect(recapDue(new Date("2026-11-09T09:30:00Z"), true)).toBe(false); // encore en cours
    expect(recapDue(new Date("2026-11-09T11:05:00Z"), true)).toBe(true); // midi : on n'attend plus
    expect(recapDue(new Date("2026-11-10T09:30:00Z"), false)).toBe(false); // mardi
  });
});

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
