import { describe, expect, it } from "vitest";

import { devPriorityFromTicket, devTypeFromTicket } from "@/modules/dev/lib/fromTicket";
import { DEV_PRIORITIES, DEV_TYPES } from "@/modules/dev/lib/devMeta";

/**
 * Ouvrir un développement depuis un ticket.
 *
 * La traduction est faite pour l'utilisateur, donc elle doit tomber juste — et
 * surtout ne jamais produire une valeur que la base refuserait, ce qui bloquerait
 * la création au lieu de la faciliter.
 */

describe("nature de la demande", () => {
  it("une suggestion devient une nouvelle fonctionnalité", () => {
    expect(devTypeFromTicket("suggestion")).toBe("feature");
  });

  it("une demande d'assistance devient un bug", () => {
    expect(devTypeFromTicket("assistance")).toBe("bug");
  });

  it("le reste part en étude, faute de mieux", () => {
    expect(devTypeFromTicket("autre")).toBe("etude");
  });

  it("un type inconnu ou absent retombe sur « bug », le cas le plus fréquent", () => {
    expect(devTypeFromTicket(undefined)).toBe("bug");
    expect(devTypeFromTicket("n-importe-quoi")).toBe("bug");
  });
});

describe("urgence", () => {
  it("les quatre niveaux se correspondent", () => {
    expect(devPriorityFromTicket("urgent")).toBe("urgente");
    expect(devPriorityFromTicket("high")).toBe("haute");
    expect(devPriorityFromTicket("normal")).toBe("normale");
    expect(devPriorityFromTicket("low")).toBe("basse");
  });

  it("sans priorité, on n'invente pas d'urgence", () => {
    expect(devPriorityFromTicket(null)).toBe("normale");
  });
});

describe("les valeurs produites existent bien côté développement", () => {
  it("aucune traduction ne sort du jeu de valeurs accepté", () => {
    const types = new Set(DEV_TYPES.map((t) => t.value));
    const priorities = new Set(DEV_PRIORITIES.map((p) => p.value));
    for (const t of ["suggestion", "assistance", "autre", "inconnu"]) {
      expect(types.has(devTypeFromTicket(t))).toBe(true);
    }
    for (const p of ["urgent", "high", "normal", "low", "inconnu"]) {
      expect(priorities.has(devPriorityFromTicket(p))).toBe(true);
    }
  });
});
