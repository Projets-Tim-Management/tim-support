import { describe, expect, it } from "vitest";

import { beforeAfter, metricSeries, metricValue } from "@/modules/ai-team/lib/roadmap-calc";
import { goalOutcome, goalProgress, parseGoalUpdates, whatWorks, type ActionView } from "@/modules/ai-team/lib/roadmap";
import type { Snapshot } from "@/modules/ai-team/lib/snapshots";

/**
 * La feuille de route : les indicateurs lus dans les photos du lundi, l'avant /
 * après d'une action, la progression d'un objectif face au temps écoulé, ce que
 * les chefs peuvent proposer, et le bilan « ce qui marche ».
 */

const fig = (qualified: number, spend = 0) => ({ spend, leads: qualified * 2, qualified, won: 0, costPerLead: null, costPerQualified: null }) as never;
const snap = (week: string, seo: number, meta: number, metaSpend: number, clicks: number | null): Snapshot => ({
  week,
  channels: [
    { key: "seo", label: "SEO", now: fig(seo) },
    { key: "meta", label: "Meta", now: fig(meta, metaSpend) },
  ],
  google: null,
  chatgpt: null,
  metrics: { "seo-clics-hors-marque": clicks },
});

describe("les indicateurs, photo après photo", () => {
  const snaps = [snap("2026-10-05", 4, 2, 1000, null), snap("2026-10-12", 5, 2, 1100, 300), snap("2026-11-09", 7, 4, 1200, 420)];

  it("lisent la fiche des canaux et les indicateurs ajoutés", () => {
    expect(metricValue(snaps[0], "seo-leads-qualifies")).toBe(4);
    expect(metricValue(snaps[0], "sea-leads-qualifies")).toBe(2);
    expect(metricValue(snaps[0], "sea-cout-lead-qualifie")).toBe(500);
    expect(metricValue(snaps[0], "leads-qualifies-total")).toBe(6);
    expect(metricValue(snaps[0], "seo-clics-hors-marque")).toBeNull();
    expect(metricSeries(snaps, "seo-clics-hors-marque")).toEqual([
      { week: "2026-10-12", value: 300 },
      { week: "2026-11-09", value: 420 },
    ]);
  });

  it("l'avant / après d'une action : la photo d'avant, puis à 7, 30 et 60 jours", () => {
    const series = metricSeries(snaps, "seo-leads-qualifies");
    const r = beforeAfter(series, "2026-10-08T10:00:00Z", "up");
    expect(r.before).toBe(4);
    expect(r.after[0]).toMatchObject({ days: 7, value: 5, changePct: 25, good: true });
    expect(r.after[1]).toMatchObject({ days: 30, value: 7, good: true });
    expect(r.after[2]).toMatchObject({ days: 60, value: null, changePct: null });
    // Un coût qui baisse, c'est mieux.
    const cost = beforeAfter(metricSeries(snaps, "sea-cout-lead-qualifie"), "2026-10-08T10:00:00Z", "down");
    expect(cost.after[1].good).toBe(true);
  });
});

describe("un objectif à horizon", () => {
  const now = new Date("2026-12-14T12:00:00Z");
  const g = { baseline: 4, target: 12, startDate: "2026-11-14T12:00:00Z", dueDate: "2027-02-14T12:00:00Z" };

  it("mesure le chemin parcouru face au temps écoulé", () => {
    // Un mois sur trois écoulé (≈ 33 %) : 50 % du chemin → en avance ; 25 % → dans les temps ; 0 % → en retard.
    expect(goalProgress({ ...g, current: 8 }, "up", now)).toEqual({ progress: 50, pace: "avance" });
    expect(goalProgress({ ...g, current: 6 }, "up", now)).toEqual({ progress: 25, pace: "dans-les-temps" });
    expect(goalProgress({ ...g, current: 4 }, "up", now)).toEqual({ progress: 0, pace: "retard" });
    expect(goalProgress({ ...g, current: 13 }, "up", now)).toEqual({ progress: 100, pace: "atteint" });
    expect(goalProgress({ ...g, current: null }, "up", now)).toEqual({ progress: null, pace: null });
  });

  it("un coût à faire baisser se lit à l'envers", () => {
    expect(goalProgress({ baseline: 500, target: 250, current: 375, startDate: g.startDate, dueDate: g.dueDate }, "down", now).progress).toBe(50);
    expect(goalProgress({ baseline: 500, target: 250, current: 240, startDate: g.startDate, dueDate: g.dueDate }, "down", now).pace).toBe("atteint");
  });
});

describe("ce que le chef propose", () => {
  it("un seul objectif vivant par indicateur, d'une équipe, chiffré ; au plus deux propositions ; le point du mois", () => {
    const r = parseGoalUpdates(
      {
        propositions: [
          { horizon: "moyen", indicateur: "mrr", titre: "6 000 € de MRR", cible: 6000, pourquoi: "doublon" },
          { horizon: "court", indicateur: "leads-qualifies-30j", titre: "Doubler les leads qualifiés", cible: 12, pourquoi: "courbe" },
          { horizon: "long", indicateur: "leads-qualifies-30j", titre: "Même indicateur, deux fois", cible: 20 },
          { horizon: "moyen", indicateur: "mrr-signature", titre: "Pas son équipe", cible: 250 },
          { horizon: "long", indicateur: "ia-mentions", titre: "Sans cible", cible: "beaucoup" },
          { horizon: "moyen", indicateur: "ia-mentions", titre: "Être nommé par les IA", cible: 25 },
          { horizon: "court", indicateur: "clics-google", titre: "Une troisième", cible: 500 },
        ],
        points: [
          { id: "3", point: "On est à 6 sur 12." },
          { id: "99", point: "inconnu" },
        ],
      },
      { team: "seo", liveMetrics: new Set(["mrr"]), goalIds: new Set(["3"]) },
    );
    expect(r.proposals.map((p) => [p.horizon, p.metric, p.target])).toEqual([
      ["court", "leads-qualifies-30j", 12],
      ["moyen", "ia-mentions", 25],
    ]);
    expect(r.points).toEqual([{ id: "3", text: "On est à 6 sur 12." }]);
  });

  it("un jalon atteint se déclare par son chef, preuve à l'appui, et seulement un jalon en cours de son équipe", () => {
    const r = parseGoalUpdates({ jalonsAtteints: [{ id: "8", preuve: "Chaîne en ligne : youtube.com/@tim" }, { id: "9", preuve: "x" }, { id: "8b", preuve: "" }] }, { team: "seo", liveMetrics: new Set(), goalIds: new Set(), milestoneIds: new Set(["8", "8b"]) });
    expect(r.milestones).toEqual([{ id: "8", proof: "Chaîne en ligne : youtube.com/@tim" }]);
  });
});

describe("un objectif se clôt tout seul", () => {
  const now = new Date("2026-11-16T10:00:00Z");
  it("atteint dès que l'indicateur touche la cible, dans un sens comme dans l'autre", () => {
    expect(goalOutcome({ target: 5000, current: 5010, dueDate: "2026-12-31" }, "up", now)).toBe("atteint");
    expect(goalOutcome({ target: 450, current: 440, dueDate: "2027-05-16" }, "down", now)).toBe("atteint");
  });
  it("manqué si l'échéance passe avant ; sinon toujours en cours", () => {
    expect(goalOutcome({ target: 5000, current: 4300, dueDate: "2026-11-01" }, "up", now)).toBe("manque");
    expect(goalOutcome({ target: 5000, current: 4300, dueDate: "2026-12-31" }, "up", now)).toBeNull();
    expect(goalOutcome({ target: 5000, current: null, dueDate: "2026-12-31" }, "up", now)).toBeNull();
  });
});

describe("ce qui marche chez TIM", () => {
  it("compte, par type d'action, ce qui a marché sur ce qui a été jugé ; les décisions à part", () => {
    const a = (type: string, outcome: ActionView["outcome"], source: ActionView["source"] = "objectif"): ActionView => ({ id: Math.random().toString(), team: "seo", date: "2026-11-01", status: "faite", title: "x", type, by: null, human: false, kind: "ia", source, goal: null, outcome, verdict: null, href: "#" });
    expect(whatWorks([a("Contenu", "a-marche"), a("Contenu", "sans-effet"), a("Contenu", null), a("Technique", "a-marche"), a("Décision", null, "decision")])).toEqual([
      { team: "seo", type: "Contenu", worked: 1, judged: 2, pending: 1 },
      { team: "seo", type: "Technique", worked: 1, judged: 1, pending: 0 },
    ]);
  });
});

import { monthEndMonday } from "@/modules/ai-team/lib/roadmap-metrics";
import { roadmapBlock } from "@/modules/ai-team/lib/roadmap";

describe("l'historique reconstitué et ce que lisent les agents", () => {
  it("un point par mois : le lundi de la dernière semaine du mois", () => {
    expect(monthEndMonday(2026, 9)).toBe("2026-10-26"); // octobre 2026 finit un samedi
    expect(monthEndMonday(2026, 10)).toBe("2026-11-30"); // novembre 2026 finit un lundi
  });

  it("chaque agent reçoit les objectifs de son équipe et ce que prévoient les équipes humaines", () => {
    expect(roadmapBlock(null)).toBe("");
    expect(roadmapBlock({ objectifs: [], actionsDesEquipesHumaines: [] })).toBe("");
    const block = roadmapBlock({
      objectifs: [{ id: "1", horizon: "court", sorte: "chiffre", etat: "valide", objectif: "15 leads gratuits", indicateur: "seo-leads-qualifies", depart: 10, cible: 15, aujourdhui: 11, progressionPct: 20, allure: "dans-les-temps", echeance: "2027-02-14", fixePar: "Direction", dernierPoint: null, pointDuMois: false }],
      actionsDesEquipesHumaines: [{ id: "action-3", action: "Vidéo de démo", qui: "Marketing", etat: "prevue", prevueLe: "2026-12-05", faiteLe: null, sertObjectif: "1", detail: null, verdict: null }],
    } as never);
    expect(block).toMatch(/fais tout pour les atteindre/);
    expect(block).toMatch(/15 leads gratuits — seo-leads-qualifies : 11 aujourd'hui, cible 15/);
    expect(block).toMatch(/Marketing : Vidéo de démo \(prévue le 2026-12-05\)/);
  });
});

import { amountAt, mrrAt } from "@/modules/ai-team/lib/indicators";

describe("le MRR à une date", () => {
  const t = (d: string) => Date.parse(`${d}T12:00:00Z`);
  const c = (o: Partial<{ status: string; start: number | null; end: number | null; amount: number; history: { at: number; caHT: number }[] }>) => ({ id: "1", status: "actif", start: t("2026-01-01"), end: null, amount: 500, history: [], submission: null, ...o });
  it("compte les contrats démarrés et pas résiliés, au montant en vigueur à la date", () => {
    const clients = [
      c({ history: [{ at: t("2026-01-01"), caHT: 300 }, { at: t("2026-06-01"), caHT: 450 }] }),
      c({ start: t("2026-09-01"), amount: 200 }),
      c({ status: "resilie", start: t("2025-06-01"), end: t("2026-03-01"), amount: 100 }),
      c({ status: "en-signature", start: null, amount: 900 }),
    ];
    expect(mrrAt(clients, t("2026-02-15"))).toEqual({ mrr: 400, count: 2 });
    expect(mrrAt(clients, t("2026-10-01"))).toEqual({ mrr: 650, count: 2 });
    expect(amountAt({ amount: 500, history: [] }, t("2026-01-01"))).toBe(500);
  });
});

describe("un seul catalogue d'indicateurs (relecture du 15/11/2026)", () => {
  it("les courbes du lundi sont des indicateurs du catalogue, mesurables comme objectifs sur la dernière photo", async () => {
    const { WEEKLY_INDICATORS, indicatorOf } = await import("@/modules/ai-team/lib/indicators-meta");
    const { measureContext } = await import("@/modules/ai-team/lib/indicators");
    expect(WEEKLY_INDICATORS.map((x) => x.key)).toEqual(expect.arrayContaining(["leads-qualifies-total", "sea-cout-lead-qualifie", "seo-clics-hors-marque", "ia-mentions", "pages-indexees"]));
    expect(indicatorOf("sea-cout-lead-qualifie")).toMatchObject({ unit: "€", better: "down", teams: ["sea"] });
    const snaps = [
      { week: "2026-11-02", channels: [{ key: "seo", now: { qualified: 3, spend: 0 } }], metrics: { "seo-clics-hors-marque": 900 } },
      { week: "2026-11-09", channels: [{ key: "seo", now: { qualified: 4, spend: 0 } }, { key: "meta", now: { qualified: 2, spend: 600 } }], metrics: { "seo-clics-hors-marque": 950 } },
    ];
    const payload = { find: async ({ collection }: { collection: string }) => ({ docs: collection === "ai-team-snapshots" ? [...snaps].reverse() : [] }) };
    const ctx = measureContext(payload as never, new Date("2026-11-12T10:00:00Z"));
    expect(await ctx.measure("leads-qualifies-total", new Date("2026-11-12T10:00:00Z"))).toBe(6);
    expect(await ctx.measure("sea-cout-lead-qualifie", new Date("2026-11-12T10:00:00Z"))).toBe(300);
    expect(await ctx.measure("seo-clics-hors-marque", new Date("2026-11-05T10:00:00Z"))).toBe(900);
    // Avant la première photo, ou trop loin après la dernière : on ne sait pas.
    expect(await ctx.measure("seo-clics-hors-marque", new Date("2026-10-01T10:00:00Z"))).toBeNull();
    expect(await ctx.measure("seo-clics-hors-marque", new Date("2026-12-20T10:00:00Z"))).toBeNull();
  });
});

describe("l'avancement à date (16/11/2026)", () => {
  it("100 % quand toutes les tâches humaines à date sont faites ; le travail des agents et l'avenir ne comptent pas", async () => {
    const { progressToDate } = await import("@/modules/ai-team/admin/roadmap-ui");
    const a = (id: string, kind: string, date: string, status: string) => ({ id, kind, date, status }) as never;
    const today = "2026-11-16";
    expect(progressToDate([a("1", "vous", "2026-11-10", "faite"), a("2", "equipe", "2026-11-16", "faite"), a("3", "ia", "2026-11-01", "prevue"), a("4", "vous", "2026-11-20", "prevue")], today)).toEqual({ done: 2, due: 2, pct: 100, late: 0 });
    expect(progressToDate([a("1", "vous", "2026-11-10", "faite"), a("2", "vous", "2026-11-12", "prevue"), a("3", "equipe", "2026-11-14", "en-cours")], today)).toEqual({ done: 1, due: 3, pct: 33, late: 2 });
    expect(progressToDate([], today).pct).toBe(100);
  });
});
