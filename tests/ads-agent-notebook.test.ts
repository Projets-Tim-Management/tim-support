import { describe, expect, it, vi } from "vitest";

import { buildMessages } from "@/modules/ads/agent/conversation";
import { notebookFor, notebookText, resolveAppuis, type Notebook } from "@/modules/ads/agent/notebook";
import { TOOLS } from "@/modules/ads/agent/registry";
import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import type { ToolContext } from "@/modules/ads/agent/tools";
import type { AgentDeps, AgentRow, RunRow, StepRow } from "@/modules/ads/agent/types";
import { AdInstructions } from "@/modules/ads/collections/AdInstructions";
import { AdLearnings } from "@/modules/ads/collections/AdLearnings";

import { memoryStore, unusedPort } from "./helpers/agent-memory";

/**
 * Consignes et carnet d'apprentissages (plan Publicité, §9 quinquies, commit
 * 4 bis) : la photo prise au lancement, ce que l'agent en lit, et les appuis
 * que le code vérifie avant d'écrire une décision.
 */

const NOW = new Date("2026-10-13T08:00:00Z");

describe("la photo d'une campagne", () => {
  const instructions = [
    { id: 1, text: "Jamais de chantier de nuit sur les visuels", scope: "global", status: "active" },
    { id: 2, text: "Pas de tutoiement", scope: "campagne", campaign: 77, status: "active" },
    { id: 3, text: "D'une autre campagne", scope: "campagne", campaign: 78, status: "active" },
    { id: 4, text: "Proposée, pas encore confirmée", scope: "global", status: "proposee" },
    { id: 5, text: "Écartée", scope: "global", status: "ecartee" },
  ];
  const learnings = [
    { id: 10, statement: "« Temps gagné » coûte moins cher par lead", scope: "campagne", campaign: { id: 77 }, confidence: "forte", status: "actif", revalidateAt: "2027-01-01T00:00:00Z" },
    { id: 11, statement: "Les vidéos courtes marchent mieux", scope: "global", confidence: "faible", status: "actif", revalidateAt: "2026-09-01T00:00:00Z" },
    { id: 12, statement: "Attend Charlie", scope: "global", status: "global-propose" },
  ];

  it("ne retient que l'actif, global ou de cette campagne, avec une référence courte", () => {
    const nb = notebookFor(77, instructions, learnings, NOW);
    expect(nb.instructions.map((e) => e.ref)).toEqual(["C1", "C2"]);
    expect(nb.learnings.map((e) => e.ref)).toEqual(["A10", "A11"]);
  });

  it("marque « à revalider » un apprentissage dont la date est passée", () => {
    const nb = notebookFor(77, [], learnings, NOW);
    expect(nb.learnings.find((e) => e.ref === "A11")?.aRevalider).toBe(true);
    expect(nb.learnings.find((e) => e.ref === "A10")?.aRevalider).toBe(false);
    expect(notebookText(nb)).toMatch(/\[A11\].*À REVALIDER/);
  });

  it("dit « aucune » plutôt que de se taire", () => {
    const text = notebookText({ instructions: [], learnings: [] });
    expect(text).toContain("Consignes de Charlie (à respecter) :\nAucune.");
    expect(text).toContain("Carnet d'apprentissages (ce qu'on a constaté) :\nAucun.");
  });

  it("est dans le premier message de chaque agent du passage", () => {
    const run = { objective: "O", instructionsRead: notebookFor(77, instructions, [], NOW).instructions } as RunRow;
    const [first] = buildMessages(run, { mission: "M", budgetEur: 1 } as AgentRow, []);
    expect(String(first.content)).toContain("[C1] (toutes campagnes) Jamais de chantier de nuit sur les visuels");
  });
});

describe("les appuis d'une décision", () => {
  const nb: Notebook = {
    instructions: [{ ref: "C4", id: 4, text: "Pas de tutoiement", scope: "global" }],
    learnings: [{ ref: "A12", id: 12, text: "Temps gagné", scope: "campagne", confidence: "forte", aRevalider: false }],
  };

  it("sont exigés : une liste, vide si rien n'a pesé", () => {
    expect(resolveAppuis(nb, undefined)).toHaveProperty("error");
    expect(resolveAppuis(nb, [])).toEqual({ instructions: [], learnings: [], citations: [] });
  });

  it("ne citent que la photo du passage, et en copient le texte", () => {
    expect(resolveAppuis(nb, ["c4", "[A12]", "C4"])).toEqual({
      instructions: [4],
      learnings: [12],
      citations: [
        { ref: "C4", text: "Pas de tutoiement" },
        { ref: "A12", text: "Temps gagné" },
      ],
    });
    expect(resolveAppuis(nb, ["A99"])).toEqual({ error: expect.stringContaining("A99") });
  });

  async function stratege(run: RunRow) {
    const mem = memoryStore();
    const r = { ...mem.newRun(), ...run };
    mem.runs.set(r.id, r);
    const root = await mem.newRoot(r);
    const agent = await mem.store.createAgent({ run: r.id, parent: root.id, depth: 1, role: "stratege", status: "en-cours", mission: "M", tools: [...ROLE_TOOLS.stratege], model: "claude-sonnet-5-5", budgetEur: 1 });
    const step = await mem.store.createStep({ run: r.id, agent: agent.id, seq: 0, kind: "outil", tool: "x", status: "en-cours", line: "", input: null, output: null, idempotencyKey: "k", startedAt: NOW.toISOString() });
    const deps = { store: mem.store, model: vi.fn(), budget: unusedPort("budget"), atelier: unusedPort("atelier"), sources: unusedPort("sources"), now: () => NOW } as unknown as AgentDeps;
    const agents = await mem.store.listAgents(r.id);
    const ctx = { deps, run: r, agent: agents.find((a) => a.id === agent.id)!, agents, step: step as StepRow, ledger: () => ({}) } as unknown as ToolContext;
    return { ctx, mem };
  }

  it("un outil de décision journalise ses appuis vérifiés", async () => {
    const { ctx, mem } = await stratege({ instructionsRead: nb.instructions, learningsRead: nb.learnings } as RunRow);
    const out = await TOOLS.proposer_angles.run(ctx, { angles: ["Temps gagné"], justification: "A12 le montre", appuis: ["A12", "C4"] });
    expect(out).toMatchObject({ kind: "ok", output: { ok: true } });
    expect(mem.decisions[0]).toMatchObject({ kind: "angle", instructions: [4], learnings: [12], citations: [{ ref: "C4" }, { ref: "A12" }] });
  });

  it("un appui inventé est refusé, et rien n'est journalisé", async () => {
    const { ctx, mem } = await stratege({ instructionsRead: nb.instructions, learningsRead: nb.learnings } as RunRow);
    const out = await TOOLS.proposer_positionnement.run(ctx, { positionnement: "P", justification: "J", appuis: ["C9"] });
    expect(out).toMatchObject({ isError: true, output: { refus: expect.stringContaining("C9") } });
    expect(mem.decisions).toHaveLength(0);
  });

  it("sans le paramètre, la décision est refusée", async () => {
    const { ctx, mem } = await stratege({} as RunRow);
    expect(await TOOLS.proposer_positionnement.run(ctx, { positionnement: "P", justification: "J" })).toMatchObject({ isError: true });
    expect(mem.decisions).toHaveLength(0);
  });

  it("chaque outil de décision déclare ses appuis comme obligatoires", () => {
    for (const name of ["proposer_positionnement", "proposer_angles", "proposer_audiences", "repartir_budget", "juger_crea"]) {
      expect(TOOLS[name].definition.input_schema.required).toContain("appuis");
    }
  });
});

describe("les lignes du carnet et des consignes", () => {
  const hook = (c: typeof AdLearnings) => c.hooks!.beforeChange![0] as unknown as (a: unknown) => Record<string, unknown>;
  const req = { user: { id: 3 } };

  it("un apprentissage se revalide 90 jours après, par défaut", () => {
    const out = hook(AdLearnings)({ data: { statement: "S", scope: "campagne", campaign: 77, status: "actif", learnedAt: "2026-10-01T00:00:00.000Z" }, req });
    expect(out.revalidateAt).toBe("2026-12-30T00:00:00.000Z");
    expect(out.promotedBy).toBeUndefined();
  });

  it("le passage en global actif est signé et daté ; la campagne tombe", () => {
    const out = hook(AdLearnings)({ data: { scope: "global", status: "actif" }, originalDoc: { scope: "campagne", campaign: 77, status: "global-propose", learnedAt: "2026-10-01T00:00:00.000Z" }, req });
    expect(out).toMatchObject({ scope: "global", campaign: null, promotedBy: 3 });
    expect(typeof out.promotedAt).toBe("string");
  });

  it("une consigne est signée quand elle devient active, pas à chaque enregistrement", () => {
    const confirm = hook(AdInstructions as never);
    expect(confirm({ data: { status: "active" }, originalDoc: { status: "proposee" }, req })).toMatchObject({ confirmedBy: 3 });
    expect(confirm({ data: { text: "T" }, originalDoc: { status: "active" }, req }).confirmedBy).toBeUndefined();
  });
});
