import { describe, expect, it } from "vitest";

import { decisionData, decisionError } from "@/modules/ads/lib/decide";

const complete = {
  status: "a-valider",
  copy: [
    { kind: "principal", status: "ok" },
    { kind: "titre", status: "ok" },
  ],
  assets: ["1x1", "4x5", "9x16"].map((format) => ({ format, type: "image" })),
};

describe("valider ou refuser une créa", () => {
  it("on ne décide que d'une créa en attente", () => {
    expect(decisionError({ ...complete, status: "validee" }, { decision: "validee" })).toMatch(/pas en attente/);
    expect(decisionError({ ...complete, status: "brouillon" }, { decision: "refusee", reason: "faux" })).toMatch(/pas en attente/);
  });

  it("on ne valide qu'une créa complète : textes passés et trois formats", () => {
    expect(decisionError(complete, { decision: "validee" })).toBeNull();
    expect(decisionError({ ...complete, copy: [{ kind: "principal", status: "ok" }] }, { decision: "validee" })).toMatch(/un titre/);
    expect(decisionError({ ...complete, assets: complete.assets.slice(0, 2) }, { decision: "validee" })).toMatch(/Visuel manquant : 9x16/);
  });

  it("on ne refuse qu'avec un motif de la liste", () => {
    expect(decisionError(complete, { decision: "refusee", reason: "" })).toMatch(/motif/);
    expect(decisionError(complete, { decision: "refusee", reason: "n-importe-quoi" })).toMatch(/motif/);
    expect(decisionError(complete, { decision: "refusee", reason: "mal-ecrit" })).toBeNull();
  });

  it("garde qui a décidé et quand ; le motif seulement pour un refus", () => {
    const now = new Date("2026-09-29T12:00:00Z");
    expect(decisionData({ decision: "validee" }, 1, now)).toEqual({ status: "validee", decidedBy: 1, decidedAt: now.toISOString(), refusalReason: null, refusalDetail: null });
    expect(decisionData({ decision: "refusee", reason: "faux", detail: "  le chiffre date  " }, 1, now)).toMatchObject({ status: "refusee", refusalReason: "faux", refusalDetail: "le chiffre date" });
  });
});
