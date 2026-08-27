import { describe, expect, it } from "vitest";

import {
  LOSS_REASONS,
  LOSS_REASON_OPTIONS,
  lossReasonLabel,
  needsLossReason,
  reasonsFor,
} from "@/modules/partner/lib/lossReason";
import { CLIENT_STATUSES } from "@/modules/partner/lib/clientStatus";

/**
 * Motif de clôture d'une opportunité.
 *
 * Ce qui compte : que le motif soit demandé aux trois statuts qui ferment une
 * affaire — et à eux seuls —, et que les choix proposés correspondent à la
 * situation. Un prospect qui n'a jamais signé et un client qui s'en va ne se
 * perdent pas pour les mêmes raisons.
 */

describe("statuts qui exigent un motif", () => {
  it("les trois fins d'opportunité", () => {
    expect(needsLossReason("perdue")).toBe(true);
    expect(needsLossReason("resilie")).toBe(true);
    expect(needsLossReason("archive")).toBe(true);
  });

  it("et aucun autre — un pipeline en cours ne se justifie pas", () => {
    const closing = new Set(["perdue", "resilie", "archive"]);
    for (const s of CLIENT_STATUSES) {
      if (!closing.has(s.value)) expect(needsLossReason(s.value)).toBe(false);
    }
    expect(needsLossReason(null)).toBe(false);
    expect(needsLossReason(undefined)).toBe(false);
  });
});

describe("motifs proposés selon la situation", () => {
  it("un prospect n'a pas de motif réservé aux clients", () => {
    const values = reasonsFor("prospect").map((r) => r.value);
    expect(values).toContain("sans-reponse");
    expect(values).toContain("prix");
    expect(values).not.toContain("peu-utilise");
    expect(values).not.toContain("support");
  });

  it("un client qui part n'a pas de motif réservé aux prospects", () => {
    const values = reasonsFor("client").map((r) => r.value);
    expect(values).toContain("peu-utilise");
    expect(values).toContain("prix");
    expect(values).not.toContain("sans-reponse");
    expect(values).not.toContain("test-non-concluant");
  });

  it("les deux listes proposent de quoi choisir sans « Autre » par défaut", () => {
    for (const scope of ["prospect", "client"] as const) {
      const list = reasonsFor(scope);
      expect(list.length).toBeGreaterThanOrEqual(8);
      expect(list.some((r) => r.value === "autre")).toBe(true);
    }
  });
});

describe("cohérence de la liste", () => {
  it("aucune valeur en double — ce sont des valeurs d'enum", () => {
    const values = LOSS_REASONS.map((r) => r.value);
    expect(new Set(values).size).toBe(values.length);
  });

  it("chaque motif appartient à au moins une situation", () => {
    for (const r of LOSS_REASONS) expect(r.scopes.length).toBeGreaterThan(0);
  });

  it("les options du champ couvrent toute la liste", () => {
    expect(LOSS_REASON_OPTIONS).toHaveLength(LOSS_REASONS.length);
    expect(lossReasonLabel("prix")).toBe("Prix trop élevé");
    expect(lossReasonLabel("inexistant")).toBeUndefined();
  });
});
