import { describe, expect, it } from "vitest";

import { buildBillingAnalytics, type ClientDoc } from "@/modules/analytics/lib/billing";
import type { BillingReport, ClientCheck } from "@/modules/partner/lib/billing-check";

/**
 * Analyse de la facturation : les chiffres de l'écran « Analyses → Facturation ».
 * Seuls les clients gagnés dont le contrat a commencé comptent ; le reste est
 * du pipeline, pas du CA.
 */

const NOW = new Date("2026-09-15T08:00:00.000Z");

const client = (over: Partial<ClientDoc> & { id: number; companyName: string }): ClientDoc => ({
  clientStatus: "actif",
  contractStartDate: "2026-04-01",
  partner: 1,
  paymentMethod: "prelevement-gocardless",
  billingPeriod: "mensuelle",
  licences: {},
  history: [],
  ...over,
});

const PARTNERS = [
  { id: 1, displayName: "Avizeo", commissionRate: 20 },
  { id: 2, displayName: "Bâti Conseil", commissionRate: 10 },
];

const check = (id: number, name: string, over: Partial<ClientCheck> = {}): ClientCheck =>
  ({
    client: { id, name, siren: null, clientStatus: "actif", paymentMethod: null, paymentTerms: null },
    match: "siren",
    pennylane: null,
    rows: [],
    extraLines: [],
    totals: { supportQty: 0, supportHT: 0, plQty: 0, plHT: 0 },
    issues: [],
    verdict: "ok",
    invoices: [],
    latePayments: [],
    months: [],
    ...over,
  }) as ClientCheck;

const report = (checks: ClientCheck[]): BillingReport => ({
  fetchedAt: NOW.toISOString(),
  checks,
  orphans: [],
  summary: { total: checks.length, ok: 0, ecart: 0, sansAbonnement: 0, nonRapproche: 0, orphans: 0, latePayments: 0, lateAmount: 0 },
});

describe("KPI et répartitions", () => {
  it("compte les clients gagnés sous contrat, et distingue ceux qui démarrent plus tard", () => {
    const a = buildBillingAnalytics(
      [
        client({ id: 1, companyName: "A", licences: { adminQty: 1, adminPrice: 39 } }),
        client({ id: 2, companyName: "Prospect", clientStatus: "en-test", licences: { adminQty: 5, adminPrice: 39 } }),
        client({ id: 3, companyName: "Futur", contractStartDate: "2026-10-01", licences: { adminQty: 5, adminPrice: 39 } }),
        client({ id: 4, companyName: "Sans date", contractStartDate: null, licences: { adminQty: 5, adminPrice: 39 } }),
      ],
      PARTNERS,
      null,
      6,
      NOW,
    );
    expect(a.kpis).toMatchObject({ mrr: 234, clients: 2, licences: 6, startingSoon: 1, nextStart: "2026-10-01" });
    expect(a.clients.map((c) => c.name)).toEqual(["Futur", "A"]);
    // Le futur ne pèse pas encore dans la série.
    expect(a.series.at(-1)).toMatchObject({ expected: 0, clients: 0 }); // A n'a pas d'historique
  });

  it("fait démarrer la facturation à l'abonnement Pennylane quand il existe", () => {
    // Fiche datée de 2021, abonnement Pennylane à venir le 04/10/2026 : rien avant.
    const a = buildBillingAnalytics(
      [
        client({
          id: 1,
          companyName: "Ancien",
          contractStartDate: "2021-11-04",
          licences: { adminQty: 1, adminPrice: 39 },
          history: [{ at: "2026-07-01T00:00:00.000Z", caHT: 39, totalLicences: 1 }],
        }),
      ],
      PARTNERS,
      report([
        check(1, "Ancien", {
          pennylane: { customerId: 1, customerName: "ANCIEN", regNo: null, subscriptionId: 9, subscriptionLabel: null, status: "not_started", start: "2026-10-04", nextOccurrence: "2026-10-04", paymentMethod: null, paymentConditions: null, amountHT: 39, months: 1 },
        }),
      ]),
      4,
      NOW,
    );
    expect(a.kpis).toMatchObject({ mrr: 39, clients: 1, startingSoon: 1, nextStart: "2026-10-04" });
    expect(a.clients[0].contractStart).toBe("2026-10-04");
    expect(a.series.every((p) => p.expected === 0 && p.clients === 0)).toBe(true);
    expect(a.growth.month.ca.pct).toBeNull();
  });

  it("répartit par profil avec prix effectif et catalogue, et chiffre les remises", () => {
    const a = buildBillingAnalytics(
      [
        client({ id: 1, companyName: "A", licences: { adminQty: 1, adminPrice: 39, compagnonQty: 10, compagnonPrice: 8, compagnonDiscountPct: 25 } }),
        client({ id: 2, companyName: "B", partner: 2, licences: { compagnonQty: 2, compagnonPrice: 6 } }),
      ],
      PARTNERS,
      null,
      6,
      NOW,
    );
    const compagnon = a.byProfile.find((p) => p.key === "compagnon")!;
    expect(compagnon).toMatchObject({ licences: 12, caHT: 72, avgPrice: 6, avgListPrice: 7.67, clients: 2 });
    expect(a.kpis.discounts).toBe(20);
    expect(a.discounts).toEqual([
      { clientId: 1, client: "A", profile: "Compagnon", qty: 10, listPrice: 8, price: 6, label: "− 25 %", lossPerMonth: 20 },
    ]);
  });

  it("calcule la commission de chaque partenaire à son taux", () => {
    const a = buildBillingAnalytics(
      [
        client({ id: 1, companyName: "A", licences: { adminQty: 1, adminPrice: 100 } }),
        client({ id: 2, companyName: "B", partner: { id: 2 }, licences: { adminQty: 1, adminPrice: 100 } }),
        client({ id: 3, companyName: "C", partner: null, licences: { adminQty: 1, adminPrice: 100 } }),
      ],
      PARTNERS,
      null,
      6,
      NOW,
    );
    expect(a.byPartner.map((p) => [p.name, p.caHT, p.commission])).toEqual([
      ["Avizeo", 100, 20],
      ["Bâti Conseil", 100, 10],
      ["Sans partenaire", 100, 0],
    ]);
    expect(a.kpis.commissions).toBe(30);
    expect(a.byPaymentMethod).toEqual([{ key: "prelevement-gocardless", label: "Prélèvement GoCardless", count: 3, caHT: 300 }]);
  });

  it("classe les impayés par ancienneté et les remonte sur le client", () => {
    const late = (id: number, lateDays: number, remaining: number) => ({
      id, number: `F${id}`, date: "2026-06-04", deadline: "2026-06-19", amountTTC: remaining, amountHT: remaining / 1.2,
      remaining, state: "retard" as const, lateDays, url: null,
    });
    const a = buildBillingAnalytics(
      [client({ id: 1, companyName: "A", licences: { adminQty: 1, adminPrice: 39 } })],
      PARTNERS,
      report([check(1, "A", { verdict: "ecart", latePayments: [late(1, 12, 100), late(2, 75, 50)] })]),
      6,
      NOW,
    );
    expect(a.kpis).toMatchObject({ lateCount: 2, lateAmount: 150, conformes: 0, controlled: 1 });
    expect(a.aging.map((b) => [b.key, b.count, b.caHT])).toEqual([
      ["1-30", 1, 100],
      ["31-60", 0, 0],
      ["61-90", 1, 50],
      ["90+", 0, 0],
    ]);
    expect(a.late.map((l) => l.number)).toEqual(["F2", "F1"]);
    expect(a.clients[0]).toMatchObject({ verdict: "ecart", lateCount: 2, lateAmount: 150 });
  });
});

describe("série mensuelle", () => {
  it("lit la ligne d'historique en vigueur chaque mois, face aux factures Pennylane", () => {
    const a = buildBillingAnalytics(
      [
        client({
          id: 1,
          companyName: "A",
          contractStartDate: "2026-07-01",
          licences: { adminQty: 2, adminPrice: 39 },
          history: [
            { at: "2026-06-01T00:00:00.000Z", caHT: 39, totalLicences: 1 },
            { at: "2026-08-01T00:00:00.000Z", caHT: 78, totalLicences: 2 },
          ],
        }),
      ],
      PARTNERS,
      report([
        check(1, "A", {
          invoices: [
            { id: 1, number: "F1", date: "2026-07-04", deadline: null, amountTTC: 46.8, amountHT: 39, remaining: 0, state: "payee", lateDays: 0, url: null },
            { id: 2, number: "F2", date: "2026-08-04", deadline: null, amountTTC: 93.6, amountHT: 78, remaining: 93.6, state: "retard", lateDays: 20, url: null },
            { id: 3, number: "F3", date: "2026-08-20", deadline: null, amountTTC: 12, amountHT: 10, remaining: 0, state: "annulee", lateDays: 0, url: null },
          ],
        }),
      ]),
      4,
      NOW,
    );
    expect(a.series.map((p) => [p.month.slice(0, 7), p.expected, p.invoiced, p.paid, p.clients])).toEqual([
      ["2026-06", 0, 0, 0, 0], // contrat pas commencé
      ["2026-07", 39, 39, 46.8, 1],
      ["2026-08", 78, 78, 0, 1], // l'avoir annulé ne compte pas
      ["2026-09", 78, 0, 0, 1],
    ]);
    expect(a.period).toMatchObject({ months: 4, from: "2026-06-01T00:00:00.000Z", to: "2026-09-01T00:00:00.000Z" });
  });

  it("sort un client résilié de la série à partir de sa résiliation", () => {
    const a = buildBillingAnalytics(
      [
        client({
          id: 1,
          companyName: "A",
          contractStartDate: "2026-01-01",
          resiliationDate: "2026-08-15",
          history: [{ at: "2026-01-01T00:00:00.000Z", caHT: 50, totalLicences: 1 }],
        }),
      ],
      PARTNERS,
      null,
      3,
      NOW,
    );
    // Toujours « actif » côté statut ici, mais la date de résiliation prime pour les mois suivants.
    expect(a.series.map((p) => [p.month.slice(0, 7), p.expected])).toEqual([
      ["2026-07", 50],
      ["2026-08", 50],
      ["2026-09", 0],
    ]);
  });
});

describe("évolution", () => {
  it("compare mois, trimestre et année — flux pour le CA, stock pour licences et clients", () => {
    // 25 mois : CA 100 €/mois les 12 premiers, puis 110, et un saut à 121 le dernier mois.
    const clients: ClientDoc[] = [
      client({
        id: 1,
        companyName: "A",
        contractStartDate: "2024-01-01",
        history: [
          { at: "2024-01-01T00:00:00.000Z", caHT: 100, totalLicences: 10 },
          { at: "2025-09-01T00:00:00.000Z", caHT: 110, totalLicences: 11 },
          { at: "2026-09-01T00:00:00.000Z", caHT: 121, totalLicences: 12 },
        ],
      }),
    ];
    const g = buildBillingAnalytics(clients, PARTNERS, null, 6, NOW).growth;
    expect(g.month.ca).toEqual({ current: 121, previous: 110, pct: 10 });
    expect(g.month.licences).toEqual({ current: 12, previous: 11, pct: 9.09 });
    // Trimestre : juil.–sept. 2026 (110 + 110 + 121) contre avr.–juin (3 × 110).
    expect(g.quarter.ca).toEqual({ current: 341, previous: 330, pct: 3.33 });
    // Année : oct. 2025 → sept. 2026 (11 × 110 + 121) contre oct. 2024 → sept. 2025 (11 × 100 + 110).
    expect(g.year.ca).toEqual({ current: 1331, previous: 1210, pct: 10 });
    expect(g.year.licences).toEqual({ current: 12, previous: 11, pct: 9.09 });
  });

  it("ne fabrique pas de pourcentage sans période précédente", () => {
    const g = buildBillingAnalytics(
      [client({ id: 1, companyName: "A", contractStartDate: "2026-09-01", history: [{ at: "2026-09-01T00:00:00.000Z", caHT: 50, totalLicences: 2 }] })],
      PARTNERS,
      null,
      6,
      NOW,
    ).growth;
    expect(g.month.ca).toEqual({ current: 50, previous: 0, pct: null });
    expect(g.year.clients).toEqual({ current: 1, previous: 0, pct: null });
  });
});
