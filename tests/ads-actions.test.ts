import { describe, expect, it } from "vitest";

import { actionSummary, judgeAction, readAction, type Action, type GuardContext } from "@/modules/ads/lib/actions";

const NOW = new Date("2026-11-20T08:00:00Z");
const days = (n: number) => new Date(NOW.getTime() - n * 86_400_000);
const ctx = (over: Partial<GuardContext> = {}): GuardContext => ({
  settings: { enabled: true, maxBudgetChangePct: 20, minHoursBetweenChanges: 72 },
  autonomy: "autonome",
  now: NOW,
  lastChangeAt: null,
  activatedAt: days(30),
  floorEur: 5,
  monthlyCapEur: 1000,
  monthSpentEur: 400,
  accountDailyEur: 20,
  daysLeftInMonth: 10,
  ...over,
});
const budget = (fromEur: number, toEur: number): Action => ({ kind: "budget", level: "adset", externalId: "120000001", name: "Conducteurs", fromEur, toEur });

describe("les garde-fous d'une action", () => {
  it("dans les bornes, une campagne autonome exécute ; en « proposer », ça attend Charlie", () => {
    expect(judgeAction(budget(20, 23), ctx()).outcome).toBe("executer");
    expect(judgeAction(budget(20, 23), ctx({ autonomy: "proposer" })).outcome).toBe("proposer");
  });

  it("au-delà de ±20 %, toujours à la main, même autonome", () => {
    expect(judgeAction(budget(20, 30), ctx())).toMatchObject({ outcome: "proposer", reasons: [expect.stringMatching(/50 %/)] });
    expect(judgeAction(budget(20, 10), ctx()).outcome).toBe("proposer");
  });

  it("bloque : interrupteur coupé, observation, gel des 7 jours, moins de 72 h, plancher, plafond du mois", () => {
    expect(judgeAction(budget(20, 22), ctx({ settings: { enabled: false, maxBudgetChangePct: 20, minHoursBetweenChanges: 72 } })).reasons[0]).toMatch(/Interrupteur/);
    expect(judgeAction(budget(20, 22), ctx({ autonomy: "observer" })).reasons[0]).toMatch(/observation/);
    expect(judgeAction(budget(20, 22), ctx({ activatedAt: days(3) })).reasons[0]).toMatch(/Gel des 7/);
    expect(judgeAction(budget(20, 22), ctx({ lastChangeAt: days(2) })).reasons[0]).toMatch(/moins de 72 h/);
    expect(judgeAction(budget(6, 4), ctx()).reasons[0]).toMatch(/plancher/);
    expect(judgeAction(budget(20, 24), ctx({ monthSpentEur: 980 })).reasons[0]).toMatch(/plafond du compte/);
  });

  it("une pub refusée se met en pause quel que soit le mode, même gelée ou modifiée récemment", () => {
    const urgent: Action = { kind: "pause", level: "ad", externalId: "120000002", name: "C12", urgence: true };
    expect(judgeAction(urgent, ctx({ autonomy: "observer", activatedAt: days(1), lastChangeAt: days(0.1) })).outcome).toBe("executer");
  });

  it("réactiver une campagne entière se valide à la main ; une publicité, non", () => {
    expect(judgeAction({ kind: "activation", level: "campaign", externalId: "120000003", name: "X" }, ctx()).outcome).toBe("proposer");
    expect(judgeAction({ kind: "activation", level: "ad", externalId: "120000004", name: "C12" }, ctx()).outcome).toBe("executer");
  });
});

describe("lire et dire une action", () => {
  it("vérifie le niveau, l'identifiant Meta, les montants", () => {
    expect(readAction({ kind: "budget", level: "adset", externalId: "120000001", name: "A", fromEur: 20, toEur: 23.456 })).toMatchObject({ toEur: 23.46 });
    expect(readAction({ kind: "budget", level: "ad", externalId: "120000001", fromEur: 1, toEur: 2 })).toBeNull();
    expect(readAction({ kind: "pause", level: "ad", externalId: "abc" })).toBeNull();
  });
  it("se résume en une phrase", () => {
    expect(actionSummary(budget(20, 23))).toBe("Budget de l'ensemble « Conducteurs » : 20.00 € → 23.00 € par jour");
    expect(actionSummary({ kind: "pause", level: "ad", externalId: "1", name: "C12", urgence: true })).toBe("Urgence — mettre en pause la publicité « C12 »");
  });
});
