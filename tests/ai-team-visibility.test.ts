import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/lib/spend", async (orig) => ({ ...(await orig<typeof import("@/modules/ads/lib/spend")>()), assertAdsBudget: vi.fn(async () => undefined), recordAdsUsage: vi.fn(async () => ({ id: 1 })) }));

import { readGemini, readOpenAi, readPerplexity } from "@/modules/ai-team/lib/ai-engines";
import { aggregate, DRAWS, parseVisibilityReport, QUESTIONS, readAnswer, runVisibilityTick, todoOf, type StoredAnswer } from "@/modules/ai-team/lib/ai-visibility";
import { assertAdsBudget, AdsBudgetError } from "@/modules/ads/lib/spend";

const brands = [
  { name: "Kalitics", host: "kalitics.com" },
  { name: "Alobees", host: "alobees.com" },
  { name: "Combo", host: "combohr.com" },
];

describe("Les réponses des IA, lues", () => {
  it("OpenAI : le texte, les citations url_citation, les recherches et le coût", () => {
    const a = readOpenAi(
      {
        output: [
          { type: "web_search_call", action: { type: "search", sources: [{ url: "https://lu.example/a" }] } },
          { type: "message", content: [{ type: "output_text", text: "Essayez TIM Management.", annotations: [{ type: "url_citation", url: "https://www.tim-management.co/pointage", title: "Pointage" }, { type: "url_citation", url: "http://non-https.example" }] }] },
        ],
        usage: { input_tokens: 10_000, output_tokens: 1000 },
      },
      "gpt-6-luna",
    );
    expect(a.text).toBe("Essayez TIM Management.");
    expect(a.sources).toEqual([{ url: "https://www.tim-management.co/pointage", title: "Pointage", host: "tim-management.co" }]);
    expect(a.searches).toBe(1);
    expect(a.usd).toBeCloseTo(0.001 + 0.0005 + 0.01, 6);
  });

  it("OpenAI sans citation : les sources consultées", () => {
    const a = readOpenAi({ output: [{ type: "web_search_call", action: { sources: [{ url: "https://lu.example/a" }] } }, { type: "message", content: [{ type: "output_text", text: "x", annotations: [] }] }] }, "gpt-6-luna");
    expect(a.sources.map((s) => s.host)).toEqual(["lu.example"]);
  });

  it("Perplexity : les search_results ; le coût rendu fait foi", () => {
    const a = readPerplexity(
      {
        output: [
          { type: "search_results", results: [{ id: 1, url: "https://www.kalitics.com/", title: "Kalitics" }] },
          { type: "message", content: [{ type: "output_text", text: "Kalitics [1]" }] },
        ],
        usage: { cost: { total_cost: 0.0042 }, tool_calls_details: { search_web: { invocation: 1 } } },
      },
      "openai/gpt-5.6-luna",
    );
    expect(a.text).toBe("Kalitics [1]");
    expect(a.sources[0].host).toBe("kalitics.com");
    expect(a.usd).toBe(0.0042);
  });

  it("Gemini : l'ancrage Google (renvoi + domaine en titre)", () => {
    const a = readGemini(
      {
        candidates: [{ content: { parts: [{ text: "Alobees " }, { text: "et TIM Management." }] }, groundingMetadata: { webSearchQueries: ["q"], groundingChunks: [{ web: { uri: "https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc", title: "alobees.com" } }] } }],
        usageMetadata: { promptTokenCount: 1000, candidatesTokenCount: 200 },
      },
      "gemini-3.5-flash-lite",
    );
    expect(a.text).toBe("Alobees et TIM Management.");
    expect(a.sources[0].host).toBe("alobees.com");
    expect(a.searches).toBe(1);
  });
});

describe("Ce qu'une réponse dit de TIM", () => {
  it("nommé, cité, rang par ordre d'apparition ; un concurrent compte aussi par son site en source", () => {
    const r = readAnswer(
      {
        text: "Les options : Kalitics, puis TIM-Management, très adapté au BTP. Combos de repas exclus.",
        sources: [
          { url: "https://tim-management.co/x", title: "", host: "tim-management.co" },
          { url: "https://alobees.com/y", title: "", host: "alobees.com" },
        ],
      },
      brands,
    );
    expect(r).toMatchObject({ mentioned: true, cited: true, position: 2, brands: ["Kalitics", "TIM Management", "Alobees"] });
  });

  it("pas nommé : pas de rang ; un mot qui contient le nom ne compte pas", () => {
    const r = readAnswer({ text: "Le timing compte. Combos et Kalitics-like.", sources: [] }, brands);
    expect(r.mentioned).toBe(false);
    expect(r.position).toBeNull();
    expect(r.brands).toEqual(["Kalitics"]);
  });
});

const ans = (over: Partial<StoredAnswer>): StoredAnswer => ({ engine: "claude", question: "cat-1", draw: 1, mentioned: false, cited: false, position: null, brands: [], sources: [], ...over });

describe("Le mois en chiffres", () => {
  it("taux, part de voix, questions perdues et gagnées, sources ; un doublon ne compte qu'une fois", () => {
    const v = aggregate(
      [
        ans({ question: "cat-1", mentioned: true, cited: true, position: 1, brands: ["TIM Management", "Kalitics"], sources: [{ url: "https://tim-management.co/", title: "", host: "tim-management.co" }] }),
        ans({ question: "cat-1", mentioned: true, cited: true, position: 1, brands: ["TIM Management", "Kalitics"] }),
        ans({ question: "poi-1", brands: ["Kalitics", "Alobees"], sources: [{ url: "https://kalitics.com/", title: "", host: "kalitics.com" }] }),
        ans({ question: "poi-1", engine: "chatgpt", brands: ["Kalitics"] }),
      ],
      brands,
    );
    expect(v.answers).toBe(3);
    expect(v.overall).toMatchObject({ mentionPct: 33.3, citationPct: 33.3, shareOfVoicePct: 20, avgPosition: 1 });
    expect(v.engines.map((e) => e.engine)).toEqual(["chatgpt", "claude"]);
    expect(v.competitors[0]).toMatchObject({ name: "Kalitics", answers: 3, mentionPct: 100 });
    expect(v.lost).toEqual([expect.objectContaining({ id: "poi-1", competitors: ["Kalitics", "Alobees"] })]);
    expect(v.won).toEqual([expect.objectContaining({ id: "cat-1", mentionPct: 100 })]);
    expect(v.sources).toEqual([
      { host: "tim-management.co", count: 1, tim: true, competitor: null },
      { host: "kalitics.com", count: 1, tim: false, competitor: "Kalitics" },
    ]);
  });

  it("ce qu'il reste : chaque question × tirage × IA, sauf ce qui est lu ou a échoué deux fois", () => {
    const rows = [
      { engine: "claude" as const, question: "cat-1", draw: 1, status: "fait" as const },
      { engine: "claude" as const, question: "cat-2", draw: 1, status: "echec" as const },
      { engine: "claude" as const, question: "cat-3", draw: 1, status: "echec" as const },
      { engine: "claude" as const, question: "cat-3", draw: 1, status: "echec" as const },
    ];
    const { total, todo } = todoOf(rows, ["claude", "gemini"]);
    expect(total).toBe(QUESTIONS.length * DRAWS * 2);
    expect(todo.length).toBe(total - 2);
    expect(todo.some((t) => t.engine === "claude" && t.question === "cat-2" && t.draw === 1)).toBe(true);
  });

  it("le panel : des identifiants uniques", () => {
    expect(new Set(QUESTIONS.map((q) => q.id)).size).toBe(QUESTIONS.length);
  });
});

describe("Le rapport de Georges, vérifié", () => {
  it("garde les actions avec un prompt, les fortes d'abord ; refuse une réponse sans balises", () => {
    const out = parseVisibilityReport(
      `<synthese>TIM absent des comparatifs.</synthese><actions>${JSON.stringify([
        { type: "source", titre: "Entrer sur Capterra", impact: "moyen", prompt: "Écris la fiche…", questions: ["q1"], minutes: 9999 },
        { type: "page", titre: "Comparatif pointage", impact: "fort", prompt: "Écris…" },
        { type: "inconnu", titre: "Sans prompt", prompt: "" },
      ])}</actions>`,
    )!;
    expect(out.findings.map((f) => f.title)).toEqual(["Comparatif pointage", "Entrer sur Capterra"]);
    expect(out.findings[1]).toMatchObject({ type: "source", minutes: 480, questions: ["q1"] });
    expect(parseVisibilityReport("rien")).toBeNull();
  });
});

describe("Un lot de mesure", () => {
  const env = { ...process.env };
  let created: Record<string, unknown>[];
  const payload = (active = true) =>
    ({
      find: vi.fn(async ({ collection }: { collection: string }) => {
        if (collection === "ai-team-members") return { docs: [{ id: 7, name: "Georges", active }] };
        if (collection === "ad-competitors") return { docs: [{ id: 1, name: "Kalitics", website: "https://www.kalitics.com" }] };
        return { docs: created };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => (created.push(data), data)),
    }) as never;
  beforeEach(() => {
    created = [];
    process.env = { ...env, ANTHROPIC_API_KEY: "", OPENAI_API_KEY: "", PERPLEXITY_API_KEY: "", GEMINI_API_KEY: "k" };
  });
  afterEach(() => {
    process.env = env;
    vi.mocked(assertAdsBudget).mockReset();
  });

  it("pose les questions à l'IA branchée et garde chaque lecture", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: "Kalitics ou TIM Management." }] } }], usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 10 } }), { status: 200 }));
    const r = await runVisibilityTick(payload(), { force: true, fetcher: fetcher as never });
    expect(r).toMatchObject({ status: "complet", measured: QUESTIONS.length * DRAWS, left: 0 });
    expect(created[0]).toMatchObject({ member: 7, engine: "gemini", status: "fait", mentioned: true, position: 2, brands: ["Kalitics", "TIM Management"] });
  });

  it("une erreur de l'IA est gardée comme échec ; le plafond arrête le lot", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ error: { message: "nope" } }), { status: 403 }));
    vi.mocked(assertAdsBudget).mockResolvedValueOnce(undefined as never).mockRejectedValue(new AdsBudgetError("Plafond atteint."));
    const r = await runVisibilityTick(payload(), { force: true, fetcher: fetcher as never });
    expect(r.status).toBe("budget");
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ status: "echec", error: "Gemini : clé refusée — nope." });
  });

  it("en pause, ou sans IA branchée : rien ne part", async () => {
    expect((await runVisibilityTick(payload(false), { force: true })).status).toBe("pause");
    process.env.GEMINI_API_KEY = "";
    expect(await runVisibilityTick(payload(), { force: true })).toMatchObject({ status: "pause", message: "Aucune IA branchée (clés manquantes)." });
  });
});
