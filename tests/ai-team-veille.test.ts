import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/lib/spend", () => ({ assertAdsBudget: vi.fn(async () => undefined), recordAdsUsage: vi.fn(async () => ({ id: 1 })) }));
vi.mock("@/modules/analytics/lib/google-ads", () => ({ loadGoogleAds: vi.fn(async () => ({ status: "missing", missing: [] })) }));
vi.mock("@/modules/analytics/lib/openai-ads", () => ({ loadOpenAiAds: vi.fn(async () => ({ status: "missing", missing: [] })) }));

import { assertAdsBudget, recordAdsUsage } from "@/modules/ads/lib/spend";
import { parseVeille, runDueVeille, runVeille, sourcesOf, type VeilleCall } from "@/modules/ai-team/lib/veille";

const METHOD = `## Mes principes\n- Juger au lead qualifié.\n${"Détail. ".repeat(40)}\n## Ce qui marche chez TIM\n- Rien de prouvé encore.`;
const ANSWER = `Voici.\n<methode>${METHOD}</methode>\n<changements>- Première version.</changements>\n<idees>[{"titre":"Tester l'exclusion des concurrents","pourquoi":"30 % des clics B2B","source":"https://exemple.fr/etude","test":"4 semaines, coût par lead qualifié"},{"titre":"Lien piégé","pourquoi":"x","source":"javascript:alert(1)","test":"y"}]</idees>`;

describe("Veille : la réponse découpée et vérifiée", () => {
  it("garde la méthode, les changements et au plus 3 idées aux sources https", () => {
    const out = parseVeille(ANSWER)!;
    expect(out.method).toContain("## Mes principes");
    expect(out.changes).toBe("- Première version.");
    expect(out.ideas).toHaveLength(2);
    expect(out.ideas[0].source).toBe("https://exemple.fr/etude");
    expect(out.ideas[1].source).toBe("");
  });

  it("refuse une réponse sans méthode, et survit à des idées illisibles", () => {
    expect(parseVeille("pas de balise")).toBeNull();
    expect(parseVeille(`<methode>${METHOD}</methode><idees>pas du json</idees>`)!.ideas).toEqual([]);
  });

  it("prend les sources citées, sinon celles lues", () => {
    const search = { type: "web_search_tool_result", content: [{ type: "web_search_result", url: "https://lue.fr/a", title: "Lue" }] };
    const cited = { type: "text", text: "x", citations: [{ type: "web_search_result_location", url: "https://citee.fr/b", title: "Citée" }] };
    expect(sourcesOf([[search, cited]] as never)).toEqual([{ url: "https://citee.fr/b", title: "Citée" }]);
    expect(sourcesOf([[search, { type: "text", text: "x", citations: null }]] as never)).toEqual([{ url: "https://lue.fr/a", title: "Lue" }]);
  });
});

/** Une base en mémoire, juste ce que la veille touche. */
function fakePayload(opts: { active?: boolean } = {}) {
  const methods: Record<string, unknown>[] = [];
  const members = [
    { id: 1, key: "chef-sea", name: "Mark", active: true },
    { id: 2, key: "sea-google", name: "Thomas", active: opts.active ?? true },
    { id: 3, key: "sea-chatgpt", name: "Sarah", active: true },
    { id: 4, key: "sea-meta", name: "Camille", active: true },
  ];
  type W = { and?: W[]; key?: { equals?: string; in?: string[] }; member?: { equals?: number; in?: (number | string)[] }; status?: { equals: string }; week?: { equals: string }; trigger?: { equals: string } };
  const match = (d: Record<string, unknown>, w: W): boolean =>
    (w.and ?? []).every((x) => match(d, x)) &&
    (!w.member || (w.member.in ? w.member.in.map(String).includes(String(d.member)) : d.member === w.member.equals)) &&
    (!w.status || d.status === w.status.equals) &&
    (!w.week || d.week === w.week.equals) &&
    (!w.trigger || d.trigger === w.trigger.equals);
  return {
    methods,
    find: async ({ collection, where }: { collection: string; where?: W }) => {
      if (collection === "ai-team-members") {
        const k = where?.key;
        return { docs: members.filter((m) => (k?.equals ? m.key === k.equals : k?.in ? k.in.includes(m.key) : true)) };
      }
      if (collection === "ai-team-methods") {
        const docs = methods.filter((d) => match(d, where ?? {})).reverse();
        return { docs, totalDocs: docs.length };
      }
      return { docs: [] };
    },
    count: async ({ collection, where }: { collection: string; where: W }) => ({ totalDocs: collection === "ai-team-methods" ? methods.filter((d) => match(d, { ...where, and: (where.and ?? []).filter((x) => !("createdAt" in x)) })).length : 0 }),
    create: async ({ data }: { data: Record<string, unknown> }) => {
      const d = { id: methods.length + 1, createdAt: new Date().toISOString(), ...data };
      methods.push(d);
      return d;
    },
    update: async ({ id, data }: { id: number; data: Record<string, unknown> }) => Object.assign(methods.find((d) => d.id === id)!, data),
  };
}

const usage = { input: 20_000, output: 3_000, cacheRead: 0, cacheWrite: 0 };
const card = async () => ({ window: { months: 3, from: "2026-09-01" }, rows: [], caveats: [], headlines: [], budgets: [] }) as never;

describe("Veille : un passage", () => {
  beforeEach(() => {
    vi.mocked(assertAdsBudget).mockClear();
    vi.mocked(recordAdsUsage).mockClear();
  });

  it("reprend un tour mis en pause, écrit la méthode et compte tokens + recherches", async () => {
    const payload = fakePayload();
    const calls: number[] = [];
    const model: VeilleCall = async ({ messages }) => {
      calls.push(messages.length);
      return calls.length === 1
        ? { content: [{ type: "server_tool_use" }] as never, usage, searches: 5, stopReason: "pause_turn" }
        : { content: [{ type: "text", text: ANSWER, citations: [{ type: "web_search_result_location", url: "https://exemple.fr/etude", title: "Étude" }] }] as never, usage, searches: 3, stopReason: "end_turn" };
    };
    const r = await runVeille(payload as never, "sea-google", { model, scorecard: card, trigger: "direction" });
    expect(r.status).toBe("faite");
    expect(calls).toEqual([1, 2]); // le second appel renvoie le tour en pause
    expect(assertAdsBudget).toHaveBeenCalledTimes(2);
    const usd = vi.mocked(recordAdsUsage).mock.calls[0][1].usd;
    // 2 × (20 000 × 2 $ + 3 000 × 10 $) / 1 M = 0,14 $, + 8 recherches × 0,01 $ = 0,22 $
    expect(usd).toBeCloseTo(0.22, 5);
    const doc = payload.methods[0];
    expect(doc).toMatchObject({ status: "faite", searches: 8, trigger: "direction", sources: [{ url: "https://exemple.fr/etude", title: "Étude" }] });
  });

  it("refuse un agent en pause, et marque l'échec quand le budget bloque", async () => {
    expect((await runVeille(fakePayload({ active: false }) as never, "sea-google", { scorecard: card })).status).toBe("pause");
    vi.mocked(assertAdsBudget).mockRejectedValueOnce(new Error("Budget IA du mois atteint"));
    const payload = fakePayload();
    const r = await runVeille(payload as never, "sea-google", { scorecard: card, model: async () => ({ content: [], usage, searches: 0, stopReason: "end_turn" }) });
    expect(r.status).toBe("echec");
    expect(payload.methods[0]).toMatchObject({ status: "echec", error: "Budget IA du mois atteint" });
    expect(recordAdsUsage).not.toHaveBeenCalled();
  });

  it("le dimanche soir seulement, un agent par appel, dans l'ordre", async () => {
    const payload = fakePayload();
    const model: VeilleCall = async () => ({ content: [{ type: "text", text: ANSWER }] as never, usage, searches: 1, stopReason: "end_turn" });
    expect((await runDueVeille(payload as never, new Date("2026-11-15T17:00:00Z"), model)).status).toBe("pas-encore"); // dimanche 18 h
    const sunday = new Date("2026-11-15T19:30:00Z"); // dimanche 20 h 30 à Paris
    expect((await runDueVeille(payload as never, sunday, model)).member).toBe("Thomas");
    expect((await runDueVeille(payload as never, sunday, model)).member).toBe("Sarah");
    expect((await runDueVeille(payload as never, sunday, model)).member).toBe("Camille");
    expect((await runDueVeille(payload as never, sunday, model)).member).toBe("Mark");
    expect((await runDueVeille(payload as never, sunday, model)).status).toBe("deja-faite");
  });
});
