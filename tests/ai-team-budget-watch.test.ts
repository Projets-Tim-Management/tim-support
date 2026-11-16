import { describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/lib/spend", () => ({ spentOf: vi.fn(async () => ({ day: 2, month: 42 })) }));

import { BUDGET_URL, budgetAlert, budgetOutlook, suggestedBudget, watchTeamBudget } from "@/modules/ai-team/lib/budget-watch";
import { safeRequestUrl } from "@/modules/ai-team/lib/requests";

// Le 12 novembre 2026, midi à Paris : 12 jours écoulés sur 30.
const NOW = new Date("2026-11-12T11:00:00Z");

describe("Budget IA de l'équipe SEA : un plafond, pas une enveloppe", () => {
  it("calcule le rythme et la projection, jours de Paris", () => {
    const o = budgetOutlook({ budgetEur: 50, spentEur: 12, now: NOW });
    expect(o).toMatchObject({ daysElapsed: 12, daysInMonth: 30, daysLeft: 18, perDayEur: 1, projectedEur: 30, usedPct: 24, level: "ok" });
    // Le 1er à 0 h 30 à Paris, c'est encore le 31 octobre en UTC : le compte suit Paris.
    expect(budgetOutlook({ budgetEur: 50, spentEur: 1, now: new Date("2026-10-31T23:30:00Z") }).daysElapsed).toBe(1);
  });

  it("distingue projection au-dessus, alerte à 80 % et plafond atteint", () => {
    expect(budgetOutlook({ budgetEur: 50, spentEur: 25, now: NOW }).level).toBe("projection-au-dessus");
    expect(budgetOutlook({ budgetEur: 50, spentEur: 40, now: NOW }).level).toBe("alerte");
    expect(budgetOutlook({ budgetEur: 50, spentEur: 50, now: NOW }).level).toBe("atteint");
    // Un appel refusé par le plafond : atteint, même un peu en dessous.
    expect(budgetOutlook({ budgetEur: 50, spentEur: 48, now: NOW, blocked: true }).level).toBe("atteint");
  });

  it("ne dépose rien sous 80 %, et propose de quoi finir le mois au-dessus", () => {
    expect(budgetAlert(budgetOutlook({ budgetEur: 50, spentEur: 25, now: NOW }), NOW, "Margaux")).toBeNull();
    const o = budgetOutlook({ budgetEur: 50, spentEur: 42, now: NOW });
    expect(suggestedBudget(o)).toBe(110); // 3,50 €/jour × 30 jours = 105 € → 110 €
    const a = budgetAlert(o, NOW, "Margaux")!;
    expect(a.title).toBe("Budget IA de novembre : 80 % du plafond atteint");
    expect(a.kind).toBe("a-faire");
    expect(safeRequestUrl(a.url)).toBe(BUDGET_URL);
    expect(a.steps.join(" ")).toMatch(/110 €/);
    const stop = budgetAlert(budgetOutlook({ budgetEur: 50, spentEur: 50, now: NOW }), NOW, "Margaux")!;
    expect(stop.title).toMatch(/atteint : l'équipe SEA est à l'arrêt/);
  });

  it("dépose l'alerte une seule fois par mois, et ne lève jamais", async () => {
    const created: unknown[] = [];
    const titles = new Set<string>();
    const payload = {
      find: async () => ({ docs: [{ id: 7, name: "Margaux", monthlyAiBudgetEur: 50 }] }),
      count: async ({ where }: { where: { and: { title?: { equals: string } }[] } }) => ({ totalDocs: titles.has(where.and[1].title!.equals) ? 1 : 0 }),
      create: async ({ data }: { data: { title: string } }) => {
        titles.add(data.title);
        created.push(data);
        return { id: created.length };
      },
      logger: { warn: () => {} },
    };
    expect(await watchTeamBudget(payload as never, { now: NOW })).toBe("deposee");
    expect(await watchTeamBudget(payload as never, { now: NOW })).toBe("rien");
    expect(created).toHaveLength(1);
    // Sans budget fixé : rien ; une base qui casse : rien, sans lever.
    expect(await watchTeamBudget({ ...payload, find: async () => ({ docs: [{ id: 7, monthlyAiBudgetEur: null }] }) } as never, { now: NOW })).toBe("rien");
    expect(await watchTeamBudget({ ...payload, find: async () => { throw new Error("base"); } } as never, { now: NOW })).toBe("rien");
  });
});
