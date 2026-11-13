import { describe, expect, it } from "vitest";

import { classifyFailure, nextFailureState, providerLabel } from "@/core/lib/api-health";

describe("API en panne : le genre d'un échec", () => {
  it("le paiement passe avant l'accès (Perplexity répond 403 « requires paid credits »)", () => {
    expect(classifyFailure("Perplexity : clé refusée — The Agent API requires paid credits. Add credits at https://console.perplexity.ai.", 403)).toBe("paiement");
    expect(classifyFailure("400 Your credit balance is too low to access the Anthropic API.")).toBe("paiement");
    expect(classifyFailure("You exceeded your current quota, please check your plan and billing details.", 429)).toBe("paiement");
    expect(classifyFailure("erreur", 402)).toBe("paiement");
    expect(classifyFailure("Gemini : erreur 403 — BILLING_DISABLED")).toBe("paiement");
  });

  it("clé ou jeton refusé, expiré, révoqué", () => {
    expect(classifyFailure("Incorrect API key provided", 401)).toBe("acces");
    expect(classifyFailure("OAuth (400) : invalid_grant")).toBe("acces");
    expect(classifyFailure("Meta : Error validating access token: Session has expired")).toBe("acces");
    expect(classifyFailure("Search Console : accès refusé — la clé est invalide.")).toBe("acces");
  });

  it("surcharges, délais et coupures : passagers ; le reste : autre", () => {
    expect(classifyFailure("Overloaded", 529)).toBe("passager");
    expect(classifyFailure("Rate limit reached", 429)).toBe("passager");
    expect(classifyFailure("The operation was aborted due to timeout")).toBe("passager");
    expect(classifyFailure("fetch failed")).toBe("passager");
    expect(classifyFailure("Réponse inattendue du modèle")).toBe("autre");
  });
});

describe("API en panne : quand alerter et écrire", () => {
  const now = new Date("2026-11-13T10:00:00Z");
  const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000).toISOString();

  it("paiement ou accès : alerte et e-mail tout de suite, puis un e-mail par jour au plus", () => {
    expect(nextFailureState(null, "paiement", now)).toMatchObject({ status: "en-panne", kind: "paiement", email: true, failures: 1 });
    const row = { status: "en-panne", failures: 1, firstFailedAt: hoursAgo(2), emailedAt: hoursAgo(2) };
    expect(nextFailureState(row, "paiement", now)).toMatchObject({ email: false, failures: 2, firstFailedAt: hoursAgo(2) });
    expect(nextFailureState({ ...row, emailedAt: hoursAgo(25) }, "acces", now)).toMatchObject({ email: true });
  });

  it("le reste : seulement après 3 échecs d'affilée sur plus d'une heure", () => {
    expect(nextFailureState(null, "passager", now)).toMatchObject({ status: "en-observation", email: false });
    expect(nextFailureState(null, "autre", now)).toMatchObject({ status: "en-observation", kind: "passager", email: false });
    expect(nextFailureState({ status: "en-observation", failures: 2, firstFailedAt: hoursAgo(0.5) }, "passager", now)).toMatchObject({ status: "en-observation", email: false });
    expect(nextFailureState({ status: "en-observation", failures: 2, firstFailedAt: hoursAgo(1.5) }, "autre", now)).toMatchObject({ status: "en-panne", kind: "autre", email: true, failures: 3 });
  });

  it("une API rétablie repart de zéro", () => {
    expect(nextFailureState({ status: "retablie", failures: 0, firstFailedAt: hoursAgo(48), emailedAt: hoursAgo(1) }, "paiement", now)).toMatchObject({ failures: 1, firstFailedAt: now.toISOString(), email: true });
  });

  it("le nom affiché : la liste, sinon la carte de la connexion", () => {
    expect(providerLabel("perplexity")).toBe("Perplexity");
    expect(providerLabel("pennylane")).toBe("Pennylane");
    expect(providerLabel("inconnue")).toBe("inconnue");
  });
});
