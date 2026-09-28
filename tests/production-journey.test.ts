import { describe, expect, it } from "vitest";

import {
  PHASE_DE_TEST_EMAILS,
  PHASE_DE_TEST_KEY,
  PHASE_DE_TEST_STEPS,
  PRODUCTION_KEY,
  PRODUCTION_STEPS,
  RETIRED_EMAIL_KEYS,
  SYSTEM_STEPS,
  STEP_VALIDATION_EFFECT,
  clientStatusForRun,
  deriveRunStatus,
  isProductionRun,
} from "@/modules/marketing/lib/journey";
import { SIGNING_STEPS } from "@/modules/partner/lib/signing";

/**
 * Deux parcours : la phase de test s'arrête à « Décision du client » ; « Je
 * continue » ouvre la « Mise en production » (devis, contrat, activation).
 */

const done = (key: string) => ({ key, state: "fait" });

describe("la phase de test s'arrête à la décision", () => {
  it("n'a plus d'étape après « Décision du client »", () => {
    expect(PHASE_DE_TEST_STEPS.at(-1)?.key).toBe("decision");
    for (const key of ["devis", "demande-contrat", "contrat", "signature", "mise-en-production"]) {
      expect(PHASE_DE_TEST_STEPS.some((s) => s.key === key), key).toBe(false);
    }
  });

  it("ne déclare plus les alertes de devis et de contrat", () => {
    for (const key of RETIRED_EMAIL_KEYS) {
      expect(PHASE_DE_TEST_EMAILS.some((e) => e.key === key), key).toBe(false);
    }
  });

  it("est gagnée par la décision « contrat », et par elle seulement", () => {
    const steps = [done("provisionnement"), done("decision")];
    expect(deriveRunStatus({ journeyKey: PHASE_DE_TEST_KEY, steps, decision: "contrat" })).toBe("gagne");
    expect(deriveRunStatus({ journeyKey: PHASE_DE_TEST_KEY, steps, decision: "prolongation" })).toBe("en-cours");
    expect(deriveRunStatus({ journeyKey: PHASE_DE_TEST_KEY, steps, decision: "abandon" })).toBe("en-cours");
  });

  it("un parcours sans clé (d'avant le second modèle) suit la règle du test", () => {
    expect(deriveRunStatus({ steps: [done("decision")], decision: "contrat" })).toBe("gagne");
  });

  it("un parcours clos le reste", () => {
    for (const previous of ["gagne", "perdu", "annule"]) {
      expect(deriveRunStatus({ steps: [], previous })).toBe(previous);
    }
  });
});

describe("la mise en production", () => {
  it("reprend les cinq étapes de la signature, puis l'activation par TIM", () => {
    expect(PRODUCTION_STEPS.map((s) => s.key)).toEqual([...SIGNING_STEPS.map((s) => s.key), "activation"]);
    expect(PRODUCTION_STEPS.at(-1)?.actor).toBe("admin");
  });

  it("constate les cinq premières (le geste est sur la fiche), valide la dernière à la main", () => {
    for (const s of SIGNING_STEPS) {
      expect(SYSTEM_STEPS[s.key]?.action?.on, s.key).toBe("client");
    }
    expect(SYSTEM_STEPS.activation).toBeUndefined();
    expect(STEP_VALIDATION_EFFECT.activation).toMatch(/Gagnée/);
  });

  it("n'a pas de calendrier", () => {
    for (const s of PRODUCTION_STEPS) expect(s.anchor ?? "aucun", s.key).toBe("aucun");
  });

  it("est en cours dès la première étape acquise, gagnée à l'activation", () => {
    const key = PRODUCTION_KEY;
    expect(deriveRunStatus({ journeyKey: key, steps: [] })).toBe("preparation");
    expect(deriveRunStatus({ journeyKey: key, steps: [done("entreprise")] })).toBe("en-cours");
    expect(deriveRunStatus({ journeyKey: key, steps: [done("contrat-signe"), done("activation")] })).toBe("gagne");
  });

  it("ses étapes se distinguent de celles du test (un fait n'arme qu'un parcours)", () => {
    const test = new Set(PHASE_DE_TEST_STEPS.map((s) => s.key));
    for (const s of PRODUCTION_STEPS) expect(test.has(s.key), s.key).toBe(false);
  });

  it("se reconnaît à sa clé", () => {
    expect(isProductionRun({ journeyKey: PRODUCTION_KEY })).toBe(true);
    expect(isProductionRun({ journeyKey: null })).toBe(false);
  });
});

describe("statut de la fiche porté par chaque parcours", () => {
  it("test gagné → « En signature », pas « Gagnée »", () => {
    expect(clientStatusForRun(PHASE_DE_TEST_KEY, "gagne")).toBe("en-signature");
    expect(clientStatusForRun(null, "en-cours")).toBe("en-test");
  });

  it("mise en production : « En signature » jusqu'à l'activation, puis « Gagnée »", () => {
    expect(clientStatusForRun(PRODUCTION_KEY, "preparation")).toBe("en-signature");
    expect(clientStatusForRun(PRODUCTION_KEY, "en-cours")).toBe("en-signature");
    expect(clientStatusForRun(PRODUCTION_KEY, "gagne")).toBe("actif");
  });

  it("une mise en production perdue ou annulée ne touche pas la fiche", () => {
    expect(clientStatusForRun(PRODUCTION_KEY, "perdu")).toBeNull();
    expect(clientStatusForRun(PRODUCTION_KEY, "annule")).toBeNull();
  });
});
