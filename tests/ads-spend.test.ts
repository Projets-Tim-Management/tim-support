import { describe, expect, it } from "vitest";

import { CLAUDE_PRICES, claudeCostUsd, claudeMaxCostUsd, usdToEur } from "@/core/lib/ai-pricing";
import { costUsd } from "@/core/lib/ai-budget";
import { AdsBudgetError, assertAdsBudget, checkBudget, limitsFor, parisStart, recordAdsUsage } from "@/modules/ads/lib/spend";

describe("grille de tarifs commune", () => {
  it("l'assistant garde exactement le même coût qu'avant", () => {
    const u = { input: 10_000, output: 2_000, cacheRead: 50_000, cacheWrite: 1_000 };
    // Haiku 4.5 : 1 / 5 / 0,1 / 1,25 $ par million
    expect(costUsd(u)).toBeCloseTo((10_000 * 1 + 2_000 * 5 + 50_000 * 0.1 + 1_000 * 1.25) / 1e6, 10);
  });

  it("Opus 5.5 : 4 $ / 20 $ par million, lecture de cache 0,20 $", () => {
    expect(CLAUDE_PRICES["claude-opus-5-5"]).toMatchObject({ input: 4, output: 20, cacheRead: 0.2 });
    expect(claudeCostUsd("claude-opus-5-5", { input: 1e6, output: 1e6, cacheRead: 0, cacheWrite: 0 })).toBe(24);
  });

  it("le coût maximal compte toute la sortie autorisée au tarif de sortie", () => {
    expect(claudeMaxCostUsd("claude-opus-5-5", 5_000, 16_000)).toBeCloseTo((5_000 * 4 + 16_000 * 20) / 1e6, 10);
  });

  it("convertit en euros", () => {
    expect(usdToEur(1.1)).toBeCloseTo(1, 10);
  });
});

describe("plafonds de l'atelier", () => {
  it("lit les plafonds des garde-fous, avec les défauts du 29/09/2026", () => {
    expect(limitsFor("texte", null)).toEqual({ day: 5, month: 50 });
    expect(limitsFor("image", null)).toEqual({ month: 20 });
    expect(limitsFor("video", { videoMonthlyEur: 12 })).toEqual({ month: 12 });
  });

  it("donne aux agents leurs propres plafonds globaux (15 €/jour, 150 €/mois), pas ceux de la vidéo", () => {
    expect(limitsFor("agent", null)).toEqual({ day: 15, month: 150 });
    expect(limitsFor("agent", { agentDailyEur: 8, agentMonthlyEur: 90, videoMonthlyEur: 12 })).toEqual({ day: 8, month: 90 });
  });

  it("refuse un appel dont le coût MAXIMAL dépasse le reste du jour", () => {
    const r = checkBudget({ day: 5, month: 50 }, { day: 4.8, month: 10 }, 0.3);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.reason).toMatch(/Plafond du jour/);
  });

  it("refuse au plafond du mois, même si le jour a de la marge", () => {
    const r = checkBudget({ day: 5, month: 50 }, { day: 0, month: 49.9 }, 0.3);
    expect(!r.ok && r.reason).toMatch(/Plafond du mois/);
  });

  it("accepte, et dit ce qui reste", () => {
    expect(checkBudget({ month: 20 }, { day: 0, month: 5 }, 0.04)).toEqual({ ok: true, remainingDay: null, remainingMonth: 15 });
  });

  it("compte les jours et les mois à l'heure de Paris, été comme hiver", () => {
    // 29/09 à 23 h 30 UTC = 30/09 à 1 h 30 à Paris (été, UTC+2)
    expect(parisStart(new Date("2026-09-29T23:30:00Z"), "day").toISOString()).toBe("2026-09-29T22:00:00.000Z");
    expect(parisStart(new Date("2026-09-15T10:00:00Z"), "month").toISOString()).toBe("2026-08-31T22:00:00.000Z");
    // Hiver, UTC+1
    expect(parisStart(new Date("2026-12-10T10:00:00Z"), "day").toISOString()).toBe("2026-12-09T23:00:00.000Z");
  });
});

function fakePayload(settings: Record<string, unknown>, rows: { kind: string; eur: number; createdAt: string }[] = []) {
  const created: Record<string, unknown>[] = [];
  const payload = {
    findGlobal: async () => settings,
    find: async ({ where }: { where: { and: [{ kind: { equals: string } }, { createdAt: { greater_than_equal: string } }] } }) => ({
      docs: rows.filter((r) => r.kind === where.and[0].kind.equals && r.createdAt >= where.and[1].createdAt.greater_than_equal),
    }),
    create: async ({ data }: { data: Record<string, unknown> }) => (created.push(data), data),
  };
  return { payload: payload as never, created };
}

describe("contrôle avant l'appel", () => {
  const NOW = new Date("2026-09-29T10:00:00Z");

  it("interrupteur général coupé : aucune génération ne part", async () => {
    const { payload } = fakePayload({ enabled: false });
    await expect(assertAdsBudget(payload, "texte", 0.01, NOW)).rejects.toThrow(AdsBudgetError);
    await expect(assertAdsBudget(payload, "texte", 0.01, NOW)).rejects.toThrow(/Interrupteur/);
  });

  it("additionne les dépenses du jour et du mois depuis le registre", async () => {
    const { payload } = fakePayload({ enabled: true, textDailyEur: 1 }, [
      { kind: "texte", eur: 0.9, createdAt: "2026-09-29T08:00:00.000Z" },
      { kind: "image", eur: 5, createdAt: "2026-09-29T08:00:00.000Z" },
    ]);
    await expect(assertAdsBudget(payload, "texte", 0.2, NOW)).rejects.toThrow(/Plafond du jour/);
    await expect(assertAdsBudget(payload, "texte", 0.05, NOW)).resolves.toMatchObject({ ok: true });
  });

  it("inscrit le coût réellement facturé, en dollars et en euros", async () => {
    const { payload, created } = fakePayload({});
    await recordAdsUsage(payload, { kind: "texte", provider: "anthropic", model: "claude-opus-5-5", usd: 0.11, campaign: 4, detail: "3 angles" });
    expect(created[0]).toMatchObject({ kind: "texte", usd: 0.11, eur: 0.1, campaign: 4 });
  });
});
