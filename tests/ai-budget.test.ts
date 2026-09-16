import { describe, expect, it } from "vitest";

import { HAIKU_PRICES, costEur, costUsd, dailyBudgetEur } from "@/core/lib/ai-budget";

/**
 * Le plafond de dépense de l'assistant : compté depuis les tokens que l'API
 * renvoie, au tarif du modèle. Une erreur ici, c'est un plafond qui ne
 * protège pas — ou qui bloque pour rien.
 */
describe("le coût d'une réponse", () => {
  it("applique le tarif de Haiku 4.5 à chaque sorte de token", () => {
    // Un million de chaque : la somme des quatre prix.
    const u = { input: 1_000_000, output: 1_000_000, cacheRead: 1_000_000, cacheWrite: 1_000_000 };
    expect(costUsd(u)).toBeCloseTo(HAIKU_PRICES.input + HAIKU_PRICES.output + HAIKU_PRICES.cacheRead + HAIKU_PRICES.cacheWrite, 6);
  });

  it("vaut quelques dixièmes de centime pour une question ordinaire", () => {
    // 400 tokens neufs, 4 300 relus du cache, 250 en sortie : le cas courant.
    const eur = costEur({ input: 400, output: 250, cacheRead: 4300, cacheWrite: 0 });
    expect(eur).toBeGreaterThan(0.001);
    expect(eur).toBeLessThan(0.005);
  });

  it("le plafond par défaut est de 10 € par jour", () => {
    expect(dailyBudgetEur()).toBe(10);
  });
});
