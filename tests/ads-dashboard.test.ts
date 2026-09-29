import { describe, expect, it } from "vitest";

import { accountAlert, buildAdsDashboard, deltaPct, periodDays, type DashMetric } from "@/modules/ads/lib/dashboard";
import { MOCK_ACCOUNT_ID } from "@/modules/ads/platforms/meta-mock";

const NOW = new Date("2026-09-29T08:00:00.000Z");
const acc = (id: number, over: Record<string, unknown> = {}) => ({ id, name: `Compte ${id}`, platform: "meta", externalId: `act_${id}`, status: "connecte", currency: "EUR", lastSyncAt: "2026-09-29T04:30:00.000Z", ...over });
const m = (account: number, externalId: string, day: string, spend: number, leads = 0, clicks = 0, impressions = 0): DashMetric => ({ account, platform: "meta", externalId, day, spend, leads, clicks, impressions });

describe("tableau de bord Publicité", () => {
  it("lit la période choisie, 30 jours à défaut", () => {
    expect(periodDays("7")).toBe(7);
    expect(periodDays(["90"])).toBe(90);
    expect(periodDays("12")).toBe(30);
    expect(periodDays(undefined)).toBe(30);
  });

  it("additionne la période, jour par jour sans trou, et calcule CPL et taux de clic", () => {
    const d = buildAdsDashboard({
      accounts: [acc(1)],
      campaigns: [{ id: 10, name: "C", account: 1, externalId: "c1", status: "active", objective: "leads" }],
      metrics: [m(1, "c1", "2026-09-27", 20, 2, 10, 1000), m(1, "c1", "2026-09-29", 10.5, 1, 5, 500)],
      now: NOW,
      days: 7,
    });
    expect(d.period).toMatchObject({ since: "2026-09-23", until: "2026-09-29" });
    expect(d.daily).toHaveLength(7);
    expect(d.daily.find((x) => x.day === "2026-09-28")).toEqual({ day: "2026-09-28", spend: 0, leads: 0, clicks: 0 });
    expect(d.totals).toMatchObject({ spend: 30.5, leads: 3, clicks: 15, impressions: 1500, cpl: 10.17, ctr: 1 });
    expect(d.campaigns[0]).toMatchObject({ name: "C", account: "Compte 1", spend: 30.5, cpl: 10.17, href: "/admin/collections/ad-campaigns/10" });
  });

  it("ne compte pas les comptes archivés — le compte simulé archivé sort des chiffres", () => {
    const d = buildAdsDashboard({
      accounts: [acc(1), acc(2, { status: "archive", externalId: MOCK_ACCOUNT_ID })],
      campaigns: [],
      metrics: [m(1, "c1", "2026-09-29", 10), m(2, "c2", "2026-09-29", 999)],
      now: NOW,
      days: 7,
    });
    expect(d.totals.spend).toBe(10);
    expect(d.simulated).toBe(false);
    expect(d.accounts).toMatchObject({ active: 1, archived: 1 });
  });

  it("dit quand des données simulées sont comptées", () => {
    const d = buildAdsDashboard({ accounts: [acc(1, { externalId: MOCK_ACCOUNT_ID })], campaigns: [], metrics: [], now: NOW, days: 7 });
    expect(d.simulated).toBe(true);
  });

  it("n'additionne jamais une autre devise, et le signale", () => {
    const d = buildAdsDashboard({
      accounts: [acc(1), acc(2, { name: "US", currency: "USD" })],
      campaigns: [],
      metrics: [m(1, "c1", "2026-09-29", 10), m(2, "c2", "2026-09-29", 50)],
      now: NOW,
      days: 7,
    });
    expect(d.totals.spend).toBe(10);
    expect(d.accounts.otherCurrency).toEqual(["US (USD)"]);
  });

  it("filtre par régie", () => {
    const d = buildAdsDashboard({
      accounts: [acc(1), acc(2, { platform: "google" })],
      campaigns: [],
      metrics: [m(1, "c1", "2026-09-29", 10), { ...m(2, "g1", "2026-09-29", 7), platform: "google" }],
      now: NOW,
      days: 7,
      platform: "google",
    });
    expect(d.totals.spend).toBe(7);
    expect(d.platforms).toEqual(["google", "meta"]);
  });

  it("ne compare à la période précédente que si la synchro la couvrait", () => {
    const base = { accounts: [acc(1)], campaigns: [], now: NOW, days: 7 as const };
    const partial = buildAdsDashboard({ ...base, metrics: [m(1, "c1", "2026-09-20", 5), m(1, "c1", "2026-09-29", 10)] });
    expect(partial.previous.covered).toBe(false);
    const full = buildAdsDashboard({ ...base, metrics: [m(1, "c1", "2026-09-16", 5), m(1, "c1", "2026-09-29", 10)] });
    expect(full.previous).toMatchObject({ covered: true, spend: 5 });
    expect(deltaPct(10, 5, true)).toBe(100);
    expect(deltaPct(10, 5, false)).toBeNull();
    expect(deltaPct(10, 0, true)).toBeNull();
  });
});

describe("alertes de compte", () => {
  it("du plus bloquant au plus lointain", () => {
    expect(accountAlert(acc(1, { status: "expire" }), NOW)?.tone).toBe("bad");
    expect(accountAlert(acc(1, { status: "erreur", lastError: "Meta 17" }), NOW)?.message).toMatch(/Meta 17/);
    expect(accountAlert(acc(1, { status: "sans-jeton" }), NOW)?.tone).toBe("warn");
    expect(accountAlert(acc(1, { tokenExpiresAt: "2026-10-03T08:00:00.000Z" }), NOW)?.message).toMatch(/encore 4 jour/);
    expect(accountAlert(acc(1, { lastSyncAt: "2026-09-27T04:30:00.000Z" }), NOW)?.message).toMatch(/36 h/);
    expect(accountAlert(acc(1), NOW)).toBeNull();
    expect(accountAlert(acc(1, { status: "archive" }), NOW)).toBeNull();
  });

  it("aucune alerte d'échéance avec un jeton système", () => {
    expect(accountAlert(acc(1, { tokenExpiresAt: "2026-10-01T00:00:00.000Z", systemUserToken: "••••••" }), NOW)).toBeNull();
  });
});
