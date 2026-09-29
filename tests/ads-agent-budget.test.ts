import { describe, expect, it } from "vitest";

import {
  availableEur,
  canReserve,
  canSpend,
  metaDayCap,
  metaDayStatus,
  metaWeek,
  metaWeekCap,
  prepBudget,
  splitViolations,
} from "@/modules/ads/agent/budget";
import { zonedStart } from "@/modules/ads/lib/zoned";

const TZ = "Europe/Paris";
// Semaine de Meta du dimanche 4 au samedi 10 octobre 2026 (heure d'été, sans changement d'heure).
const SUNDAY = new Date("2026-10-03T22:00:00Z"); // dimanche 4/10, 0 h à Paris
const WED_NOON = new Date("2026-10-07T10:00:00Z"); // mercredi 7/10, 12 h à Paris
const WED_15H = new Date("2026-10-07T13:00:00Z"); // mercredi 7/10, 15 h à Paris

describe("semaine de Meta : du dimanche au samedi, dans le fuseau du compte", () => {
  it("commence le dimanche à minuit local et finit le dimanche suivant", () => {
    const w = metaWeek(WED_NOON, TZ);
    expect(w.start.toISOString()).toBe(SUNDAY.toISOString());
    expect(w.end.toISOString()).toBe("2026-10-10T22:00:00.000Z");
  });

  it("un dimanche matin appartient à sa propre semaine, pas à la précédente", () => {
    expect(metaWeek(new Date("2026-10-04T06:00:00Z"), TZ).start.toISOString()).toBe(SUNDAY.toISOString());
  });

  it("suit le fuseau du compte, pas Paris", () => {
    // Samedi 10/10 à 20 h à New York = dimanche 11/10 à 2 h à Paris : encore la semaine du 4 à New York.
    const at = new Date("2026-10-11T00:00:00Z");
    expect(metaWeek(at, "America/New_York").start.toISOString()).toBe("2026-10-04T04:00:00.000Z");
    expect(metaWeek(at, TZ).start.toISOString()).toBe("2026-10-10T22:00:00.000Z");
  });

  it("garde un minuit juste au passage à l'heure d'hiver (semaine du 25/10/2026)", () => {
    const w = metaWeek(new Date("2026-10-28T12:00:00Z"), TZ);
    expect(w.start.toISOString()).toBe("2026-10-24T22:00:00.000Z"); // dimanche 25/10, 0 h (heure d'été)
    expect(w.end.toISOString()).toBe("2026-10-31T23:00:00.000Z"); // dimanche 1/11, 0 h (heure d'hiver)
  });
});

describe("plafond de la semaine — les exemples de la page d'aide Meta", () => {
  it("100 € par jour toute la semaine : 700 €", () => {
    expect(metaWeekCap({ segment: { kind: "semaine", from: SUNDAY, dailyBudget: 100 }, timeZone: TZ })).toBe(700);
  });

  it("avec le partage du budget entre ensembles : 840 €", () => {
    expect(metaWeekCap({ segment: { kind: "semaine", from: SUNDAY, dailyBudget: 100 }, timeZone: TZ, sharing: true })).toBe(840);
  });

  it("démarrage le mercredi à midi à 50 € : 187,50 € jusqu'au samedi", () => {
    expect(metaWeekCap({ segment: { kind: "debut", from: WED_NOON, dailyBudget: 50 }, timeZone: TZ })).toBe(187.5);
  });

  it("passage de 100 € à 50 € le mercredi à midi : 212,50 € du mercredi au samedi, plus le déjà dépensé", () => {
    expect(metaWeekCap({ segment: { kind: "changement", from: WED_NOON, dailyBudget: 50 }, timeZone: TZ })).toBe(212.5);
    expect(metaWeekCap({ segment: { kind: "changement", from: WED_NOON, dailyBudget: 50 }, timeZone: TZ, spentBefore: 290 })).toBe(502.5);
  });

  it("fin le mercredi à 15 h, 50 € : 193,75 € (3,625 jours)", () => {
    expect(metaWeekCap({ segment: { kind: "semaine", from: SUNDAY, dailyBudget: 50 }, timeZone: TZ, endAt: WED_15H })).toBe(193.75);
  });

  it("une date de fin après la semaine ne change rien", () => {
    expect(metaWeekCap({ segment: { kind: "semaine", from: SUNDAY, dailyBudget: 100 }, timeZone: TZ, endAt: new Date("2026-12-31T00:00:00Z") })).toBe(700);
  });
});

describe("plafond et état d'un jour", () => {
  it("175 % du budget ; 210 % avec le partage (exemples de Meta : 175 € et 210 € pour 100 €)", () => {
    expect(metaDayCap(100)).toBe(175);
    expect(metaDayCap(100, true)).toBe(210);
  });

  it("au-dessus du budget mais sous 175 % : la tolérance de Meta, pas une alerte", () => {
    expect(metaDayStatus(90, 100)).toBe("normal");
    expect(metaDayStatus(160, 100)).toBe("tolerance");
    expect(metaDayStatus(175, 100)).toBe("tolerance");
    expect(metaDayStatus(176, 100)).toBe("depassement");
    expect(metaDayStatus(200, 100, true)).toBe("tolerance");
  });
});

describe("répartition IA / Meta d'une campagne", () => {
  const b = { totalDailyEur: 30, maxAiSharePct: 15, metaFloorEur: 5 };

  it("accepte une répartition dans les bornes", () => {
    expect(splitViolations(b, { aiDailyEur: 4.5, metaDailyEur: 25.5 })).toEqual([]);
    expect(splitViolations(b, { aiDailyEur: 0, metaDailyEur: 30 })).toEqual([]);
  });

  it("refuse une part IA au-delà du maximum, en chiffrant", () => {
    expect(splitViolations(b, { aiDailyEur: 5, metaDailyEur: 25 })).toEqual([expect.stringMatching(/Part IA de 5,00 € au-delà du maximum de 4,50 € \(15 % de 30,00 €\)/)]);
  });

  it("refuse une dépense Meta sous le plancher, et un total dépassé", () => {
    expect(splitViolations(b, { aiDailyEur: 1, metaDailyEur: 4 })).toEqual([expect.stringMatching(/sous le plancher/)]);
    expect(splitViolations(b, { aiDailyEur: 4, metaDailyEur: 27 })).toEqual([expect.stringMatching(/au-delà du total/)]);
  });
});

describe("budget d'un passage de préparation", () => {
  const caps = { prepMaxEur: 5, dailyEur: 15, monthlyEur: 150 };

  it("5 € quand les plafonds globaux ont de la place", () => {
    expect(prepBudget(caps, { day: 0, month: 0 })).toEqual({ ok: true, budgetEur: 5 });
  });

  it("jamais plus que ce qui reste du jour ou du mois", () => {
    expect(prepBudget(caps, { day: 12, month: 20 })).toEqual({ ok: true, budgetEur: 3 });
    expect(prepBudget(caps, { day: 0, month: 148.2 })).toEqual({ ok: true, budgetEur: 1.8 });
  });

  it("refuse de lancer sous 0,50 €, en disant quel plafond bloque", () => {
    expect(prepBudget(caps, { day: 14.8, month: 40 })).toEqual({ ok: false, reason: expect.stringMatching(/du jour \(14,80 € sur 15,00 €\)/) });
    expect(prepBudget(caps, { day: 2, month: 150 })).toEqual({ ok: false, reason: expect.stringMatching(/du mois/) });
  });
});

describe("réservation d'agent en agent", () => {
  const orchestrator = { budgetEur: 5, spentEur: 0.6, reservedForChildrenEur: 3 };

  it("ce qui reste = budget − dépensé − réservé aux enfants", () => {
    expect(availableEur(orchestrator)).toBe(1.4);
  });

  it("la somme des enfants ne dépasse jamais le budget du parent", () => {
    expect(canReserve(orchestrator, 1.4)).toBe(true);
    expect(canReserve(orchestrator, 1.5)).toMatch(/il reste 1,40 € à répartir/);
    expect(canReserve(orchestrator, 0)).toMatch(/positif/);
  });

  it("un appel ne part que si son coût MAXIMAL tient dans ce qui reste", () => {
    expect(canSpend(orchestrator, 1.4)).toBe(true);
    expect(canSpend(orchestrator, 1.41)).toMatch(/jusqu'à 1,41 €/);
  });
});

describe("minuits locaux (commun aux plafonds de Paris et à la semaine de Meta)", () => {
  it("le 1er du mois et le jour, à Paris, été comme hiver", () => {
    expect(zonedStart(new Date("2026-09-15T10:00:00Z"), "month", TZ).toISOString()).toBe("2026-08-31T22:00:00.000Z");
    expect(zonedStart(new Date("2026-12-10T10:00:00Z"), "day", TZ).toISOString()).toBe("2026-12-09T23:00:00.000Z");
  });
});
