import { beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStore, reply, scripted, toolCall, unusedPort } from "./helpers/agent-memory";

import { tickRun } from "@/modules/ads/agent/engine";
import { dueKinds, missionOf, parisNow, periodKey } from "@/modules/ads/agent/followup";
import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import type { AgentDeps, SuiviPort } from "@/modules/ads/agent/types";
import { buildReport, totalsOf, trendPct, type MetricIn, type ObjectIn } from "@/modules/ads/lib/followup-report";

describe("quand passent les agents de suivi (heure de Paris)", () => {
  // Lundi 2 novembre 2026, premier lundi du mois ; mardi 3 ; lundi 9.
  const at = (iso: string) => parisNow(new Date(iso));

  it("lit l'heure, le jour de la semaine et du mois à Paris", () => {
    expect(at("2026-11-02T06:30:00Z")).toEqual({ date: "2026-11-02", hour: 7, weekday: 1, dayOfMonth: 2 });
    expect(at("2026-11-03T22:30:00Z").date).toBe("2026-11-03");
  });

  it("à 7 h hors lundi, le lundi à 8 h, le bilan du mois à la place du lundi", () => {
    expect(dueKinds(at("2026-11-03T05:00:00Z"), {})).toEqual([]); // 6 h : trop tôt
    expect(dueKinds(at("2026-11-03T06:30:00Z"), {})).toEqual(["quotidien"]);
    expect(dueKinds(at("2026-11-09T06:30:00Z"), {})).toEqual([]); // lundi 7 h : on attend 8 h
    expect(dueKinds(at("2026-11-09T07:30:00Z"), {})).toEqual(["hebdomadaire"]);
    expect(dueKinds(at("2026-11-02T07:30:00Z"), {})).toEqual([]); // premier lundi 8 h : on attend 9 h
    expect(dueKinds(at("2026-11-02T08:30:00Z"), {})).toEqual(["mensuel"]);
  });

  it("entre deux lundis, un passage tous les 2 jours au plus (décision du 29/10/2026)", () => {
    const wednesday = at("2026-11-04T10:00:00Z");
    expect(dueKinds(wednesday, {}, "2026-11-03")).toEqual([]); // la veille : trop tôt
    expect(dueKinds(wednesday, {}, "2026-11-02")).toEqual(["quotidien"]); // lundi : deux jours après
    expect(dueKinds(at("2026-11-03T10:00:00Z"), {}, "2026-11-02")).toEqual([]); // mardi, au lendemain du lundi
    expect(dueKinds(wednesday, {}, null)).toEqual(["quotidien"]); // jamais passé
    // Le lundi décide quand même, même la veille d'un passage.
    expect(dueKinds(at("2026-11-09T07:30:00Z"), {}, "2026-11-08")).toEqual(["hebdomadaire"]);
  });

  it("un seul passage par période", () => {
    const tuesday = at("2026-11-03T10:00:00Z");
    expect(dueKinds(tuesday, { quotidien: periodKey("quotidien", tuesday) })).toEqual([]);
    const monday = at("2026-11-09T10:00:00Z");
    expect(periodKey("hebdomadaire", at("2026-11-12T10:00:00Z"))).toBe("2026-11-09");
    expect(dueKinds(monday, { hebdomadaire: "2026-11-09" })).toEqual([]);
    expect(periodKey("mensuel", monday)).toBe("2026-11");
  });

  it("le matin, l'analyste n'agit pas ; le lundi, il décide", () => {
    expect(missionOf("quotidien", "X")).toMatch(/Tu n'agis pas/);
    expect(missionOf("hebdomadaire", "X")).toMatch(/DÉCIDE/);
    expect(ROLE_TOOLS.analyste).toEqual(expect.arrayContaining(["lire_resultats", "agir", "attendre", "noter_apprentissage", "terminer"]));
  });
});

const m = (over: Partial<MetricIn>): MetricIn => ({ level: "campaign", externalId: "C", day: "2026-10-29", spend: 0, impressions: 0, clicks: 0, linkClicks: 0, landingViews: 0, leads: 0, siteLeads: 0, qualifiedLeads: 0, won: 0, ...over });
const obj = (over: Partial<ObjectIn>): ObjectIn => ({ level: "ad", externalId: "A1", name: "C19", adsetExternalId: "S1", status: "ACTIVE", effectiveStatus: "ACTIVE", dailyBudget: null, issues: [], frequency7d: 1.5, reach7d: 1000, ...over });

describe("le rapport d'une campagne en ligne", () => {
  it("calcule l'entonnoir : taux de clic, arrivée sur la page, conversion de la page, coûts", () => {
    const t = totalsOf([m({ spend: 50, impressions: 10_000, linkClicks: 400, landingViews: 300, siteLeads: 6, qualifiedLeads: 2 })]);
    expect(t).toMatchObject({ tauxClicPct: 4, coutParClicEur: 0.13, arriveePct: 75, conversionPagePct: 2, coutParLeadEur: 8.33, coutParLeadQualifieEur: 25 });
    expect(totalsOf([m({ spend: 10 })]).coutParLeadEur).toBeNull();
    expect(trendPct(2, 4)).toBe(-50);
    expect(trendPct(2, null)).toBeNull();
  });

  it("compare à la période précédente et repère une pub qui s'use", () => {
    const days = (from: number, n: number, over: Partial<MetricIn>) => Array.from({ length: n }, (_, i) => m({ day: `2026-10-${String(from + i).padStart(2, "0")}`, ...over }));
    const metrics = [
      ...days(16, 7, { level: "ad", externalId: "A1", spend: 5, impressions: 1000, linkClicks: 50 }),
      ...days(23, 7, { level: "ad", externalId: "A1", spend: 5, impressions: 1000, linkClicks: 20 }),
      ...days(23, 7, { level: "campaign", externalId: "C", spend: 5, impressions: 1000, linkClicks: 20 }),
    ];
    const r = buildReport({
      campaign: { id: 7, name: "Test", externalId: "C", autonomy: "autonome", activatedAt: "2026-10-01T00:00:00Z", floorEur: 5, aiDailyEur: 1, objective: "trafic", optimisation: "vues-page", landingUrl: "https://tim-management.co/pointage" },
      today: "2026-10-29",
      days: 7,
      metrics,
      objects: [obj({ level: "adset", externalId: "S1", name: "BTP", adsetExternalId: null, dailyBudget: 9 }), obj({ frequency7d: 3.4 })],
      creatives: new Map([["A1", { id: 19, angle: "Pointage en 2 minutes", title: "Fini le papier", body: null, tests: [] }]]),
      changes: [],
      alerts: [],
      now: new Date("2026-10-29T12:00:00Z"),
    });
    expect(r.periode).toMatchObject({ du: "2026-10-23", au: "2026-10-29", precedente: { du: "2026-10-16", au: "2026-10-22" } });
    expect(r.campagne).toMatchObject({ budgetQuotidienMetaEur: 9, gelJusquAu: null, pageArrivee: "https://tim-management.co/pointage" });
    expect(r.publicites[0]).toMatchObject({ crea: { id: 19, angle: "Pointage en 2 minutes" }, tendanceTauxClicPct: -60, usee: true, partDepensePct: 100 });
  });
});

describe("un passage de suivi complet", () => {
  let mem: ReturnType<typeof memoryStore>;
  const budget = { assert: vi.fn(async () => {}), record: vi.fn(async () => {}) };
  const suivi = {
    report: vi.fn(async () => ({ totaux: { depenseEur: 53.9, vuesPage: 337, leadsSite: 0 } })),
    journal: vi.fn(async () => ({ decisions: [], alertes: [] })),
    act: vi.fn(async () => ({ decision: 9, outcome: "bloquer" as const, reasons: ["Gel des 7 premiers jours"], error: null, summary: "Mettre en pause la publicité « C17 »" })),
    learn: vi.fn(async () => 3),
    renew: vi.fn(async () => ({ run: 55, budgetEur: 3 })),
  } as unknown as SuiviPort & { act: ReturnType<typeof vi.fn>; learn: ReturnType<typeof vi.fn> };
  beforeEach(() => {
    mem = memoryStore();
    (suivi.act as ReturnType<typeof vi.fn>).mockClear();
  });
  const deps = (model: AgentDeps["model"]): AgentDeps => ({ store: mem.store, model, budget, atelier: unusedPort("atelier"), sources: unusedPort("sources"), suivi, now: () => new Date("2026-11-09T08:00:00Z") });

  const start = async (kind: "quotidien" | "hebdomadaire", mission: string) => {
    const run = mem.newRun(3);
    run.kind = kind;
    await mem.store.createAgent({ run: run.id, parent: null, depth: 0, role: "analyste", status: "en-cours", mission, tools: [...ROLE_TOOLS.analyste], model: "claude-opus-5-5", budgetEur: 3 });
    return run;
  };

  it("le lundi : lit, agit sous les garde-fous, note, et termine — le passage est « Terminé », pas « À valider »", async () => {
    const run = await start("hebdomadaire", "Passage du lundi");
    const { model } = scripted({
      "Passage du lundi": [
        reply("tool_use", toolCall("a", "lire_resultats", {}), toolCall("b", "lire_journal", {})),
        reply("tool_use", toolCall("c", "agir", { type: "pause", niveau: "ad", id: "120256556941130309", justification: "4 € dépensés sur 10 jours, 3 % de clic contre 6 %", appuis: [] })),
        reply("tool_use", toolCall("d", "noter_apprentissage", { phrase: "C19 obtient deux fois le taux de clic de C17", confiance: "moyenne" })),
        reply("tool_use", toolCall("e", "terminer", { resume: "337 vues, aucun lead : la page ne convertit pas." })),
      ],
    });
    const r = await tickRun(deps(model), run.id, new Date("2026-11-09T09:00:00Z"));
    expect(r.outcome).toBe("termine");
    expect(mem.runs.get(run.id)!.summary).toBe("337 vues, aucun lead : la page ne convertit pas.");
    expect(suivi.act).toHaveBeenCalledWith(77, { kind: "pause", level: "ad", externalId: "120256556941130309", toEur: undefined }, "4 € dépensés sur 10 jours, 3 % de clic contre 6 %", expect.objectContaining({ run: run.id }), expect.objectContaining({ citations: [] }));
    expect(mem.steps.map((s) => s.line)).toEqual(expect.arrayContaining([expect.stringMatching(/Mettre en pause la publicité « C17 » — bloquée \(Gel des 7/)]));
  });

  it("le matin : « agir » est refusé, même demandé", async () => {
    const run = await start("quotidien", "Passage du matin");
    const { model } = scripted({
      "Passage du matin": [
        reply("tool_use", toolCall("a", "agir", { type: "pause", niveau: "ad", id: "120256556941130309", justification: "x", appuis: [] })),
        reply("tool_use", toolCall("b", "attendre", { raison: "Sous le volume minimum", appuis: [] })),
        reply("tool_use", toolCall("c", "terminer", { resume: "RAS" })),
      ],
    });
    expect((await tickRun(deps(model), run.id, new Date("2026-11-09T09:00:00Z"))).outcome).toBe("termine");
    expect(suivi.act).not.toHaveBeenCalled();
    expect(mem.decisions).toEqual([expect.objectContaining({ kind: "attente", status: "executee", rationale: "Sous le volume minimum" })]);
  });

  it("un appui inventé est refusé", async () => {
    const run = await start("hebdomadaire", "Passage appui");
    const { model } = scripted({
      "Passage appui": [reply("tool_use", toolCall("a", "agir", { type: "pause", niveau: "ad", id: "120256556941130309", justification: "x", appuis: ["A999"] })), reply("tool_use", toolCall("b", "terminer", { resume: "ok" }))],
    });
    await tickRun(deps(model), run.id, new Date("2026-11-09T09:00:00Z"));
    expect(suivi.act).not.toHaveBeenCalled();
    expect(mem.steps.map((s) => s.line)).toEqual(expect.arrayContaining([expect.stringMatching(/Appui\(s\) inconnu\(s\) : A999/)]));
  });

  it("le lundi, fait préparer de nouvelles créas — et le journal le dit", async () => {
    const run = await start("hebdomadaire", "Passage renouvellement");
    const { model } = scripted({
      "Passage renouvellement": [
        reply("tool_use", toolCall("a", "demander_creas", { raison: "C19 porte 99 % de la dépense, rien pour la remplacer", angles: ["Le planning météo"], nombre: 2, appuis: [] })),
        reply("tool_use", toolCall("b", "terminer", { resume: "Deux créas demandées." })),
      ],
    });
    await tickRun(deps(model), run.id, new Date("2026-11-09T09:00:00Z"));
    expect(suivi.renew).toHaveBeenCalledWith(77, { reason: "C19 porte 99 % de la dépense, rien pour la remplacer", angles: ["Le planning météo"], count: 2 }, { run: run.id, agent: expect.anything() });
    expect(mem.decisions).toEqual([expect.objectContaining({ kind: "renouvellement", status: "executee", after: expect.objectContaining({ preparation: 55 }) })]);
  });
});

describe("un renouvellement ne touche pas à ce qui est publié", () => {
  it("plan de diffusion et répartition sont refusés dans une préparation sur campagne en ligne", async () => {
    const { TOOLS } = await import("@/modules/ads/agent/registry");
    const ctx = { run: { id: 1, campaign: 7, renewal: true }, agent: { role: "stratege" } } as never;
    for (const name of ["proposer_plan_diffusion", "repartir_budget"]) {
      const out = await TOOLS[name].run(ctx, {});
      expect(out).toMatchObject({ kind: "ok", isError: true, output: { refus: expect.stringMatching(/^Campagne en ligne/) } });
    }
  });
});
