import { describe, expect, it } from "vitest";

import { buildControlRoom, decisionSummary, treeOrder } from "@/modules/ads/agent/control-room";

/**
 * La salle de contrôle (plan Publicité, §9 quater, point 4 ; commit 7) : l'arbre
 * dans l'ordre de lecture, des décisions lisibles avec leurs appuis, des
 * jauges qui disent la vérité avant la publication.
 */

const base = {
  runs: [{ id: 5, startedAt: "2026-10-13T12:00:00Z", status: "en-cours", costEur: 0.4, budgetEur: 2 }],
  run: { id: 5, startedAt: "2026-10-13T12:00:00Z", status: "en-cours", costEur: 0.4, budgetEur: 2, objective: "Des démos", instructionsRead: [{ ref: "C1" }], learningsRead: [] },
  spent: { day: 3.456, month: 20 },
  caps: { day: 10, month: 200 },
  campaignStatus: "brouillon",
};

describe("l'arbre des agents", () => {
  it("chaque agent suivi de ses enfants, dans l'ordre de création", () => {
    const order = treeOrder([
      { id: 1, parent: null },
      { id: 2, parent: 1 },
      { id: 3, parent: 1 },
      { id: 4, parent: 2 },
    ]);
    expect(order.map((a) => a.id)).toEqual([1, 2, 4, 3]);
  });

  it("un agent orphelin reste visible", () => {
    expect(treeOrder([{ id: 1, parent: null }, { id: 9, parent: 42 }]).map((a) => a.id)).toEqual([1, 9]);
  });
});

describe("les décisions, lisibles", () => {
  it("résume les valeurs structurées en une ligne", () => {
    expect(decisionSummary("angle", { angles: ["Temps gagné", "Zéro papier"] })).toBe("« Temps gagné », « Zéro papier »");
    expect(decisionSummary("repartition-budget", { aiDailyEur: 4, metaDailyEur: 26 })).toBe("IA 4,00 € par jour, Meta 26,00 € par jour");
    expect(decisionSummary("audience", { mode: "advantage-plus", budgetMetaQuotidienEur: 20 })).toBe("Advantage+ seul, 20,00 € par jour");
    expect(decisionSummary("attente", {})).toBeNull();
  });

  it("portent qui a décidé, l'état, le garde-fou et les appuis cités", () => {
    const room = buildControlRoom({
      ...base,
      agents: [
        { id: 1, parent: null, depth: 0, role: "orchestrateur", status: "en-cours", mission: "Préparer", budgetEur: 2, spentEur: 0.3 },
        { id: 2, parent: { id: 1 }, depth: 1, role: "stratege", status: "termine", mission: "Angles", budgetEur: 0.6, spentEur: 0.1 },
      ],
      steps: [
        { line: "Le stratège choisit 1 angle(s).", status: "fait", createdAt: "2026-10-13T12:05:00Z" },
        { line: "", status: "fait", createdAt: "2026-10-13T12:04:00Z" },
        { line: "Le stratège : lecture du site refusée", status: "echoue", createdAt: "2026-10-13T12:03:00Z" },
      ],
      decisions: [
        { id: 7, kind: "angle", status: "executee", agent: 2, rationale: "Le carnet le dit", after: { angles: ["Temps gagné"] }, citations: [{ ref: "A12", text: "Temps gagné convertit" }], createdAt: "2026-10-13T12:05:00Z" },
        { id: 8, kind: "repartition-budget", status: "bloquee", agent: 1, rationale: "…", after: { aiDailyEur: 10, metaDailyEur: 20 }, guardrail: "Part IA au-delà de 15 %.", createdAt: "2026-10-13T12:06:00Z" },
      ],
    })!;
    expect(room.agents.map((a) => a.roleLabel)).toEqual(["Orchestrateur", "Stratège"]);
    expect(room.decisions[0]).toMatchObject({ typeLabel: "Angle", etatLabel: "Exécutée", par: "Le stratège", resume: "« Temps gagné »", appuis: [{ ref: "A12" }] });
    expect(room.decisions[1]).toMatchObject({ etat: "bloquee", par: "L'orchestrateur", gardeFou: "Part IA au-delà de 15 %." });
    // Une étape sans phrase n'a rien à dire ; une étape échouée se signale.
    expect(room.fil).toHaveLength(2);
    expect(room.fil[1].echoue).toBe(true);
    expect(room.run).toMatchObject({ enCours: true, lus: { consignes: 1, apprentissages: 0 } });
  });
});

describe("les jauges", () => {
  it("dépense des agents face aux plafonds ; Meta « pas encore publiée » sur un brouillon", () => {
    const room = buildControlRoom({ ...base, agents: [], steps: [], decisions: [] })!;
    expect(room.jauges).toEqual({ iaJour: { depense: 3.46, plafond: 10 }, iaMois: { depense: 20, plafond: 200 }, meta: { publiee: false } });
  });

  it("pas de passage : pas de salle", () => {
    expect(buildControlRoom({ ...base, run: null, agents: [], steps: [], decisions: [] })).toBeNull();
  });
});
