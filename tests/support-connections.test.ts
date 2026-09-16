import { describe, expect, it } from "vitest";

import { SUPPORT_CONNECTIONS, connectionEnv, envState, isConfigured } from "@/core/lib/support-connections";

/**
 * L'écran « Connexions du support » lit les variables d'environnement pour
 * dire ce qui est posé — sans jamais montrer une valeur. C'est la promesse
 * qu'il faut tenir : une clé ne doit pas fuir par cet écran.
 */
const pennylane = SUPPORT_CONNECTIONS.find((c) => c.key === "pennylane")!;

describe("l'état d'une variable", () => {
  it("dit posée / manquante, et ne montre que les quatre derniers caractères", () => {
    const v = { name: "X", required: true, hint: "" };
    expect(envState(v, { X: "sk_live_1234567890abcdef" })).toMatchObject({ set: true, tail: "…cdef" });
    expect(envState(v, { X: "" })).toMatchObject({ set: false, tail: null });
    expect(envState(v, {})).toMatchObject({ set: false, tail: null });
  });

  it("ne laisse aucune queue à une valeur courte — quatre caractères sur huit, c'est la moitié du secret", () => {
    expect(envState({ name: "X", required: true, hint: "" }, { X: "abcd1234" })).toMatchObject({ set: true, tail: null });
  });
});

describe("une connexion configurée", () => {
  it("exige seulement ses variables obligatoires", () => {
    expect(isConfigured(pennylane, { PENNYLANE_API_TOKEN: "tok_xxxxxxxxxxxxxxxx" })).toBe(true);
    expect(isConfigured(pennylane, { PENNYLANE_API_BASE: "https://x" })).toBe(false);
  });

  it("liste chaque variable avec son état", () => {
    const env = connectionEnv(pennylane, { PENNYLANE_API_TOKEN: "tok_xxxxxxxxxxxxxxxx" });
    expect(env.map((v) => [v.name, v.set])).toEqual([
      ["PENNYLANE_API_TOKEN", true],
      ["PENNYLANE_API_BASE", false],
    ]);
  });
});

describe("la table des connexions", () => {
  it("nomme chaque variable une seule fois, avec une doc et un test", () => {
    const names = SUPPORT_CONNECTIONS.flatMap((c) => c.env.map((v) => v.name));
    expect(new Set(names).size).toBe(names.length);
    for (const c of SUPPORT_CONNECTIONS) {
      expect(c.docUrl).toMatch(/^https:\/\//);
      expect(c.testLabel).not.toBe("");
      expect(c.env.some((v) => v.required)).toBe(true);
    }
  });
});
