import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/modules/ads/lib/spend", () => ({ assertAdsBudget: vi.fn(async () => undefined), recordAdsUsage: vi.fn(async () => ({ id: 1 })), spentOf: vi.fn(async () => ({ day: 0, month: 0 })) }));
vi.mock("@/modules/analytics/lib/seo-gsc", () => ({ loadGsc: vi.fn(async () => ({ status: "missing", missing: ["GSC_SITE_URL"] })) }));
vi.mock("@/modules/analytics/lib/seo-ga4", () => ({ loadGa4: vi.fn(async () => ({ status: "missing", missing: [] })) }));
vi.mock("@/modules/analytics/lib/seo-bing", () => ({ loadBing: vi.fn(async () => ({ status: "missing", missing: [] })) }));
vi.mock("@/modules/analytics/lib/seo-sources", () => ({ loadOrganicAnalytics: vi.fn(async () => null) }));
vi.mock("@/modules/ai-team/lib/shared-data", async (importOriginal) => ({ ...(await importOriginal<object>()), cachedScorecard: vi.fn(async () => null) }));

import { recordAdsUsage } from "@/modules/ads/lib/spend";
import { planDays, planSlots } from "@/modules/ai-team/lib/agenda";
import { applyObjectiveAction, parseSeoWeekly, runSeoWeekly } from "@/modules/ai-team/lib/seo-weekly";
import type { WebCall } from "@/modules/ai-team/lib/web-model";

const objective = (titre: string, minutes: number[], echeance = "2026-11-19", extra: Record<string, unknown> = {}) => ({
  titre,
  page: "https://tim-management.co/produits/pointage",
  diagnostic: "9e sur « logiciel pointage chantier », 1 200 impressions, 0,8 % de clics.",
  meilleurClasse: "Le n°1 a une FAQ, un comparatif et une vidéo.",
  pourquoi: "Passer en top 3 : ~40 clics de plus par mois.",
  mesure: "Position et clics sur la requête dans 30 jours.",
  preuve: "prouve",
  echeance,
  etapes: minutes.map((m, i) => ({ texte: `Étape ${i + 1}`, minutes: m, prompt: i === 0 ? "Rédige une FAQ…" : "" })),
  ...extra,
});
const answer = (objs: unknown[]) => `<synthese>La page Pointage décroche face au n°1.</synthese>\n<objectifs>${JSON.stringify(objs)}</objectifs>`;

const DATES = ["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"];

describe("Objectifs : la réponse de Sergey, vérifiée", () => {
  it("garde l'ordre, et retire ce qui ne tient pas dans le temps de la direction", () => {
    const out = parseSeoWeekly(answer([objective("Refaire la page Pointage", [60, 60, 30]), objective("Créer la page comparatif", [120, 60]), objective("Demander 3 avis", [30])]), 300, DATES)!;
    // 150 + 180 > 300 : le comparatif ne tient pas ; les avis (30) tiennent encore.
    expect(out.objectives.map((o) => [o.rank, o.title, o.minutes])).toEqual([
      [1, "Refaire la page Pointage", 150],
      [2, "Demander 3 avis", 30],
    ]);
    expect(out.objectives[0].steps[0].prompt).toBe("Rédige une FAQ…");
    expect(out.synthese).toMatch(/Pointage/);
  });

  it("l'échéance est un jour du plan (sinon le dernier) ; une preuve inconnue vaut « corrélé » ; une réponse sans balises est refusée", () => {
    const out = parseSeoWeekly(answer([objective("A", [30], "2026-11-17", { preuve: "certain" }), objective("B", [30], "vendredi")]), 300, DATES)!;
    expect(out.objectives.map((o) => o.dueDay)).toEqual([1, 4]);
    expect(out.objectives[0].evidence).toBe("correle");
    expect(parseSeoWeekly("pas de balises", 300, DATES)).toBeNull();
    expect(parseSeoWeekly("<synthese>x</synthese><objectifs>pas du json</objectifs>", 300, DATES)).toBeNull();
  });
});

describe("Le plan : les cinq prochains jours ouvrés", () => {
  it("lancé un jeudi soir, il commence vendredi et court jusqu'au jeudi suivant ; un samedi, il commence lundi", () => {
    expect(planDays(new Date("2026-11-12T17:30:00Z")).map((d) => d.date)).toEqual(["2026-11-13", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19"]);
    expect(planDays(new Date("2026-11-12T09:00:00Z"))[0].date).toBe("2026-11-12");
    expect(planDays(new Date("2026-11-14T10:00:00Z"))[0].date).toBe("2026-11-16");
  });
});

describe("Créneaux dans l'agenda : sur les trous, avant l'échéance, dans l'ordre", () => {
  const days = planDays(new Date("2026-11-16T06:00:00Z")); // lundi 7 h à Paris
  const at = (day: number, h: number, m = 0) => new Date(days[day].midnight.getTime() + (h * 60 + m) * 60_000);

  it("contourne un rendez-vous, coupe en blocs de 90 min au plus, et respecte l'échéance", () => {
    const busy = [{ start: at(0, 9).toISOString(), end: at(0, 11).toISOString() }];
    const { slots, unplaced } = planSlots({ days, now: at(0, 8), busy, items: [{ id: "a", minutes: 150, dueDay: 0 }] });
    // Lundi : 11 h–12 h 30 (90 min), puis 14 h–15 h (60 min).
    expect(slots.map((s) => [s.start.toISOString(), (s.end.getTime() - s.start.getTime()) / 60_000])).toEqual([
      [at(0, 11).toISOString(), 90],
      [at(0, 14).toISOString(), 60],
    ]);
    expect(unplaced).toEqual({});
  });

  it("ne pose rien dans le passé, et dit ce qui n'a pas trouvé de place", () => {
    const { slots, unplaced } = planSlots({ days, now: at(0, 17, 40), busy: [], items: [{ id: "a", minutes: 60, dueDay: 0 }] });
    expect(slots).toEqual([]);
    expect(unplaced).toEqual({ a: 60 });
  });

  it("le suivant prend les trous laissés par le premier", () => {
    const { slots } = planSlots({ days, now: at(0, 8), busy: [], items: [{ id: "a", minutes: 90, dueDay: 4 }, { id: "b", minutes: 30, dueDay: 4 }] });
    expect(slots.map((s) => [s.id, s.start.toISOString()])).toEqual([
      ["a", at(0, 9).toISOString()],
      ["b", at(0, 10, 30).toISOString()],
    ]);
  });
});

describe("Cocher une étape", () => {
  const now = new Date("2026-11-17T10:00:00Z");
  const steps = [{ text: "A" }, { text: "B", done: true }];
  it("la dernière case cochée termine l'objectif ; décocher le rouvre", () => {
    const r = applyObjectiveAction({ status: "a-faire", steps }, { step: 0, done: true }, now);
    expect(r).toMatchObject({ ok: true, status: "fait", closedAt: now.toISOString() });
    const back = applyObjectiveAction({ status: "fait", steps: r.ok ? r.steps : [] }, { step: 1, done: false }, now);
    expect(back).toMatchObject({ ok: true, status: "a-faire", closedAt: null });
  });
  it("refuse une étape inconnue ou un objectif reporté", () => {
    expect(applyObjectiveAction({ status: "a-faire", steps }, { step: 5, done: true }, now).ok).toBe(false);
    expect(applyObjectiveAction({ status: "reporte", steps }, { step: 0, done: true }, now).ok).toBe(false);
  });
});

describe("La revue de Sergey, d'un bout à l'autre", () => {
  beforeEach(() => vi.mocked(recordAdsUsage).mockClear());

  function fakePayload() {
    const created: { collection: string; data: Record<string, unknown> }[] = [];
    const updated: Record<string, unknown>[] = [];
    let id = 1;
    return {
      created,
      updated,
      payload: {
        find: vi.fn(async ({ collection }: { collection: string }) => {
          if (collection === "ai-team-members") return { docs: [{ id: 50, name: "Sergey", active: true, weeklyHours: 3 }] };
          if (collection === "calendar-connections") return { docs: [] };
          return { docs: [] };
        }),
        create: vi.fn(async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => {
          created.push({ collection, data });
          return { id: id++, ...data };
        }),
        update: vi.fn(async (args: Record<string, unknown>) => (updated.push(args), args)),
        delete: vi.fn(async () => ({})),
        logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
      },
    };
  }

  it("fixe les objectifs dans les 3 h de la direction, reporte la semaine passée, et dit qu'il n'a pas d'agenda", async () => {
    const { payload, created, updated } = fakePayload();
    const call: WebCall = async () => ({ content: [{ type: "text", text: answer([objective("Refaire la page Pointage", [60, 60]), objective("Créer le comparatif", [120])]), citations: null }] as never, usage: { input: 30_000, output: 4_000, cacheRead: 0, cacheWrite: 0 }, searches: 3, stopReason: "end_turn" });
    const r = await runSeoWeekly(payload as never, { now: new Date("2026-11-16T07:30:00Z"), force: true, call });
    expect(r).toMatchObject({ status: "faite", objectives: 1, booked: 0 });
    const objectives = created.filter((c) => c.collection === "ai-team-objectives").map((c) => c.data);
    expect(objectives).toHaveLength(1);
    // Lancé lundi 8 h 30 : le plan court du lundi 16 au vendredi 20.
    expect(objectives[0]).toMatchObject({ member: 50, week: "2026-11-16", rank: 1, minutes: 120, evidence: "prouve" });
    // La semaine passée non finie est reportée.
    expect(updated.some((u) => u.collection === "ai-team-objectives" && (u.data as { status?: string }).status === "reporte")).toBe(true);
    // Le coût part au budget de l'équipe SEO/GEO.
    expect(vi.mocked(recordAdsUsage).mock.calls[0][1]).toMatchObject({ kind: "seo" });
    const last = String((updated.at(-1)!.data as { text: string }).text);
    expect(last).toMatch(/1 objectif d'ici vendredi 20 novembre, dans vos 3 h/);
    expect(last).toMatch(/Aucun agenda choisi/);
  });
});
