import { describe, expect, it } from "vitest";

import { historyPolicy, nextHistory, rebaseHistory, type HistoryEntry } from "@/modules/partner/lib/history";

/**
 * L'historique mensuel ne raconte que la facturation : rien tant que l'affaire
 * n'est pas gagnée, rien avant le démarrage, et jamais de perte de ce qu'on
 * savait — juste un recalage sur la bonne date.
 */

const NOW = new Date("2026-09-15T10:00:00.000Z");
const detail = (qty: number) => [{ key: "admin", label: "Admin", qty, price: 39, subtotal: qty * 39 }];
const entry = (qty: number) => ({ totalLicences: qty, caHT: qty * 39, commission: 0, commissionRate: 0, detail: detail(qty) });
const line = (at: string, qty: number): HistoryEntry => ({ at, ...entry(qty) });

describe("qui a droit à un historique", () => {
  it("gagné : on écrit ; résilié / archivé : on garde ; le reste : rien", () => {
    expect(historyPolicy("actif")).toBe("write");
    expect(historyPolicy("resilie")).toBe("keep");
    expect(historyPolicy("archive")).toBe("keep");
    expect(historyPolicy("en-test")).toBe("none");
    expect(historyPolicy("attente-engagement")).toBe("none");
    expect(historyPolicy("perdue")).toBe("none");
    expect(historyPolicy(null)).toBe("none");
  });

  it("un prospect qui saisit des licences ne stocke rien, même s'il en avait", () => {
    const prev = [line("2026-07-01T00:00:00.000Z", 5)];
    expect(nextHistory(prev, { clientStatus: "en-test", billingStart: null, now: NOW, entry: entry(6), freshStamp: false })).toEqual([]);
  });

  it("un résilié garde son historique tel quel", () => {
    const prev = [line("2026-07-01T00:00:00.000Z", 5)];
    const out = nextHistory(prev, { clientStatus: "resilie", billingStart: "2026-07-01", now: NOW, entry: entry(0), freshStamp: false });
    expect(out.map((e) => [e.at, e.totalLicences])).toEqual([["2026-07-01T00:00:00.000Z", 5]]);
  });

  it("gagné sans date de démarrage : rien de nouveau, on attend la date", () => {
    expect(nextHistory([], { clientStatus: "actif", billingStart: null, now: NOW, entry: entry(3), freshStamp: false })).toEqual([]);
  });
});

describe("recalage sur le démarrage de la facturation", () => {
  it("reporte le dernier état connu sur le mois de démarrage, et oublie les mois d'avant", () => {
    const prev = [line("2026-07-01T00:00:00.000Z", 51), line("2026-09-01T00:00:00.000Z", 46)];
    expect(rebaseHistory(prev, "2026-10-04").map((e) => [e.at!.slice(0, 7), e.totalLicences])).toEqual([["2026-10", 46]]);
  });

  it("garde les mois à partir du démarrage, et comble le premier s'il manque", () => {
    const prev = [line("2026-07-01T00:00:00.000Z", 10), line("2026-11-01T00:00:00.000Z", 12)];
    expect(rebaseHistory(prev, "2026-10-04").map((e) => [e.at!.slice(0, 7), e.totalLicences])).toEqual([
      ["2026-10", 10],
      ["2026-11", 12],
    ]);
  });
});

describe("écriture d'une ligne", () => {
  it("date la première ligne du mois de démarrage quand il est à venir", () => {
    const out = nextHistory([], { clientStatus: "actif", billingStart: "2026-10-04", now: NOW, entry: entry(3), freshStamp: false });
    expect(out.map((e) => [e.at, e.totalLicences])).toEqual([["2026-10-01T00:00:00.000Z", 3]]);
  });

  it("met à jour la ligne du mois si la config change, sinon n'ajoute rien", () => {
    const first = nextHistory([], { clientStatus: "actif", billingStart: "2026-07-01", now: NOW, entry: entry(3), freshStamp: false });
    expect(first.map((e) => e.at!.slice(0, 7))).toEqual(["2026-09"]);
    const same = nextHistory(first, { clientStatus: "actif", billingStart: "2026-07-01", now: NOW, entry: entry(3), freshStamp: false });
    expect(same).toEqual(first);
    const changed = nextHistory(first, { clientStatus: "actif", billingStart: "2026-07-01", now: NOW, entry: entry(4), freshStamp: false });
    expect(changed.map((e) => [e.at!.slice(0, 7), e.totalLicences])).toEqual([["2026-09", 4]]);
    const later = nextHistory(changed, { clientStatus: "actif", billingStart: "2026-07-01", now: new Date("2026-11-03T00:00:00.000Z"), entry: entry(5), freshStamp: false });
    expect(later.map((e) => [e.at!.slice(0, 7), e.totalLicences])).toEqual([["2026-09", 4], ["2026-11", 5]]);
  });

  it("rafraîchit le tampon Pennylane de la dernière ligne quand la lecture est fraîche", () => {
    const stamp = { start: "2026-10-04", ok: true, checkedAt: NOW.toISOString() };
    const prev = [{ ...line("2026-10-01T00:00:00.000Z", 3), pennylane: { start: "2026-10-04", ok: false, checkedAt: "2026-09-01T00:00:00.000Z" } }];
    const out = nextHistory(prev, { clientStatus: "actif", billingStart: "2026-10-04", now: NOW, entry: entry(3), stamp, freshStamp: true });
    expect(out[0].pennylane).toEqual(stamp);
    // Sans lecture fraîche, le tampon connu reste.
    const kept = nextHistory(prev, { clientStatus: "actif", billingStart: "2026-10-04", now: NOW, entry: entry(3), freshStamp: false });
    expect(kept[0].pennylane?.ok).toBe(false);
  });
});
