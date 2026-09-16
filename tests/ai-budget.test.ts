import { describe, expect, it } from "vitest";

import { HAIKU_PRICES, addSpend, costEur, costUsd, dailyBudgetEur, summarizeSpend } from "@/core/lib/ai-budget";

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

describe("les compteurs du jour et du mois", () => {
  it("s'additionnent tant que le jour et le mois ne changent pas", () => {
    const e1 = addSpend(null, 0.01, "2026-09-16");
    const e2 = addSpend(e1, 0.02, "2026-09-16");
    expect(summarizeSpend(e2, "2026-09-16").today).toEqual({ eur: expect.closeTo(0.03, 6), questions: 2 });
    expect(summarizeSpend(e2, "2026-09-16").month).toEqual({ eur: expect.closeTo(0.03, 6), questions: 2 });
  });

  it("le lendemain, le jour repart de zéro mais le mois continue", () => {
    const e = addSpend(addSpend(null, 0.01, "2026-09-16"), 0.02, "2026-09-17");
    const s = summarizeSpend(e, "2026-09-17");
    expect(s.today).toEqual({ eur: expect.closeTo(0.02, 6), questions: 1 });
    expect(s.month).toEqual({ eur: expect.closeTo(0.03, 6), questions: 2 });
  });

  it("le mois suivant, tout repart de zéro", () => {
    const e = addSpend(null, 0.5, "2026-09-30");
    expect(summarizeSpend(e, "2026-10-01")).toMatchObject({ today: { eur: 0, questions: 0 }, month: { eur: 0, questions: 0 } });
  });

  it("une entrée d'avant le compteur mensuel se lit sans planter", () => {
    expect(summarizeSpend({ spendDay: "2026-09-16", spendEur: 0.04, spendQuestions: 3 }, "2026-09-16").month).toEqual({ eur: 0, questions: 0 });
    expect(summarizeSpend(undefined).dailyBudgetEur).toBe(10);
  });
});
