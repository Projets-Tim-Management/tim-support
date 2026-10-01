import { beforeEach, describe, expect, it, vi } from "vitest";

import { ledgerOf, tickRun } from "@/modules/ads/agent/engine";
import { MAX_REJECTIONS } from "@/modules/ads/agent/limits";
import { TOOLS } from "@/modules/ads/agent/registry";
import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import type { ToolContext } from "@/modules/ads/agent/tools";
import type { AgentDeps, AgentRow, AtelierPort, CreativeView, Id, RunRow, StepRow } from "@/modules/ads/agent/types";

import { memoryStore, reply, scripted, toolCall, unusedPort } from "./helpers/agent-memory";

/**
 * Les outils de l'agent qui passent par l'atelier (plan, §9 quater, commit 4) :
 * ce qu'ils demandent à l'atelier, ce qu'ils journalisent, ce qu'ils refusent.
 */

const crea = (id: Id, over: Partial<CreativeView> = {}): CreativeView => ({
  id,
  angle: `Angle ${id}`,
  requestedAngle: `Demandé ${id}`,
  status: "brouillon",
  publishable: true,
  visuals: 0,
  texts: [{ kind: "principal", text: "…", status: "ok", reason: null }],
  ...over,
});

function fakeAtelier(over: Partial<AtelierPort> = {}) {
  const atelier = {
    brief: vi.fn(async () => ({ resume: "Brief", quotaRestant: 4, gabarits: [{ cle: "texte", libelle: "Texte", disponible: true }] })),
    generate: vi.fn(async (_c: Id, req: Parameters<AtelierPort["generate"]>[1]) => {
      await req.preCheck(0.3);
      return { creatives: req.angles.map((a, i) => crea(100 + i, { requestedAngle: a })), costEur: 0.12 };
    }),
    render: vi.fn(async () => ({ template: "texte", visuals: 3 })),
    creatives: vi.fn(async (_campaign: Id, ids: Id[]) => ids.map((i) => crea(i))),
    submit: vi.fn(async (_campaign: Id, ids: Id[]) => ({ submitted: ids.filter((i) => i !== 999), skipped: ids.includes(999) ? [{ id: 999, reason: "Pas de titre passé." }] : [] })),
    campaignBudget: vi.fn(async () => ({ totalDailyEur: 30, maxAiSharePct: 15, metaFloorEur: 5 })),
    setSplit: vi.fn(async () => {}),
    ...over,
  };
  return atelier;
}

let mem: ReturnType<typeof memoryStore>;
const budget = { assert: vi.fn(async () => {}), record: vi.fn(async () => {}) };
const NOW = new Date("2026-10-05T08:00:00Z");

beforeEach(() => {
  mem = memoryStore();
  budget.assert.mockReset().mockResolvedValue(undefined);
  budget.record.mockReset().mockResolvedValue(undefined);
});

/** Un agent d'un rôle donné, prêt à utiliser un outil, dans un passage. */
async function setup(role: AgentRow["role"], atelier: ReturnType<typeof fakeAtelier>, budgetEur = 2) {
  const run: RunRow = mem.newRun();
  const root = await mem.newRoot(run);
  const agent =
    role === "orchestrateur"
      ? root
      : await mem.store.createAgent({ run: run.id, parent: root.id, depth: 1, role, status: "en-cours", mission: "M", tools: [...ROLE_TOOLS[role]], model: "claude-sonnet-5-5", budgetEur });
  const step = await mem.store.createStep({ run: run.id, agent: agent.id, seq: 0, kind: "outil", tool: "x", status: "en-cours", line: "", input: null, output: null, idempotencyKey: `${agent.id}:t`, startedAt: NOW.toISOString() });
  const deps: AgentDeps = { store: mem.store, model: vi.fn(), budget, atelier, sources: unusedPort("sources"), now: () => NOW };
  const agents = await mem.store.listAgents(run.id);
  const ctx: ToolContext = { deps, run, agent: agents.find((a) => a.id === agent.id)!, agents, step: step as StepRow, ledger: (a) => ledgerOf(a, agents) };
  return { ctx, run, agent };
}
const use = (ctx: ToolContext, name: string, input: Record<string, unknown>) => TOOLS[name].run(ctx, input);

describe("chaque rôle a ses outils, et chaque outil existe", () => {
  it("tous les outils des rôles sont au registre", () => {
    for (const tools of Object.values(ROLE_TOOLS)) for (const t of tools) expect(TOOLS[t], t).toBeDefined();
  });

  it("l'orchestrateur ne produit rien lui-même : ni textes, ni visuels, ni jugement", () => {
    for (const t of ["generer_textes", "rendre_visuels", "juger_crea"]) expect(ROLE_TOOLS.orchestrateur).not.toContain(t);
    expect(ROLE_TOOLS.orchestrateur).toContain("deposer_a_valider");
  });
});

describe("generer_textes — l'atelier écrit, l'agent paie", () => {
  it("transmet les angles, le passage et l'agent ; le coût revient sur l'étape", async () => {
    const atelier = fakeAtelier();
    const { ctx, run, agent } = await setup("redacteur", atelier);
    const r = await use(ctx, "generer_textes", { angles: ["Temps perdu", "Zéro papier"], test_de_ton: true });
    expect(atelier.generate).toHaveBeenCalledWith(run.campaign, expect.objectContaining({ run: run.id, agent: agent.id, angles: ["Temps perdu", "Zéro papier"], toneTest: true }));
    expect(r).toMatchObject({ kind: "ok", costEur: 0.12 });
    expect(r.kind === "ok" && r.line).toMatch(/fait écrire 2 créa\(s\) \(0,12 €\)/);
  });

  it("le budget de l'agent passe AVANT l'appel : sans budget, rien n'est écrit", async () => {
    const atelier = fakeAtelier();
    const { ctx } = await setup("redacteur", atelier, 0.1); // l'atelier annonce un coût maximal de 0,30 €
    const r = await use(ctx, "generer_textes", { angles: ["Temps perdu"] });
    expect(r).toMatchObject({ kind: "ok", isError: true, output: { refus: expect.stringMatching(/jusqu'à 0,30 €/) } });
    expect(budget.assert).not.toHaveBeenCalled();
  });

  it("le plafond global des agents s'applique aussi", async () => {
    const atelier = fakeAtelier();
    budget.assert.mockRejectedValue(new Error("Plafond du jour : 15,00 € dépensés sur 15,00 €"));
    const { ctx } = await setup("redacteur", atelier);
    const r = await use(ctx, "generer_textes", { angles: ["Temps perdu"] });
    expect(r).toMatchObject({ isError: true, output: { refus: expect.stringMatching(/Plafond du jour/) } });
  });

  it("dans un vrai passage, ce que l'atelier a coûté entre dans la dépense de l'agent (une seule fois)", async () => {
    const atelier = fakeAtelier();
    const run = mem.newRun();
    const root = await mem.newRoot(run);
    await mem.store.createAgent({ run: run.id, parent: root.id, depth: 1, role: "redacteur", status: "en-cours", mission: "Rédiger", tools: [...ROLE_TOOLS.redacteur], model: "claude-sonnet-5-5", budgetEur: 1 });
    const wait = toolCall("w", "attendre_sous_agents", {});
    await mem.store.createStep({ run: run.id, agent: root.id, seq: 0, kind: "modele", tool: null, status: "fait", line: "", input: null, output: { content: [wait], stopReason: "tool_use" }, idempotencyKey: `${root.id}:0`, startedAt: NOW.toISOString() });
    const { model } = scripted({
      Rédiger: [reply("tool_use", toolCall("g", "generer_textes", { angles: ["Temps perdu"] })), reply("tool_use", toolCall("t", "terminer", { resume: "ok" }))],
      "Préparer la campagne": [reply("tool_use", toolCall("d", "deposer_a_valider", { creas: [100], resume: "Prêt" }))],
    });
    await tickRun({ store: mem.store, model, budget, atelier, sources: unusedPort("sources"), now: () => NOW }, run.id, new Date("2026-10-05T09:00:00Z"));
    const redacteur = mem.agents.find((a) => a.role === "redacteur")!;
    const modelCost = mem.steps.filter((s) => s.agent === redacteur.id && s.kind === "modele").reduce((n, s) => n + s.costEur, 0);
    expect(redacteur.spentEur).toBeCloseTo(modelCost + 0.12, 6);
    // La dépense de l'atelier est inscrite par l'atelier (une ligne, rattachée au passage) — pas une seconde fois par le moteur.
    expect(budget.record.mock.calls.every((c) => (c as unknown as [{ detail: string }])[0].detail.includes("tour"))).toBe(true);
  });
});

describe("juger_crea — le contrôleur, et la limite de réécriture", () => {
  it(`rejette avec motif, compte par angle, et arrête la réécriture à ${MAX_REJECTIONS}`, async () => {
    const atelier = fakeAtelier({ creatives: vi.fn(async (_campaign: Id, ids: Id[]) => ids.map((i) => crea(i, { requestedAngle: "Temps perdu" }))) });
    const { ctx } = await setup("controleur", atelier);
    const first = await use(ctx, "juger_crea", { crea: 1, verdict: "rejete", motif: "Promesse invérifiable" });
    expect(first).toMatchObject({ output: { rejete: true, rejet: 1 } });
    const second = await use(ctx, "juger_crea", { crea: 2, verdict: "rejete", motif: "Faux témoignage" });
    expect(second).toMatchObject({ output: { limiteAtteinte: true, consigne: expect.stringMatching(/Ne pas réécrire/) } });
    expect(mem.decisions.filter((d) => d.kind === "rejet-controleur").map((d) => d.rationale)).toEqual(["Promesse invérifiable", "Faux témoignage"]);
  });

  it("un rejet sans motif est refusé ; une acceptation ne journalise rien", async () => {
    const { ctx } = await setup("controleur", fakeAtelier());
    expect(await use(ctx, "juger_crea", { crea: 1, verdict: "rejete", motif: " " })).toMatchObject({ isError: true });
    expect(await use(ctx, "juger_crea", { crea: 1, verdict: "accepte", motif: "Conforme" })).toMatchObject({ output: { accepte: true } });
    expect(mem.decisions).toHaveLength(0);
  });
});

describe("proposer_audiences — décision 7 du 29/09/2026", () => {
  it("un test ciblage détaillé contre Advantage+ sans ses chiffres est refusé et journalisé « bloquée »", async () => {
    const { ctx } = await setup("stratege", fakeAtelier());
    const r = await use(ctx, "proposer_audiences", { mode: "test-detaille-vs-advantage-plus", budget_meta_quotidien_eur: 20, ensembles: 2, justification: "…" });
    expect(r).toMatchObject({ isError: true });
    expect(mem.decisions[0]).toMatchObject({ kind: "audience", status: "bloquee", guardrail: expect.stringMatching(/CPL cible.*conversions.*ciblage détaillé/) });
  });

  it("avec ses chiffres, le test est proposé (rien n'est envoyé à Meta)", async () => {
    const { ctx } = await setup("stratege", fakeAtelier());
    await use(ctx, "proposer_audiences", {
      mode: "test-detaille-vs-advantage-plus",
      budget_meta_quotidien_eur: 40,
      ensembles: 2,
      cpl_cible_eur: 30,
      conversions_semaine_par_ensemble: 5,
      ciblage_detaille: "Conducteurs de travaux, 30-55 ans, France",
      justification: "40 €/jour nourrissent deux ensembles à 5 leads par semaine chacun",
    });
    expect(mem.decisions[0]).toMatchObject({ kind: "audience", status: "proposee", after: expect.objectContaining({ ensembles: 2, cplCibleEur: 30 }) });
  });

  it("Advantage+ seul demande au moins son budget", async () => {
    const { ctx } = await setup("stratege", fakeAtelier());
    expect(await use(ctx, "proposer_audiences", { mode: "advantage-plus", ensembles: 1, justification: "…" })).toMatchObject({ isError: true });
  });
});

describe("repartir_budget — bornes en code, proposition seulement", () => {
  it("une répartition dans les bornes est proposée et devient la répartition en vigueur de la campagne", async () => {
    const atelier = fakeAtelier();
    const { ctx, run } = await setup("orchestrateur", atelier);
    await use(ctx, "repartir_budget", { ia_eur_jour: 4, meta_eur_jour: 26, justification: "Préparation : l'IA sert après publication" });
    const d = mem.decisions[0];
    expect(d).toMatchObject({ kind: "repartition-budget", status: "proposee", after: { aiDailyEur: 4, metaDailyEur: 26 } });
    expect(atelier.setSplit).toHaveBeenCalledWith(run.campaign, { aiDailyEur: 4, metaDailyEur: 26 }, d.id, NOW);
  });

  it("hors des bornes : bloquée, avec les motifs, et rien ne change sur la campagne", async () => {
    const atelier = fakeAtelier();
    const { ctx } = await setup("orchestrateur", atelier);
    await use(ctx, "repartir_budget", { ia_eur_jour: 10, meta_eur_jour: 20, justification: "…" });
    expect(mem.decisions[0]).toMatchObject({ status: "bloquee", guardrail: expect.stringMatching(/au-delà du maximum de 4,50 €/) });
    expect(atelier.setSplit).not.toHaveBeenCalled();
  });

  it("sans budget total saisi sur la campagne : bloquée, en le disant", async () => {
    const atelier = fakeAtelier({ campaignBudget: vi.fn(async () => null) });
    const { ctx } = await setup("orchestrateur", atelier);
    await use(ctx, "repartir_budget", { ia_eur_jour: 1, meta_eur_jour: 10, justification: "…" });
    expect(mem.decisions[0].guardrail).toMatch(/Aucun budget quotidien total/);
  });
});

describe("deposer_a_valider — la fin du passage", () => {
  it("dépose ce qui est publiable, écarte le reste avec sa raison, et termine le passage « À valider »", async () => {
    const atelier = fakeAtelier();
    const run = mem.newRun();
    await mem.newRoot(run);
    const { model } = scripted({ "Préparer la campagne": [reply("tool_use", toolCall("d", "deposer_a_valider", { creas: [100, 999], resume: "Deux angles, Advantage+" }))] });
    const r = await tickRun({ store: mem.store, model, budget, atelier, sources: unusedPort("sources"), now: () => NOW }, run.id, new Date("2026-10-05T09:00:00Z"));
    expect(atelier.submit).toHaveBeenCalledWith(run.campaign, [100, 999]);
    expect(r.outcome).toBe("a-valider");
    expect(mem.runs.get(run.id)!.summary).toBe("Deux angles, Advantage+");
    expect(mem.steps.find((s) => s.tool === "deposer_a_valider")!.line).toMatch(/dépose 1 créa\(s\) « À valider » \(1 écartée\(s\)\)/);
  });
});
