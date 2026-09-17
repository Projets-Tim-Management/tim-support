import { describe, expect, it } from "vitest";

import { buildPipelineAnalytics, parseTransition, timelineOf, type Activity, type PipelineClient } from "@/modules/analytics/lib/pipeline";

/**
 * Le pipeline vu de loin : l'entonnoir, le temps passé à chaque étape, les
 * flux entre étapes, et ce que ça donne source par source. Tout vient des
 * fiches et du journal « Étape : A → B ».
 */

const NOW = new Date("2026-09-15T12:00:00.000Z");
const PARTNERS = [{ id: 1, displayName: "Avizeo" }];

const client = (over: Partial<PipelineClient> & { id: number }): PipelineClient => ({
  companyName: `C${over.id}`,
  clientStatus: "nouvelle",
  createdAt: "2026-08-01T00:00:00.000Z",
  source: "site-vitrine-seo",
  partner: 1,
  ...over,
});

const step = (client: number, at: string, from: string, to: string): Activity => ({
  client,
  occurredAt: at,
  title: `Étape : ${from} → ${to}`,
});

describe("lecture du journal", () => {
  it("reconnaît un passage d'étape par ses libellés", () => {
    expect(parseTransition("Étape : Nouvelle → Démo programmée")).toEqual({ from: "nouvelle", to: "demo-programmee" });
    expect(parseTransition("Étape : En attente longue → Gagnée")).toEqual({ from: "attente-longue", to: "actif" });
    expect(parseTransition("Contrat signé le 11/09/2026")).toBeNull();
    expect(parseTransition("Étape : Inconnue → Gagnée")).toBeNull();
  });

  it("reconstruit la chronologie d'une fiche depuis sa création", () => {
    const tl = timelineOf(
      client({ id: 1, clientStatus: "en-test" }),
      [
        { at: Date.parse("2026-08-10T00:00:00.000Z"), from: "nouvelle", to: "en-qualification" },
        { at: Date.parse("2026-08-20T00:00:00.000Z"), from: "en-qualification", to: "en-test" },
      ],
      NOW.getTime(),
    );
    expect(tl.map((s) => [s.status, new Date(s.enteredAt).toISOString().slice(0, 10), s.leftAt && new Date(s.leftAt).toISOString().slice(0, 10)])).toEqual([
      ["nouvelle", "2026-08-01", "2026-08-10"],
      ["en-qualification", "2026-08-10", "2026-08-20"],
      ["en-test", "2026-08-20", null],
    ]);
  });
});

describe("entonnoir et conversion", () => {
  const clients = [
    client({ id: 1, clientStatus: "actif", contractStartDate: "2026-09-01" }),
    client({ id: 2, clientStatus: "en-test" }),
    client({ id: 3, clientStatus: "perdue", lossReason: "prix", source: "google-ads-sea" }),
    client({ id: 4, clientStatus: "nouvelle", source: "google-ads-sea", partner: null }),
  ];
  const activities = [
    step(1, "2026-08-05T00:00:00.000Z", "Nouvelle", "Démo programmée"),
    step(1, "2026-08-15T00:00:00.000Z", "Démo programmée", "En phase de test"),
    step(1, "2026-09-01T00:00:00.000Z", "En phase de test", "Gagnée"),
    step(2, "2026-08-11T00:00:00.000Z", "Nouvelle", "En qualification"),
    step(2, "2026-08-21T00:00:00.000Z", "En qualification", "En phase de test"),
    step(3, "2026-08-03T00:00:00.000Z", "Nouvelle", "En qualification"),
    step(3, "2026-08-13T00:00:00.000Z", "En qualification", "Perdue"),
  ];
  const a = buildPipelineAnalytics(clients, activities, PARTNERS, 12, NOW);

  it("compte qui est arrivé au moins à chaque étape, avec les taux de passage", () => {
    expect(a.funnel.map((f) => [f.key, f.reached, f.fromPrevious, f.fromStart])).toEqual([
      ["nouvelle", 4, null, 100],
      ["en-qualification", 3, 75, 75],
      ["demo-programmee", 2, 66.67, 50], // la fiche 2 a sauté la démo : elle est comptée comme passée (elle est allée plus loin)
      ["attente-engagement", 2, 100, 50],
      ["en-test", 2, 100, 50],
      ["actif", 1, 50, 25],
    ]);
    expect(a.kpis.conversion).toBe(25);
    expect(a.kpis.avgDaysToWin).toBe(31);
    expect(a.kpis.open).toBe(2);
    expect(a.kpis.activeClients).toBe(1);
  });

  it("mesure le temps passé à chaque étape, terminé et en cours", () => {
    const nouvelle = a.stages.find((s) => s.key === "nouvelle")!;
    // Fiches 1 (4 j), 2 (10 j), 3 (2 j) sont sorties de « Nouvelle » ; la 4 y est depuis 45,5 j.
    expect(nouvelle).toMatchObject({ passed: 3, avgDays: 5.33, medianDays: 4, openNow: 1, openAvgDays: 45.5 });
    const test = a.stages.find((s) => s.key === "en-test")!;
    expect(test).toMatchObject({ passed: 1, avgDays: 17, openNow: 1 });
  });

  it("dessine les flux entre étapes", () => {
    expect(a.flow.links).toContainEqual({ from: "nouvelle", to: "en-qualification", count: 2 });
    expect(a.flow.links).toContainEqual({ from: "en-qualification", to: "perdue", count: 1 });
    expect(a.flow.nodes.map((n) => n.key)).toEqual(["nouvelle", "en-qualification", "demo-programmee", "en-test", "actif", "perdue"]);
  });

  it("segmente par source et par partenaire", () => {
    expect(a.bySource.map((s) => [s.label, s.total, s.won, s.lost, s.open, s.conversion])).toEqual([
      ["Site vitrine — SEO", 2, 1, 0, 1, 50],
      ["Google Ads — SEA", 2, 0, 1, 1, 0],
    ]);
    expect(a.byPartner.map((s) => [s.label, s.total])).toEqual([
      ["Avizeo", 3],
      ["Sans partenaire", 1],
    ]);
    expect(a.lossReasons).toEqual([{ key: "prix", label: "Prix trop élevé", count: 1 }]);
  });

  it("liste les affaires en cours par ancienneté, avec le temps dans l'étape actuelle", () => {
    expect(a.open.map((o) => [o.name, o.statusLabel, o.ageDays, o.stageDays])).toEqual([
      ["C2", "En phase de test", 45.5, 25.5],
      ["C4", "Nouvelle", 45.5, 45.5],
    ]);
  });

  it("suit les créations, gains et pertes mois par mois", () => {
    const aug = a.monthly.find((m) => m.month.startsWith("2026-08"))!;
    const sep = a.monthly.find((m) => m.month.startsWith("2026-09"))!;
    expect([aug.created, aug.won, aug.lost]).toEqual([4, 0, 1]);
    expect([sep.created, sep.won, sep.lost]).toEqual([0, 1, 0]);
  });
});

describe("résiliations", () => {
  it("compte les résiliés de la période et garde leur passage par « Gagnée »", () => {
    const a = buildPipelineAnalytics(
      [client({ id: 1, clientStatus: "resilie", resiliationDate: "2026-09-10", lossReason: "concurrent", createdAt: "2026-01-01T00:00:00.000Z" })],
      [],
      PARTNERS,
      3,
      NOW,
    );
    expect(a.kpis.churned.current).toBe(1);
    expect(a.churnReasons).toEqual([{ key: "concurrent", label: "Parti chez un concurrent", count: 1 }]);
    expect(a.funnel.find((f) => f.key === "actif")?.reached).toBe(0); // créée hors période : pas dans l'entonnoir
  });
});

describe("entonnoir : tout le monde entre", () => {
  it("compte une affaire perdue sans passage enregistré à la première étape", () => {
    const a = buildPipelineAnalytics([client({ id: 1, clientStatus: "perdue" }), client({ id: 2, clientStatus: "attente-longue" })], [], PARTNERS, 12, NOW);
    expect(a.funnel[0]).toMatchObject({ key: "nouvelle", reached: 2, fromStart: 100 });
    expect(a.funnel[1].reached).toBe(0);
  });
});

describe("le flux ne boucle pas", () => {
  it("un retour en arrière est compté, pas tracé — un Sankey n'a pas de cycle", () => {
    // Démo → Attente, puis Attente → Démo : deux liens en sens inverse
    // faisaient boucler le calcul de profondeur de Recharts (page plantée).
    const a = buildPipelineAnalytics(
      [client({ id: 1, clientStatus: "demo-programmee" })],
      [
        step(1, "2026-08-02T00:00:00.000Z", "Nouvelle", "Démo programmée"),
        step(1, "2026-08-10T00:00:00.000Z", "Démo programmée", "En attente d'engagement"),
        step(1, "2026-08-20T00:00:00.000Z", "En attente d'engagement", "Démo programmée"),
      ],
      PARTNERS,
      6,
      NOW,
    );
    expect(a.flow.links.some((l) => l.from === "attente-engagement" && l.to === "demo-programmee")).toBe(false);
    expect(a.flow.links).toContainEqual({ from: "demo-programmee", to: "attente-engagement", count: 1 });
    expect(a.flow.backward).toBe(1);
  });
});
