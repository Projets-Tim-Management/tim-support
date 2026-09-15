import { describe, expect, it } from "vitest";

import { buildDevAnalytics } from "@/modules/analytics/lib/dev";
import { buildPartnersAnalytics } from "@/modules/analytics/lib/partners";
import { buildSupportAnalytics } from "@/modules/analytics/lib/support";

const NOW = new Date("2026-09-15T12:00:00.000Z");
const CLIENTS = [{ id: 1, companyName: "CTSM" }, { id: 2, companyName: "ENF" }];

describe("support", () => {
  const tickets = [
    { id: 1, number: 1, subject: "Bug export", status: "resolved", priority: "urgent", type: "assistance", service: "technique", client: 1, createdAt: "2026-09-01T08:00:00.000Z", resolvedAt: "2026-09-02T08:00:00.000Z" },
    { id: 2, number: 2, subject: "Question facture", status: "resolved", priority: "normal", type: "assistance", service: "facturation", client: 1, createdAt: "2026-09-03T08:00:00.000Z", resolvedAt: "2026-09-08T08:00:00.000Z" },
    { id: 3, number: 3, subject: "Idée", status: "in_progress", priority: "low", type: "suggestion", service: "support", client: 2, createdAt: "2026-08-20T08:00:00.000Z", needsAttention: true },
    { id: 4, number: 4, subject: "Vieux", status: "resolved", priority: "normal", type: "autre", service: "autre", company: "Sans fiche", createdAt: "2026-04-01T08:00:00.000Z", resolvedAt: "2026-04-03T08:00:00.000Z" },
  ];
  const a = buildSupportAnalytics(tickets, CLIENTS, 3, NOW);

  it("mesure volume, délai de résolution et part sous 48 h", () => {
    expect(a.kpis).toMatchObject({ openNow: 1, urgentOpen: 0, avgResolutionDays: 3, medianResolutionDays: 3, under48h: 50 });
    // Le ticket d'avril tombe dans la période précédente (avril–juin) : +200 %.
    expect(a.kpis.created).toEqual({ current: 3, previous: 1, pct: 200 });
    expect(a.byService.map((s) => [s.label, s.count])).toEqual([["Technique", 1], ["Facturation", 1], ["Support", 1]]);
    expect(a.resolutionByPriority.find((p) => p.key === "urgent")).toMatchObject({ count: 1, avgDays: 1 });
  });

  it("classe les clients par tickets et liste ce qui reste ouvert par ancienneté", () => {
    expect(a.byClient.map((c) => [c.client, c.total, c.open, c.avgResolutionDays])).toEqual([["CTSM", 2, 0, 3], ["ENF", 1, 1, null]]);
    expect(a.open).toEqual([{ id: 3, number: 3, subject: "Idée", company: "ENF", status: "En cours", priority: "low", ageDays: 26.17, needsAttention: true }]);
    expect(a.monthly.map((m) => [m.month.slice(0, 7), m.created, m.resolved])).toEqual([["2026-07", 0, 0], ["2026-08", 1, 0], ["2026-09", 2, 2]]);
  });
});

describe("développements", () => {
  const statuses = [{ id: 10, name: "En qualification", phase: "entree" }, { id: 20, name: "En développement", phase: "realisation" }, { id: 30, name: "Livré", phase: "livraison" }];
  const devs = [
    { id: 1, title: "Export CSV", type: "feature", priority: "haute", status: 30, createdAt: "2026-07-01T00:00:00.000Z", startedAt: "2026-07-10T00:00:00.000Z", deliveredAt: "2026-07-20T00:00:00.000Z", announcedAt: "2026-07-21T00:00:00.000Z", opportunities: [1], demandCount: 2 },
    { id: 2, title: "Bug pointage", type: "bug", priority: "urgente", status: 20, createdAt: "2026-09-01T00:00:00.000Z", startedAt: "2026-09-02T00:00:00.000Z", opportunities: [1, 2], demandCount: 1 },
    { id: 3, title: "Idée", type: "evolution", priority: "normale", status: 10, createdAt: "2026-08-01T00:00:00.000Z", opportunities: [], demandCount: 0 },
  ];
  const a = buildDevAnalytics(devs, statuses, CLIENTS, 3, NOW);

  it("compte le flux, le délai de livraison et la part annoncée", () => {
    expect(a.kpis).toMatchObject({ inFlow: 2, avgLeadTimeDays: 19, avgBuildDays: 10, announcedShare: 100 });
    expect(a.byPhase.map((p) => [p.key, p.count])).toEqual([["entree", 1], ["etude", 0], ["realisation", 1], ["livraison", 1], ["hors-flux", 0]]);
    expect(a.byClient).toEqual([{ key: "1", client: "CTSM", count: 2, delivered: 1 }, { key: "2", client: "ENF", count: 1, delivered: 0 }]);
  });
});

describe("partenaires", () => {
  const partners = [
    { id: 1, displayName: "Avizeo", type: "metier", partnershipModel: "revendeur", commissionRate: 25 },
    { id: 2, displayName: "Marie", type: "utilisateur" },
  ];
  const clients = [
    { id: 1, partner: 1, clientStatus: "actif", createdAt: "2026-08-01T00:00:00.000Z", contractStartDate: "2026-09-01", licences: { adminQty: 2, adminPrice: 30 } },
    { id: 2, partner: 1, clientStatus: "perdue", createdAt: "2026-08-05T00:00:00.000Z" },
    { id: 3, partner: 1, clientStatus: "en-test", createdAt: "2026-09-05T00:00:00.000Z" },
    { id: 4, partner: null, clientStatus: "actif", createdAt: "2026-08-05T00:00:00.000Z", contractStartDate: "2026-09-01" },
  ];
  const points = [
    { partner: 2, delta: 50, source: "contrat", createdAt: "2026-09-01T00:00:00.000Z" },
    { partner: 2, delta: 20, source: "avis", createdAt: "2026-08-01T00:00:00.000Z" },
    { partner: 2, delta: -30, source: "echange", createdAt: "2026-09-02T00:00:00.000Z" },
  ];
  const a = buildPartnersAnalytics(partners, clients, points, [{ partner: 2, status: "pending", createdAt: "2026-09-01T00:00:00.000Z" }], [{ partner: 2, status: "pending", cost: 30, createdAt: "2026-09-02T00:00:00.000Z" }], 3, NOW);

  it("chiffre ce que chaque partenaire apporte et ce que les points produisent", () => {
    expect(a.partners[0]).toMatchObject({ name: "Avizeo", model: "Revendeur", opportunities: 3, won: 1, lost: 1, conversion: 33.33, activeClients: 1, licences: 2, caHT: 60, commission: 15 });
    expect(a.partners[1]).toMatchObject({ name: "Marie", model: "Utilisateur", points: 40, missions: 1, orders: 1 });
    expect(a.kpis).toMatchObject({ partners: 2, contributing: 1, caHT: 60, commission: 15, pendingSubmissions: 1, pendingOrders: 1 });
    expect(a.kpis.pointsIssued).toEqual({ current: 70, previous: 0, pct: null });
    expect(a.kpis.pointsSpent).toEqual({ current: 30, previous: 0, pct: null });
    expect(a.pointsBySource).toEqual([{ key: "contrat", label: "Contrats / contacts apportés", points: 50 }, { key: "avis", label: "Avis partenaire", points: 20 }]);
    expect(a.monthly.map((m) => [m.month.slice(0, 7), m.opportunities, m.won, m.points])).toEqual([["2026-07", 0, 0, 0], ["2026-08", 2, 0, 20], ["2026-09", 1, 1, 50]]); // points DISTRIBUÉS par mois
  });
});
