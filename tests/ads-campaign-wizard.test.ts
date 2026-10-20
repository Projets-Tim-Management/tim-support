import { describe, expect, it } from "vitest";

import { draftFromDoc, emptyDraft, isComplete, resumeStep, stepData, stepProblems, suggestedRunObjective, type WizardDraft } from "@/modules/ads/lib/campaign-wizard";
import { launchSteps, type LaunchFacts } from "@/modules/ads/lib/launch-track";

const full = (): WizardDraft => ({
  ...emptyDraft(),
  id: 7,
  name: "Pointage BTP",
  account: 2,
  objective: "leads",
  audience: "Gérants de PME du BTP",
  pain: "Le pointage papier",
  offer: "Démo de 30 minutes",
  promise: "Des heures justes",
  landingUrl: "https://tim-management.co/pointage",
  totalDailyEur: 10,
});

describe("créer une campagne pas à pas", () => {
  it("chaque étape dit ce qui lui manque", () => {
    const e = emptyDraft();
    expect(stepProblems("bases", e)).toEqual(["Donnez un nom à la campagne.", "Choisissez le compte publicitaire."]);
    expect(stepProblems("cible", e)).toHaveLength(2);
    expect(stepProblems("offre", e)).toHaveLength(2);
    expect(stepProblems("pub", { ...e, landingUrl: "tim-management.co" })).toEqual(["La page d'arrivée doit être une adresse complète en https://."]);
    expect(stepProblems("budget", e)).toEqual(["Indiquez le budget quotidien."]);
    expect(stepProblems("budget", { ...e, totalDailyEur: 4, metaFloorEur: 5 })[0]).toMatch(/plancher/);
    expect(stepProblems("verifier", e)).toEqual([]);
  });

  it("une campagne commencée se reprend à la première étape incomplète", () => {
    expect(resumeStep(emptyDraft())).toBe("bases");
    expect(resumeStep({ ...full(), offer: "" })).toBe("offre");
    expect(resumeStep(full())).toBe("verifier");
    expect(isComplete(full())).toBe(true);
  });

  it("relit une campagne de l'API, relations en objet ou en identifiant", () => {
    const d = draftFromDoc({ id: 7, name: "X", account: { id: 2 }, brief: { audience: "A", proofs: [{ id: 3 }, 4], angles: [{ angle: "un" }, { angle: "" }] }, agentBudget: { totalDailyEur: 10 } });
    expect(d).toMatchObject({ id: 7, account: 2, audience: "A", proofs: [3, 4], angles: ["un"], totalDailyEur: 10, autonomy: "proposer" });
  });

  it("écrit le brief EN ENTIER à chaque étape du brief, et rien à la vérification", () => {
    const data = stepData("cible", { ...full(), angles: [" un ", ""] }) as { brief: Record<string, unknown> };
    expect(Object.keys(data)).toEqual(["brief"]);
    expect(data.brief).toMatchObject({ audience: "Gérants de PME du BTP", offer: "Démo de 30 minutes", landingUrl: "https://tim-management.co/pointage", angles: [{ angle: "un" }] });
    expect(stepData("bases", full())).toEqual({ name: "Pointage BTP", account: 2, objective: "leads" });
    expect(stepData("budget", full())).toMatchObject({ agentBudget: { totalDailyEur: 10 }, autonomy: "proposer" });
    expect(stepData("verifier", full())).toEqual({});
  });

  it("propose une phrase d'objectif pour le premier passage", () => {
    expect(suggestedRunObjective(full())).toBe("Obtenir des prospects auprès de : Gérants de PME du BTP, avec l'offre « Démo de 30 minutes ».");
  });
});

describe("le suivi du lancement", () => {
  const facts = (over: Partial<LaunchFacts> = {}): LaunchFacts => ({ briefComplete: true, runs: 0, lastRunStatus: null, creasToValidate: 0, creasReady: 0, publicationStatus: null, previewsSeen: false, ...over });
  const current = (f: LaunchFacts) => launchSteps(f, 7).find((s) => s.current)?.key ?? null;

  it("avance d'étape en étape, d'après ce qui a eu lieu", () => {
    expect(current(facts({ briefComplete: false }))).toBe("brief");
    expect(current(facts())).toBe("agent");
    expect(current(facts({ runs: 1, creasToValidate: 2 }))).toBe("creas");
    expect(current(facts({ runs: 1, creasReady: 2 }))).toBe("publier");
    expect(current(facts({ runs: 1, creasReady: 2, publicationStatus: "en-pause" }))).toBe("apercus");
    expect(current(facts({ runs: 1, creasReady: 2, publicationStatus: "en-pause", previewsSeen: true }))).toBe("activer");
    expect(current(facts({ runs: 1, creasReady: 2, publicationStatus: "active" }))).toBeNull();
  });

  it("en diffusion, une nouvelle créa à valider ne fait pas reculer le parcours", () => {
    expect(launchSteps(facts({ runs: 1, creasReady: 2, creasToValidate: 1, publicationStatus: "active" }), 7).every((s) => s.done)).toBe(true);
  });

  it("chaque étape mène où elle se fait", () => {
    const steps = launchSteps(facts({ briefComplete: false }), 7);
    expect(steps[0].action).toEqual({ kind: "wizard" });
    expect(steps[2].action).toEqual({ kind: "link", href: "/admin/publicite/a-valider?campagne=7" });
    expect(steps[3].action).toEqual({ kind: "tab", tab: "Diffusion" });
  });
});
