import { describe, expect, it } from "vitest";

import { firstActionableStep } from "@/modules/marketing/lib/journey";

/**
 * Le bouton « valider » suit la première étape qui attend UNE MAIN.
 *
 * Constaté sur SOUVET VMB le 16/09/2026 : le conseil d'usage (étape système,
 * cochée par l'envoi) était parti la veille de la règle qui le coche ; resté
 * « à faire », il verrouillait les relevés d'usage suivants, qui n'avaient
 * aucun bouton alors qu'ils étaient en retard. L'étape courante et l'étape
 * cochable ne sont donc pas toujours la même.
 */
const NOW = Date.parse("2026-09-16T08:00:00.000Z");

const steps = (states: [string, string][]) => states.map(([key, state]) => ({ key, state }));

describe("la première étape cochable", () => {
  it("est l'étape courante quand celle-ci attend quelqu'un", () => {
    expect(firstActionableStep(steps([["demande", "fait"], ["releve-j2", "a-faire"], ["releve-j7", "a-faire"]]), NOW)).toBe(1);
  });

  it("saute une étape SYSTÈME restée à faire : elle n'a pas de bouton, elle ne doit pas bloquer", () => {
    expect(
      firstActionableStep(steps([["remise-acces", "fait"], ["conseil-suivi-chantier", "a-faire"], ["releve-j2", "a-faire"]]), NOW),
    ).toBe(2);
  });

  it("saute une étape ARMÉE (compte à rebours en cours) : elle s'acquerra toute seule", () => {
    const list = [
      { key: "rdv-prise-en-main", state: "auto", autoAt: "2026-09-16T10:00:00.000Z" },
      { key: "releve-j2", state: "a-faire" },
    ];
    expect(firstActionableStep(list, NOW)).toBe(1);
  });

  it("ne saute pas une étape armée dont le délai est écoulé : elle est acquise, on passe à la suivante", () => {
    const list = [
      { key: "rdv-prise-en-main", state: "auto", autoAt: "2026-09-15T10:00:00.000Z" },
      { key: "releve-j2", state: "a-faire" },
    ];
    expect(firstActionableStep(list, NOW)).toBe(1);
  });

  it("renvoie -1 quand plus rien n'attend personne", () => {
    expect(firstActionableStep(steps([["demande", "fait"], ["conseil-check-in", "a-faire"]]), NOW)).toBe(-1);
  });
});
