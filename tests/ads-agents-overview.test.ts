import { describe, expect, it } from "vitest";

import { buildAgentsOverview, buildProposal } from "@/modules/ads/agent/overview";

/**
 * Les agents vus d'en haut (plan Publicité, §9 quater, commit 8) : la carte
 * « Agents » du tableau de bord, et la proposition d'un passage dans « À valider ».
 */

describe("la carte « Agents »", () => {
  const o = buildAgentsOverview({
    runs: [
      // Du plus récent au plus ancien : seul le premier de chaque campagne compte.
      { id: 3, campaign: 2, status: "a-valider", costEur: 1.234, budgetEur: 2, startedAt: "2026-10-13T10:00:00Z" },
      { id: 2, campaign: 1, status: "en-cours", costEur: 0.5, budgetEur: 2, startedAt: "2026-10-12T10:00:00Z" },
      { id: 1, campaign: 2, status: "arrete", costEur: 0.2, budgetEur: 1, startedAt: "2026-10-01T10:00:00Z" },
    ],
    agents: [
      { run: 2, status: "en-cours" },
      { run: 2, status: "en-attente" },
      { run: 2, status: "termine" },
    ],
    usageToday: [
      { campaign: 1, eur: 0.3 },
      { campaign: { id: 1 }, eur: 0.1 },
      { campaign: 2, eur: 1 },
    ],
    campaigns: [
      { id: 1, name: "Démos PME" },
      { id: 2, name: "Artisans" },
    ],
    spentDay: 1.4,
    capDay: 10,
  });

  it("une ligne par campagne, son dernier passage ; ce qui tourne d'abord", () => {
    expect(o.campagnes.map((c) => [c.nom, c.statut])).toEqual([
      ["Démos PME", "en-cours"],
      ["Artisans", "a-valider"],
    ]);
  });

  it("agents actifs du passage en cours, coût du passage et coût IA du jour par campagne", () => {
    expect(o.campagnes[0]).toMatchObject({ enCours: true, agentsActifs: 2, depensePassage: 0.5, coutJour: 0.4 });
    expect(o.campagnes[1]).toMatchObject({ enCours: false, depensePassage: 1.23, coutJour: 1 });
    expect(o.jour).toEqual({ depense: 1.4, plafond: 10 });
  });
});

describe("la proposition d'un passage", () => {
  it("la dernière proposition de chaque type, jamais une décision bloquée", () => {
    const p = buildProposal(
      { id: 9, campaign: { id: 2, name: "Artisans" }, startedAt: "2026-10-13T10:00:00Z", finishedAt: "2026-10-13T10:20:00Z", summary: "2 angles, 4 créas." },
      "Artisans",
      [
        { kind: "positionnement", status: "executee", after: { positionnement: "Le chantier sans papier" } },
        { kind: "repartition-budget", status: "proposee", after: { aiDailyEur: 3, metaDailyEur: 27 } },
        { kind: "repartition-budget", status: "bloquee", after: { aiDailyEur: 10, metaDailyEur: 20 } },
      ],
      4,
    );
    expect(p).toEqual({
      run: 9,
      campagne: { id: 2, nom: "Artisans" },
      le: "2026-10-13T10:20:00Z",
      bilan: "2 angles, 4 créas.",
      positionnement: "« Le chantier sans papier »",
      audience: null,
      repartition: "IA 3,00 € par jour, Meta 27,00 € par jour",
      creasAValider: 4,
    });
  });
});
