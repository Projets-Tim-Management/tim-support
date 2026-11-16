import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/lib/spend", async (orig) => ({
  ...(await orig<typeof import("@/modules/ads/lib/spend")>()),
  assertAdsBudget: vi.fn(async () => {}),
  recordAdsUsage: vi.fn(async () => {}),
  spentOf: vi.fn(async () => ({ day: 0, month: 4.2 })),
}));

import { AdsBudgetError, assertAdsBudget } from "@/modules/ads/lib/spend";
import { isToJudge, recoToRequest, runWeeklyReview, type ReviewOutput } from "@/modules/ai-team/lib/review";

/**
 * La revue du lundi de Margaux : le lundi après 10 h, une fois par semaine,
 * après les passages du lundi ; des recommandations vérifiées dans « Vos
 * demandes » ; la synthèse dans la conversation.
 */
const MONDAY_11H = new Date("2026-11-16T10:00:00Z"); // lundi, 11 h à Paris
const TUESDAY = new Date("2026-11-17T10:00:00Z");

function fakePayload(over: { active?: boolean; busy?: number; done?: number; past?: Record<string, unknown>[] } = {}) {
  const created: { collection: string; data: Record<string, unknown> }[] = [];
  const updated: Record<string, unknown>[] = [];
  let id = 1;
  const payload = {
    find: vi.fn(async ({ collection }: { collection: string }) => {
      if (collection === "ai-team-requests") return { docs: over.past ?? [] };
      if (collection === "ai-team-members") return { docs: [{ id: 1, name: "Margaux", active: over.active ?? true }] };
      // Une revue déjà faite cette semaine (`done`) : un message qui porte la marque de la revue.
      if (collection === "ai-team-messages") return { docs: [...Array.from({ length: over.done ?? 0 }, (_, i) => ({ id: 50 + i, from: "agent", text: "📅 Revue du lundi" })), ...created.filter((c) => c.collection === "ai-team-messages").map((c, i) => ({ id: i + 100, ...c.data }))] };
      return { docs: [] };
    }),
    count: vi.fn(async ({ collection, where }: { collection: string; where: unknown }) => {
      if (collection === "ad-agent-runs") return { totalDocs: over.busy ?? 0 };
      if (collection === "ai-team-messages") return { totalDocs: over.done ?? 0 };
      return { totalDocs: JSON.stringify(where).includes("title") ? 0 : 0 };
    }),
    create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
      created.push({ collection, data });
      return { id: collection === "ai-team-messages" ? 100 : id++, ...data };
    }),
    update: vi.fn(async ({ collection, id: target, data }: { collection: string; id: unknown; data: Record<string, unknown> }) => (updated.push({ ...data, _collection: collection, _id: target }), data)),
    delete: vi.fn(async () => ({})),
    logger: { warn: vi.fn(), error: vi.fn(), info: vi.fn() },
  };
  return { payload: payload as never, created, updated };
}

const output: ReviewOutput = {
  synthese: "Google Ads qualifie 4 leads sur 10 pour un coût par lead qualifié deux fois plus bas que ChatGPT Ads.",
  recommandations: [
    { type: "question", canal: "tous", titre: "Déplacer 15 % de ChatGPT Ads vers Google Ads ?", pourquoi: "120 € par lead qualifié contre 260 €.", lien: "", etapes: [], question: "Je vous propose de passer 15 % du budget ChatGPT Ads vers Google Ads cette semaine : d'accord ?" },
    { type: "a-faire", canal: "google", titre: "Ajouter les mots-clés négatifs « gratuit »", pourquoi: "11 clics sans démo sur « logiciel gratuit ».", lien: "https://ads.google.com/aw/keywords/negative", etapes: ["Ouvrez les mots-clés négatifs", "Ajoutez « gratuit »"], question: "" },
    { type: "a-faire", canal: "meta", titre: "Lien dangereux", pourquoi: "x", lien: "https://evil.example.com", etapes: ["Ouvrez"], question: "" },
  ],
};
const model = () => vi.fn(async () => ({ output, usage: { input: 5000, output: 800, cacheRead: 0, cacheWrite: 0 }, stopReason: "end_turn" }));
const scorecard = async () => ({ window: { months: 3, from: "2026-09-01", previousFrom: "2026-06-01" }, rows: [], best: null, headlines: [], budgets: [], caveats: [] });

beforeEach(() => vi.mocked(assertAdsBudget).mockReset().mockResolvedValue(undefined as never));

describe("quand la revue part", () => {
  it("pas avant le lundi 10 h, pas deux fois, pas pendant les passages du lundi, pas si Margaux est en pause", async () => {
    expect((await runWeeklyReview(fakePayload().payload, { now: TUESDAY, model: model(), scorecard })).status).toBe("pas-encore");
    expect((await runWeeklyReview(fakePayload({ done: 1 }).payload, { now: MONDAY_11H, model: model(), scorecard })).status).toBe("deja-faite");
    expect((await runWeeklyReview(fakePayload({ busy: 1 }).payload, { now: MONDAY_11H, model: model(), scorecard })).status).toBe("pas-encore");
    expect((await runWeeklyReview(fakePayload({ active: false }).payload, { now: MONDAY_11H, model: model(), scorecard })).status).toBe("pause");
  });

  it("à la demande de la direction, même un mardi", async () => {
    expect((await runWeeklyReview(fakePayload().payload, { now: TUESDAY, force: true, model: model(), scorecard })).status).toBe("faite");
  });
});

describe("ce que la revue produit", () => {
  it("dépose les recommandations dans « Vos demandes » et la synthèse dans la conversation", async () => {
    const { payload, created, updated } = fakePayload();
    const r = await runWeeklyReview(payload, { now: MONDAY_11H, model: model(), scorecard });
    expect(r).toEqual({ status: "faite", created: 3, judged: 0 });
    const requests = created.filter((c) => c.collection === "ai-team-requests").map((c) => c.data);
    // Chaque recommandation est suivie : son origine, son canal, et les chiffres du moment (l'« avant »).
    expect(requests[1]).toMatchObject({ origin: "revue", channel: "google", baseline: { fiche: [] } });
    expect(requests.map((x) => x.kind)).toEqual(["question", "a-faire", "a-faire"]);
    expect(requests[1]).toMatchObject({ url: "https://ads.google.com/aw/keywords/negative", why: "Google Ads — 11 clics sans démo sur « logiciel gratuit »." });
    // Un lien hors liste ne passe pas : la recommandation part sans lien.
    expect(requests[2].url).toBeNull();
    const last = String(updated.at(-1)!.text);
    expect(last).toMatch(/^📅 Revue du lundi — semaine du 16 novembre/);
    expect(last).toContain("Google Ads qualifie 4 leads sur 10");
    expect(last).toContain("3 recommandations vous attendent dans « Vos demandes »");
  });

  it("dit pourquoi elle n'a pas pu se faire quand le budget IA est atteint", async () => {
    vi.mocked(assertAdsBudget).mockRejectedValueOnce(new AdsBudgetError("Budget IA du mois de l'équipe de Margaux atteint"));
    const { payload, updated } = fakePayload();
    const r = await runWeeklyReview(payload, { now: MONDAY_11H, model: model(), scorecard });
    expect(r.status).toBe("echec");
    expect(String(updated.at(-1)!.text)).toMatch(/je n'ai pas pu faire ma revue \(Budget IA du mois/);
  });
});

describe("Margaux juge ses recommandations passées", () => {
  const DAY = 86_400_000;
  const past = (over: Record<string, unknown>) => ({ id: 41, title: "Exclure « gratuit »", channel: "google", status: "faite", closedAt: new Date(MONDAY_11H.getTime() - 20 * DAY).toISOString(), createdAt: "2026-10-20T10:00:00Z", baseline: { fiche: [] }, ...over });

  it("à juger : appliquée ou répondue depuis 14 jours, sans verdict", () => {
    expect(isToJudge(past({}), MONDAY_11H)).toBe(true);
    expect(isToJudge(past({ closedAt: new Date(MONDAY_11H.getTime() - 5 * DAY).toISOString() }), MONDAY_11H)).toBe(false);
    expect(isToJudge(past({ status: "ouverte", closedAt: null }), MONDAY_11H)).toBe(false);
    expect(isToJudge(past({ status: "retiree" }), MONDAY_11H)).toBe(false);
    expect(isToJudge(past({ outcome: "a-marche" }), MONDAY_11H)).toBe(false);
  });

  it("écrit le verdict d'une recommandation à juger, jamais « trop tôt », jamais sur une autre", async () => {
    const { payload, updated } = fakePayload({ past: [past({}), past({ id: 42, closedAt: new Date(MONDAY_11H.getTime() - 3 * DAY).toISOString() }), past({ id: 43 })] });
    const judging = vi.fn(async () => ({
      output: {
        ...output,
        recommandations: [],
        verdicts: [
          { id: "41", resultat: "a-marche" as const, lecon: "Le coût du clic a baissé de 18 % : exclure les recherches « gratuit » paie chez TIM." },
          { id: "42", resultat: "a-empire" as const, lecon: "Trop récent, ne doit pas être écrit." },
          { id: "43", resultat: "trop-tot" as const, lecon: "Trois leads : on rejugera." },
        ],
      },
      usage: { input: 5000, output: 800, cacheRead: 0, cacheWrite: 0 },
      stopReason: "end_turn",
    }));
    const r = await runWeeklyReview(payload, { now: MONDAY_11H, model: judging, scorecard });
    expect(r).toMatchObject({ status: "faite", judged: 1 });
    const verdicts = updated.filter((u) => u._collection === "ai-team-requests");
    expect(verdicts).toHaveLength(1);
    expect(verdicts[0]).toMatchObject({ _id: "41", outcome: "a-marche" });
    expect(String(updated.at(-1)!.text)).toContain("1 recommandation passée jugée sur ses résultats");
  });
});

describe("une recommandation devient une demande vérifiée", () => {
  it("préfixe le canal, garde un lien sûr, écarte une recommandation incomplète", () => {
    expect(recoToRequest(output.recommandations[0])).toMatchObject({ kind: "question", why: "Tous canaux — 120 € par lead qualifié contre 260 €." });
    expect(recoToRequest({ ...output.recommandations[1], etapes: [] })).toBeNull();
  });
});
