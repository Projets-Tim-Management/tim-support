import type Anthropic from "@anthropic-ai/sdk";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { memoryStore, reply, say, scripted, toolCall, unusedPort } from "./helpers/agent-memory";

import { buildMessages, nextAction, RELANCE } from "@/modules/ads/agent/conversation";
import { ledgerOf, tickRun } from "@/modules/ads/agent/engine";
import { MAX_AGENTS_PER_RUN, MAX_CONCURRENT } from "@/modules/ads/agent/limits";
import {
  StepConflictError,
  type AgentDeps,
  type AgentRow,
  type ModelResponse,
  type RunRow,
  type StepRow,
} from "@/modules/ads/agent/types";
import { AdsBudgetError } from "@/modules/ads/lib/spend";

let mem: ReturnType<typeof memoryStore>;
const budget = { assert: vi.fn(async () => {}), record: vi.fn(async () => {}) };
const START = Date.parse("2026-10-05T08:00:00Z");
let clock = START; // une horloge qu'un test peut avancer (verrou expiré)
const now = () => new Date(clock);
const later = new Date("2026-10-05T09:00:00Z");
// Les tests du moteur n'appellent ni l'atelier ni les sources (voir ads-agent-tools.test.ts).
const deps = (model: AgentDeps["model"]): AgentDeps => ({ store: mem.store, model, budget, atelier: unusedPort("atelier"), sources: unusedPort("sources"), now });

beforeEach(() => {
  clock = START;
  mem = memoryStore();
  budget.assert.mockReset().mockResolvedValue(undefined);
  budget.record.mockReset().mockResolvedValue(undefined);
});

describe("un passage complet : l'orchestrateur délègue, attend, rend", () => {
  it("crée un stratège, attend son résultat, termine — le passage part « À valider »", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    const { model } = scripted({
      "Préparer la campagne": [
        reply("tool_use", toolCall("t1", "creer_sous_agent", { role: "stratege", mission: "Trouver trois angles", budget_eur: 1.5, justification: "Il faut des angles avant les textes" })),
        reply("tool_use", toolCall("t2", "attendre_sous_agents", {})),
        reply("tool_use", toolCall("t3", "terminer", { resume: "Trois angles prêts" })),
      ],
      "Trouver trois angles": [reply("tool_use", say("Voici mes angles."), toolCall("s1", "terminer", { resume: "Temps gagné, zéro papier, conformité" }))],
    });

    const r = await tickRun(deps(model), run.id, later);

    expect(r.outcome).toBe("a-valider");
    expect(mem.runs.get(run.id)!.summary).toBe("Trois angles prêts");
    const stratege = mem.agents.find((a) => a.role === "stratege")!;
    expect(stratege).toMatchObject({ depth: 1, status: "termine", budgetEur: 1.5, model: "claude-opus-5-5", result: { resume: "Temps gagné, zéro papier, conformité" } });
    // Le journal : la création, avec sa justification.
    expect(mem.decisions).toEqual([expect.objectContaining({ kind: "creation-sous-agent", status: "executee", rationale: "Il faut des angles avant les textes" })]);
    // Le fil, lisible — pas de JSON.
    expect(mem.steps.map((s) => s.line)).toEqual(
      expect.arrayContaining([
        "L'orchestrateur crée un stratège (1,50 €) : « Trouver trois angles »",
        "Le stratège termine : Temps gagné, zéro papier, conformité",
        "L'orchestrateur reprend : 1 sous-agent a rendu leur travail.",
      ]),
    );
    // Chaque appel est payé au registre, et le coût remonte au passage.
    expect(budget.record).toHaveBeenCalledTimes(4);
    expect(mem.runs.get(run.id)!.costEur).toBeGreaterThan(0);
    expect(mem.runs.get(run.id)!.leaseUntil).toBeNull();
  });

  it("le parent qui attend reçoit l'échec d'un enfant, sans bloquer", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    const { model } = scripted({
      "Préparer la campagne": [
        reply("tool_use", toolCall("t1", "creer_sous_agent", { role: "redacteur", mission: "Écrire", budget_eur: 1, justification: "—" })),
        reply("tool_use", toolCall("t2", "attendre_sous_agents", {})),
        reply("tool_use", toolCall("t3", "terminer", { resume: "Partiel" })),
      ],
      Écrire: [reply("refusal")],
    });
    await tickRun(deps(model), run.id, later);
    expect(mem.agents.find((a) => a.role === "redacteur")).toMatchObject({ status: "echoue", error: "Le modèle a décliné cette mission." });
    const waited = mem.steps.find((s) => s.tool === "attendre_sous_agents")!;
    expect(waited.line).toMatch(/dont 1 en échec/);
    expect(mem.runs.get(run.id)!.status).toBe("a-valider");
  });
});

describe("les garde-fous de l'arbre, en code", () => {
  const create = (input: Record<string, unknown>) => reply("tool_use", toolCall("c", "creer_sous_agent", { justification: "test", ...input }));

  it("refuse un budget qui ne tient pas dans celui du parent, et le journalise « bloquée »", async () => {
    const run = mem.newRun(2);
    await mem.newRoot(run);
    const { model } = scripted({ "Préparer la campagne": [create({ role: "stratege", mission: "M", budget_eur: 3 }), reply("tool_use", toolCall("t", "terminer", { resume: "fin" }))] });
    await tickRun(deps(model), run.id, later);
    expect(mem.agents.filter((a) => a.depth > 0)).toHaveLength(0);
    expect(mem.decisions[0]).toMatchObject({ kind: "creation-sous-agent", status: "bloquee", guardrail: expect.stringMatching(/Budget demandé 3,00 €, il reste/) });
    // Le modèle a lu le refus comme une erreur d'outil.
    const result = mem.steps.find((s) => s.tool === "creer_sous_agent")!.output as { result: unknown; isError: boolean };
    expect(result.isError).toBe(true);
  });

  it("refuse un outil que le rôle n'a pas", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    const { model } = scripted({ "Préparer la campagne": [create({ role: "controleur", mission: "M", budget_eur: 0.5, outils: ["creer_sous_agent"] }), reply("tool_use", toolCall("t", "terminer", { resume: "fin" }))] });
    await tickRun(deps(model), run.id, later);
    expect(mem.decisions[0].guardrail).toMatch(/non autorisé\(s\) pour ce rôle : creer_sous_agent/);
  });

  it("refuse l'orchestrateur comme sous-agent, et au-delà de la profondeur maximale", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    const { model } = scripted({
      "Préparer la campagne": [
        create({ role: "orchestrateur", mission: "Bis", budget_eur: 1 }),
        create({ role: "stratege", mission: "Niveau 1", budget_eur: 3 }),
        reply("tool_use", toolCall("w", "attendre_sous_agents", {})),
        reply("tool_use", toolCall("t", "terminer", { resume: "fin" })),
      ],
      "Niveau 1": [
        create({ role: "directeur-artistique", mission: "Niveau 2", budget_eur: 1 }),
        reply("tool_use", toolCall("w", "attendre_sous_agents", {})),
        reply("tool_use", toolCall("t", "terminer", { resume: "ok" })),
      ],
      "Niveau 2": [create({ role: "controleur", mission: "Niveau 3", budget_eur: 0.2 }), reply("tool_use", toolCall("t", "terminer", { resume: "ok" }))],
    });
    await tickRun(deps(model), run.id, later);
    expect(mem.decisions.filter((d) => d.status === "bloquee").map((d) => d.guardrail)).toEqual([expect.stringMatching(/non créable/), expect.stringMatching(/profondeur maximale/)]);
    expect(Math.max(...mem.agents.map((a) => a.depth))).toBe(2);
  });

  it(`jamais plus de ${MAX_CONCURRENT} sous-agents en cours à la fois, les autres attendent leur tour`, async () => {
    // Cinq sous-agents déjà en file, l'orchestrateur en train de les attendre.
    const run = mem.newRun();
    const root = await mem.newRoot(run);
    const wait = toolCall("w", "attendre_sous_agents", {});
    await mem.store.createStep({ run: run.id, agent: root.id, seq: 0, kind: "modele", tool: null, status: "fait", line: "", input: null, output: { content: [wait], stopReason: "tool_use" }, idempotencyKey: `${root.id}:0`, startedAt: now().toISOString() });
    for (let i = 0; i < 5; i++) {
      await mem.store.createAgent({ run: run.id, parent: root.id, depth: 1, role: "redacteur", status: "en-attente", mission: `Texte ${i}`, tools: ["terminer"], model: "claude-sonnet-5-5", budgetEur: 0.5 });
    }
    const scen: Record<string, ModelResponse[]> = { "Préparer la campagne": [reply("tool_use", toolCall("t", "terminer", { resume: "fin" }))] };
    for (let i = 0; i < 5; i++) scen[`Texte ${i}`] = [reply("end_turn", say("…")), reply("tool_use", toolCall("t", "terminer", { resume: `ok ${i}` }))];
    const { model } = scripted(scen);
    let peak = 0;
    const spy = vi.spyOn(mem.store, "updateAgent");
    spy.mockImplementation(async (i, patch) => {
      Object.assign(mem.agents.find((a) => a.id === i)!, patch);
      peak = Math.max(peak, mem.agents.filter((a) => a.depth > 0 && a.status === "en-cours").length);
    });
    await tickRun(deps(model), run.id, later);
    expect(peak).toBe(MAX_CONCURRENT);
    expect(mem.agents.filter((a) => a.depth > 0 && a.status === "termine")).toHaveLength(5);
  });

  it(`refuse au-delà de ${MAX_AGENTS_PER_RUN} sous-agents par passage`, async () => {
    const run = mem.newRun(50);
    await mem.newRoot(run);
    const creates = Array.from({ length: MAX_AGENTS_PER_RUN + 1 }, (_, i) => create({ role: "redacteur", mission: `R${i}`, budget_eur: 0.1 }));
    const scen: Record<string, ModelResponse[]> = { "Préparer la campagne": [...creates, reply("tool_use", toolCall("t", "terminer", { resume: "fin" }))] };
    const { model } = scripted(scen);
    // Les enfants ne tournent pas ici : seul l'orchestrateur est scénarisé, on arrête avant.
    mem.store.updateAgent = vi.fn(async (i, patch) => {
      if (patch.status === "en-cours" && mem.agents.find((a) => a.id === i)!.depth > 0) return;
      Object.assign(mem.agents.find((a) => a.id === i)!, patch);
    });
    await tickRun(deps(model), run.id, later);
    expect(mem.agents.filter((a) => a.depth > 0)).toHaveLength(MAX_AGENTS_PER_RUN);
    expect(mem.decisions.at(-1)!.guardrail).toMatch(new RegExp(`${MAX_AGENTS_PER_RUN} sous-agents déjà créés`));
  });

  it("un outil hors de la liste de l'agent est refusé au modèle, sans l'exécuter", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    const root = mem.agents[0];
    root.tools = ["terminer"];
    const { model } = scripted({ "Préparer la campagne": [reply("tool_use", toolCall("x", "creer_sous_agent", { role: "stratege", mission: "M", budget_eur: 1, justification: "—" })), reply("tool_use", toolCall("t", "terminer", { resume: "fin" }))] });
    await tickRun(deps(model), run.id, later);
    expect(mem.agents).toHaveLength(1);
    expect(mem.steps.find((s) => s.tool === "creer_sous_agent")!.line).toMatch(/Outil non autorisé pour ce rôle/);
  });
});

describe("le budget, avant chaque appel", () => {
  it("un agent sans budget pour son prochain appel s'arrête en échec, avec le montant", async () => {
    const run = mem.newRun(0.01);
    await mem.newRoot(run);
    const { model } = scripted({});
    await tickRun(deps(model), run.id, later);
    expect(model).not.toHaveBeenCalled();
    expect(mem.agents[0]).toMatchObject({ status: "echoue", error: expect.stringMatching(/Budget de l'agent épuisé\. Cet appel peut coûter jusqu'à/) });
    expect(mem.runs.get(run.id)!.status).toBe("echoue");
  });

  it("le plafond global atteint met le passage en pause (il reprendra), sans rien appeler", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    budget.assert.mockRejectedValue(new AdsBudgetError("Plafond du jour : 15,00 € dépensés sur 15,00 €"));
    const { model } = scripted({});
    const r = await tickRun(deps(model), run.id, later);
    expect(r.outcome).toBe("pause-budget");
    expect(model).not.toHaveBeenCalled();
    expect(mem.runs.get(run.id)).toMatchObject({ status: "en-pause-budget", error: expect.stringMatching(/Plafond du jour/) });
  });

  it("le budget d'un enfant fini ne compte plus que ce qu'il a consommé", () => {
    const parent = { id: 1, parent: null, spentEur: 0.5, budgetEur: 5, status: "en-cours" } as AgentRow;
    const done = { id: 2, parent: 1, spentEur: 0.3, budgetEur: 2, status: "termine" } as AgentRow;
    const running = { id: 3, parent: 1, spentEur: 0.1, budgetEur: 1, status: "en-cours" } as AgentRow;
    expect(ledgerOf(parent, [parent, done, running])).toEqual({ budgetEur: 5, spentEur: 0.5, reservedForChildrenEur: 1.3 });
  });
});

describe("reprise et exécutions concurrentes", () => {
  it("un verrou tenu par une autre exécution : on ne touche à rien", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    await mem.store.acquireLease(run.id, later, now());
    const { model } = scripted({});
    expect(await tickRun(deps(model), run.id, later)).toEqual({ outcome: "occupe", steps: 0 });
    expect(model).not.toHaveBeenCalled();
  });

  it("une étape d'appel restée ouverte (coupure) est rejouée à la même place, sans nouvelle étape", async () => {
    const run = mem.newRun();
    const root = await mem.newRoot(run);
    await mem.store.createStep({ run: run.id, agent: root.id, seq: 0, kind: "modele", tool: null, status: "en-cours", line: "…", input: null, output: null, idempotencyKey: `${root.id}:0`, startedAt: now().toISOString() });
    const { model } = scripted({ "Préparer la campagne": [reply("tool_use", toolCall("t", "terminer", { resume: "repris" }))] });
    await tickRun(deps(model), run.id, later);
    expect(mem.steps.filter((s) => s.agent === root.id).map((s) => [s.seq, s.kind, s.status])).toEqual([
      [0, "modele", "fait"],
      [1, "outil", "fait"],
    ]);
  });

  it("une création de sous-agent coupée après coup ne crée pas un second enfant", async () => {
    const run = mem.newRun();
    const root = await mem.newRoot(run);
    const toolUse = toolCall("c1", "creer_sous_agent", { role: "stratege", mission: "Angles", budget_eur: 1, justification: "—" });
    await mem.store.createStep({ run: run.id, agent: root.id, seq: 0, kind: "modele", tool: null, status: "fait", line: "", input: null, output: { content: [toolUse], stopReason: "tool_use" }, idempotencyKey: `${root.id}:0`, startedAt: now().toISOString() });
    const open = await mem.store.createStep({ run: run.id, agent: root.id, seq: 1, kind: "outil", tool: "creer_sous_agent", status: "en-cours", line: "", input: { toolUseId: "c1", input: (toolUse as Anthropic.ToolUseBlock).input }, output: null, idempotencyKey: `${root.id}:1`, startedAt: "2026-10-05T07:59:00.000Z" });
    // L'enfant existe déjà : la coupure est tombée entre sa création et la clôture de l'étape.
    await mem.store.createAgent({ run: run.id, parent: root.id, depth: 1, role: "stratege", status: "en-attente", mission: "Angles", tools: ["terminer"], model: "claude-opus-5-5", budgetEur: 1 });
    const { model } = scripted({ "Préparer la campagne": [reply("tool_use", toolCall("t", "terminer", { resume: "fin" }))], Angles: [reply("tool_use", toolCall("t", "terminer", { resume: "ok" }))] });
    await tickRun(deps(model), run.id, later);
    expect(mem.agents.filter((a) => a.role === "stratege")).toHaveLength(1);
    expect(mem.steps.find((s) => s.id === open.id)!.status).toBe("fait");
  });

  it("deux exécutions sur la même étape : la seconde s'arrête sur la clé d'idempotence", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    mem.store.createStep = vi.fn(async (d) => {
      throw new StepConflictError(d.idempotencyKey);
    });
    const { model } = scripted({});
    expect((await tickRun(deps(model), run.id, later)).outcome).toBe("occupe");
    expect(mem.runs.get(run.id)!.leaseUntil).toBeNull();
  });
});

describe("la conversation, reconstruite des étapes", () => {
  const s = (p: Partial<StepRow>): StepRow => ({ id: 0, run: 1, agent: 1, seq: 0, kind: "modele", tool: null, status: "fait", line: "", input: null, output: null, idempotencyKey: "", costEur: 0, startedAt: "", ...p });
  const run = { objective: "Obj" } as RunRow;
  const agent = { mission: "Mis", budgetEur: 1 } as AgentRow;

  it("regroupe les résultats d'outils d'un même tour, et laisse de côté les étapes échouées", () => {
    const msgs = buildMessages(run, agent, [
      s({ seq: 0, status: "echoue" }),
      s({ seq: 1, output: { content: [toolCall("a", "x", {}), toolCall("b", "y", {})], stopReason: "tool_use" } }),
      s({ seq: 2, kind: "outil", tool: "x", input: { toolUseId: "a", input: {} }, output: { result: { ok: 1 } } }),
      s({ seq: 3, kind: "outil", tool: "y", input: { toolUseId: "b", input: {} }, output: { result: { refus: "non" }, isError: true } }),
    ]);
    expect(msgs.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(msgs[2].content).toEqual([
      { type: "tool_result", tool_use_id: "a", content: '{"ok":1}' },
      { type: "tool_result", tool_use_id: "b", content: '{"refus":"non"}', is_error: true },
    ]);
  });

  it("relance une seule fois un agent qui s'arrête sans « terminer », puis déclare l'échec", () => {
    const stopped = s({ seq: 0, output: { content: [say("Fini.")], stopReason: "end_turn" } });
    expect(nextAction([stopped], 25, 2)).toEqual({ kind: "relance" });
    const relanced = [stopped, s({ seq: 1, kind: "outil", tool: RELANCE }), s({ seq: 2, output: { content: [say("Toujours fini.")], stopReason: "end_turn" } })];
    expect(nextAction(relanced.slice(0, 2), 25, 2)).toEqual({ kind: "call" });
    expect(nextAction(relanced, 25, 2)).toEqual({ kind: "fail", reason: "Arrêté deux fois sans rendre de résultat." });
  });

  it("abandonne après deux appels en échec de suite, et au-delà du nombre de tours", () => {
    expect(nextAction([s({ seq: 0, status: "echoue" }), s({ seq: 1, status: "echoue" })], 25, 2)).toMatchObject({ kind: "fail" });
    const turn = (seq: number) => [s({ seq: seq * 2, output: { content: [toolCall(`u${seq}`, "x", {})], stopReason: "tool_use" } }), s({ seq: seq * 2 + 1, kind: "outil", tool: "x", input: { toolUseId: `u${seq}`, input: {} }, output: { result: 1 } })];
    expect(nextAction([...turn(0), ...turn(1)], 2, 2)).toEqual({ kind: "fail", reason: "2 tours sans rendre de résultat." });
  });
});

// ─── Relecture du 29/09/2026 : chaque bug reproduit AVANT sa correction ──────

describe("relecture — A. un sous-agent qui attend ses enfants ne bloque pas l'arbre", () => {
  it("3 stratèges qui attendent chacun leur rédacteur : les rédacteurs démarrent, le passage aboutit", async () => {
    // L'état exact de la relecture : 3 stratèges en cours, chacun en train d'attendre son rédacteur, encore en file.
    const run = mem.newRun(10);
    const root = await mem.newRoot(run);
    const waitStep = async (agent: AgentRow, id: string) =>
      mem.store.createStep({ run: run.id, agent: agent.id, seq: 0, kind: "modele", tool: null, status: "fait", line: "", input: null, output: { content: [toolCall(id, "attendre_sous_agents", {})], stopReason: "tool_use" }, idempotencyKey: `${agent.id}:0`, startedAt: now().toISOString() });
    await waitStep(root, "w");
    const scen: Record<string, ModelResponse[]> = { "Préparer la campagne": [reply("tool_use", toolCall("t", "terminer", { resume: "fin" }))] };
    for (const i of [0, 1, 2]) {
      const strat = await mem.store.createAgent({ run: run.id, parent: root.id, depth: 1, role: "stratege", status: "en-cours", mission: `Stratégie ${i}`, tools: ["attendre_sous_agents", "terminer"], model: "claude-opus-5-5", budgetEur: 2 });
      await waitStep(strat, `w${i}`);
      await mem.store.createAgent({ run: run.id, parent: strat.id, depth: 2, role: "redacteur", status: "en-attente", mission: `Rédiger ${i}`, tools: ["terminer"], model: "claude-sonnet-5-5", budgetEur: 0.5 });
      scen[`Stratégie ${i}`] = [reply("tool_use", toolCall(`t${i}`, "terminer", { resume: `stratégie ${i}` }))];
      scen[`Rédiger ${i}`] = [reply("tool_use", toolCall("t", "terminer", { resume: `texte ${i}` }))];
    }
    const { model } = scripted(scen);
    const r = await tickRun(deps(model), run.id, later);
    expect(mem.agents.filter((a) => a.role === "redacteur").map((a) => a.status)).toEqual(["termine", "termine", "termine"]);
    expect(r.outcome).toBe("a-valider");
  });

  it("si plus rien ne peut avancer alors que l'orchestrateur tourne, le passage échoue avec un motif (pas d'attente sans fin)", async () => {
    const run = mem.newRun();
    const root = await mem.newRoot(run);
    // Un orchestrateur qui attend un enfant… qui n'existe dans aucun état exécutable.
    const wait = toolCall("w", "attendre_sous_agents", {});
    await mem.store.createStep({ run: run.id, agent: root.id, seq: 0, kind: "modele", tool: null, status: "fait", line: "", input: null, output: { content: [wait], stopReason: "tool_use" }, idempotencyKey: `${root.id}:0`, startedAt: now().toISOString() });
    const child = await mem.store.createAgent({ run: run.id, parent: root.id, depth: 1, role: "stratege", status: "en-cours", mission: "Bloqué", tools: ["attendre_sous_agents", "terminer"], model: "claude-opus-5-5", budgetEur: 1 });
    await mem.store.createStep({ run: run.id, agent: child.id, seq: 0, kind: "modele", tool: null, status: "fait", line: "", input: null, output: { content: [toolCall("w2", "attendre_sous_agents", {})], stopReason: "tool_use" }, idempotencyKey: `${child.id}:0`, startedAt: now().toISOString() });
    await mem.store.createAgent({ run: run.id, parent: child.id, depth: 2, role: "redacteur", status: "en-cours", mission: "Fantôme", tools: ["terminer"], model: "claude-sonnet-5-5", budgetEur: 0.5 });
    mem.agents.at(-1)!.status = "en-attente";
    // Blocage forcé : la base refuse de promouvoir le petit-enfant (toute autre écriture passe).
    const original = mem.store.updateAgent;
    mem.store.updateAgent = vi.fn(async (i, patch) => (patch.status === "en-cours" ? undefined : original(i, patch)));
    const { model } = scripted({});
    const r = await tickRun(deps(model), run.id, later);
    expect(r.outcome).toBe("echoue");
    expect(mem.runs.get(run.id)!.error).toMatch(/Plus rien n'avance/);
  });
});

describe("relecture — B. le coût d'un agent ne se perd pas dans une coupure", () => {
  it("coupure entre la clôture de l'étape et la mise à jour de l'agent : la reprise recompte depuis les étapes", async () => {
    const run = mem.newRun();
    const root = await mem.newRoot(run);
    const { model } = scripted({ "Préparer la campagne": [reply("tool_use", toolCall("c", "creer_sous_agent", { role: "stratege", mission: "M", budget_eur: 1, justification: "—" })), reply("tool_use", toolCall("t", "terminer", { resume: "fin" }))] });
    const original = mem.store.updateAgent;
    let crashed = false;
    mem.store.updateAgent = vi.fn(async (i, patch) => {
      if (!crashed && "spentEur" in patch) {
        crashed = true;
        throw new Error("fonction coupée");
      }
      return original(i, patch);
    });
    await expect(tickRun(deps(model), run.id, later)).rejects.toThrow("fonction coupée");
    await tickRun(deps(model), run.id, later);
    const stepsCost = mem.steps.filter((s) => s.agent === root.id).reduce((n, s) => n + s.costEur, 0);
    expect(stepsCost).toBeGreaterThan(0);
    expect(mem.agents.find((a) => a.id === root.id)!.spentEur).toBeCloseTo(stepsCost, 6);
    expect(mem.runs.get(run.id)!.costEur).toBeCloseTo(mem.steps.reduce((n, s) => n + s.costEur, 0), 6);
  });

  it("aucune étape ne démarre si elle risque d'être coupée par la fin de la fonction", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    const { model } = scripted({});
    const r = await tickRun(deps(model), run.id, new Date(clock + 30_000)); // 30 s de marge seulement
    expect(model).not.toHaveBeenCalled();
    expect(r).toEqual({ outcome: "en-cours", steps: 0 });
  });
});

describe("relecture — C. une réponse vide du modèle n'est pas renvoyée à l'API", () => {
  it("aucun message assistant vide, et jamais deux messages du même rôle à la suite", () => {
    const s = (p: Partial<StepRow>): StepRow => ({ id: 0, run: 1, agent: 1, seq: 0, kind: "modele", tool: null, status: "fait", line: "", input: null, output: null, idempotencyKey: "", costEur: 0, startedAt: "", ...p });
    const msgs = buildMessages({ objective: "O" } as RunRow, { mission: "M", budgetEur: 1 } as AgentRow, [
      s({ seq: 0, output: { content: [], stopReason: "end_turn" } }),
      s({ seq: 1, kind: "outil", tool: RELANCE }),
    ]);
    expect(msgs.some((m) => m.role === "assistant" && Array.isArray(m.content) && m.content.length === 0)).toBe(false);
    expect(msgs.every((m, i) => i === 0 || m.role !== msgs[i - 1].role)).toBe(true);
  });
});

describe("relecture — D. les sous-agents d'un parent fini s'arrêtent", () => {
  it("un stratège en échec laisse un rédacteur en file et un autre en plein travail : les deux s'arrêtent, sans appel au modèle", async () => {
    const run = mem.newRun(10);
    const root = await mem.newRoot(run);
    await mem.store.createStep({ run: run.id, agent: root.id, seq: 0, kind: "modele", tool: null, status: "fait", line: "", input: null, output: { content: [toolCall("w", "attendre_sous_agents", {})], stopReason: "tool_use" }, idempotencyKey: `${root.id}:0`, startedAt: now().toISOString() });
    const strat = await mem.store.createAgent({ run: run.id, parent: root.id, depth: 1, role: "stratege", status: "echoue", mission: "Épuisé", tools: ["terminer"], model: "claude-opus-5-5", budgetEur: 2 });
    await mem.store.createAgent({ run: run.id, parent: strat.id, depth: 2, role: "redacteur", status: "en-attente", mission: "Oublié en file", tools: ["terminer"], model: "claude-sonnet-5-5", budgetEur: 0.5 });
    await mem.store.createAgent({ run: run.id, parent: strat.id, depth: 2, role: "redacteur", status: "en-cours", mission: "Oublié en travail", tools: ["terminer"], model: "claude-sonnet-5-5", budgetEur: 0.5 });
    const { model, calls } = scripted({ "Préparer la campagne": [reply("tool_use", toolCall("t", "terminer", { resume: "fin" }))] });
    await tickRun(deps(model), run.id, later);
    for (const mission of ["Oublié en file", "Oublié en travail"]) {
      expect(mem.agents.find((a) => a.mission === mission)).toMatchObject({ status: "arrete", error: expect.stringMatching(/parent/) });
    }
    expect(calls.every((c) => String(c.messages[0].content).includes("Préparer la campagne"))).toBe(true);
  });
});

describe("relecture — F. une exécution ne rend pas le verrou d'une autre", () => {
  it("verrou expiré puis pris par une seconde exécution : la première ne le prolonge pas et ne le libère pas", async () => {
    const run = mem.newRun();
    await mem.newRoot(run);
    const takenBy = new Date(START + 60 * 60_000);
    const model = vi.fn(async () => {
      clock += 6 * 60_000; // l'appel dure 6 min : le verrou de 5 min expire…
      expect(await mem.store.acquireLease(run.id, takenBy, now())).toBeTruthy(); // …et une autre exécution le prend
      return reply("end_turn", say("…"));
    });
    const r = await tickRun(deps(model), run.id, new Date(START + 2 * 60 * 60_000));
    expect(r.outcome).toBe("occupe"); // elle s'aperçoit qu'elle a perdu la main, et s'arrête
    expect(model).toHaveBeenCalledTimes(1);
    expect(mem.runs.get(run.id)!.leaseUntil).toEqual(takenBy);
  });
});
