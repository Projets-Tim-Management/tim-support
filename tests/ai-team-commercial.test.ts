import { describe, expect, it, vi } from "vitest";

import { analyzeHealth, analyzeTrials, healthSummary, workdaysBetween, type ClientFacts, type TrialInput } from "@/modules/ai-team/lib/commercial";
import { computeMastery, COM_MASTERY_KEYS, SEA_MASTERY_KEYS } from "@/modules/ai-team/lib/mastery";
import { spendKindOf, teamOfKey, COM_VEILLE_KEYS, SOCLES } from "@/modules/ai-team/lib/veille-domains";

/**
 * Le bureau commercial de Jordan (15/11/2026) : Nathan (pipeline), Jade (essais),
 * Malo (rétention). Les faits sont calculés par le code ; chaque bureau paie
 * sur son propre budget.
 */

const DAY = 86_400_000;
const NOW = Date.parse("2026-11-16T10:00:00Z"); // un lundi
const iso = (t: number) => new Date(t).toISOString();

const trial = (over: Partial<TrialInput> = {}): TrialInput => ({
  id: "r1",
  client: "c1",
  name: "Dupont BTP",
  amount: 250,
  status: "en-cours",
  start: iso(NOW - 10 * DAY),
  end: iso(NOW + 4 * DAY),
  sessionAt: iso(NOW - 9 * DAY),
  reviewAt: null,
  decision: null,
  extensions: 0,
  satisfaction: null,
  steps: [],
  ...over,
});

describe("le bureau commercial", () => {
  it("chaque agent est rangé dans son bureau et paie sur son budget", () => {
    expect(["chef-com", "com-pipeline", "com-essais", "com-clients"].map(teamOfKey)).toEqual(["com", "com", "com", "com"]);
    expect(["chef-seo", "seo-conversion", "chef-sea", "sea-meta"].map(teamOfKey)).toEqual(["seo", "seo", "sea", "sea"]);
    expect([spendKindOf("com"), spendKindOf("seo"), spendKindOf("sea")]).toEqual(["commercial", "seo", "agent"]);
    expect(COM_VEILLE_KEYS.sort()).toEqual(["chef-com", "com-clients", "com-essais", "com-pipeline"]);
    for (const k of COM_VEILLE_KEYS) expect(SOCLES[k]?.length).toBeGreaterThan(2);
    expect(COM_MASTERY_KEYS.sort()).toEqual(["chef-com", "com-clients", "com-essais", "com-pipeline"]);
    expect(SEA_MASTERY_KEYS).not.toContain("com-pipeline");
  });
});

describe("Jade, les essais", () => {
  it("compte les jours ouvrés", () => {
    // Du vendredi 13 au lundi 16 : un seul jour ouvré (le lundi).
    expect(workdaysBetween(Date.parse("2026-11-13T10:00:00Z"), NOW)).toBe(1);
    expect(workdaysBetween(NOW, NOW - DAY)).toBe(0);
  });

  it("signale un essai silencieux, en fin sans bilan, et ses étapes en retard", () => {
    const [v] = analyzeTrials(
      [trial({ steps: [{ key: "a", label: "Saisir un chantier", state: "a-faire", anchor: "debut", offsetDays: 2 }, { key: "b", label: "Séance", state: "fait", anchor: "debut", offsetDays: 0 }] })],
      new Map([["c1", NOW - 8 * DAY]]),
      NOW,
    );
    expect(v).toMatchObject({ day: 11, length: 14, daysLeft: 4, progress: "1/2 étapes", lastContactDays: 8 });
    expect(v.overdue).toEqual([expect.stringContaining("Saisir un chantier")]);
    expect(v.flags).toEqual(expect.arrayContaining([expect.stringContaining("aucun échange depuis"), "1 étape en retard", "fin dans 4 j sans bilan calé"]));
    expect(v.priority).toBe("A");
  });

  it("un essai suivi est sur les rails ; un essai fini sans décision est signalé ; un essai clos est ignoré", () => {
    const ok = analyzeTrials([trial({ reviewAt: iso(NOW + 3 * DAY) })], new Map([["c1", NOW - DAY]]), NOW);
    expect(ok[0].flags).toEqual([]);
    expect(ok[0].priority).toBe("C");
    const late = analyzeTrials([trial({ end: iso(NOW - 3 * DAY), reviewAt: iso(NOW - 3 * DAY), extensions: 1 })], new Map([["c1", NOW - DAY]]), NOW);
    expect(late[0].flags).toEqual(["essai terminé depuis 3 j sans décision", "déjà prolongé 1 fois"]);
    expect(analyzeTrials([trial({ status: "gagne" })], new Map(), NOW)).toEqual([]);
  });

  it("une séance de prise en main pas calée à l'approche du démarrage", () => {
    const [v] = analyzeTrials([trial({ status: "preparation", start: iso(NOW + 2 * DAY), end: iso(NOW + 16 * DAY), sessionAt: null })], new Map(), NOW);
    expect(v.flags).toEqual(["séance de prise en main pas encore calée"]);
    expect(v.day).toBeNull();
  });
});

describe("Malo, la santé des clients", () => {
  const facts = (over: Partial<ClientFacts> = {}): ClientFacts => ({ tickets30: 0, urgentOpen: 0, late: { count: 0, amount: 0, oldestDays: 0 }, lastContact: NOW - 10 * DAY, productionOverdue: null, ...over });
  const client = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Client ${id}`, status: "actif", mrr: 200, start: NOW - 400 * DAY, end: null, onboarding: "valide", ...over });

  it("rouge, orange, vert sur des faits ; beaucoup de demandes au support n'est pas un signal à lui seul", () => {
    const out = analyzeHealth(
      [
        client("vert", { mrr: 300 }),
        client("support"),
        client("neuf", { start: NOW - 60 * DAY, onboarding: "en-cours", mrr: 150 }),
        client("impaye"),
        client("part", { status: "resilie", end: NOW + 20 * DAY, mrr: 400 }),
        client("parti", { status: "resilie", end: NOW - DAY }),
      ],
      new Map([
        ["vert", facts()],
        ["support", facts({ tickets30: 8 })],
        ["neuf", facts()],
        ["impaye", facts({ late: { count: 1, amount: 240, oldestDays: 20 } })],
        ["part", facts()],
      ]),
      NOW,
    );
    const by = Object.fromEntries(out.map((h) => [h.id, h]));
    expect(by.parti).toBeUndefined();
    expect(by.part.health).toBe("rouge");
    expect(by.neuf.health).toBe("rouge");
    expect(by.neuf.signals[0].text).toContain("mise en route non validée après 60 j");
    expect(by.impaye.health).toBe("orange");
    expect(by.support.health).toBe("vert");
    expect(by.vert.opportunity).toContain("témoignage");
    // Rouges d'abord, les plus gros MRR en tête.
    expect(out.map((h) => h.id).slice(0, 2)).toEqual(["part", "neuf"]);
    expect(healthSummary(out)).toEqual({ vert: 2, orange: 1, rouge: 2, mrrARisque: 550 });
  });

  it("un long silence chez un client récent est un signal ; Pennylane illisible n'invente rien", () => {
    const [h] = analyzeHealth([client("a", { start: NOW - 120 * DAY })], new Map([["a", facts({ lastContact: NOW - 70 * DAY, late: null })]]), NOW);
    expect(h.health).toBe("orange");
    expect(h.signals.map((s) => s.text)).toEqual(["aucun échange depuis 70 j"]);
  });
});

describe("la maîtrise du bureau commercial", () => {
  it("se mesure sur une cible absolue de 100 %", () => {
    const m = computeMastery({ key: "com-essais", cost: null, benchmark: null, trackingPct: null, seoValue: 50, lastVeilleAt: null, verdicts: [], tests: { judged: 0, applied: 0 }, now: new Date(NOW) });
    const r = m.parts.find((p) => p.key === "resultats")!;
    expect(r.points).toBe(20);
    expect(r.detail).toContain("pour une cible de 100 %");
  });
});

describe("relecture du 15/11/2026 : les calculs corrigés", () => {
  it("heures ouvrées à la minute, à l'heure de Paris été comme hiver", async () => {
    const { businessHours } = await import("@/modules/ai-team/lib/pipeline-agent");
    // Un lead d'il y a une minute, lundi 10 h (Paris, hiver) : pas encore une heure d'attente.
    expect(businessHours(NOW - 60_000, NOW)).toBeLessThan(0.1);
    // Lundi 17 h → mardi 10 h (hiver) : 1 h le lundi + 1 h le mardi.
    expect(businessHours(Date.parse("2026-11-16T16:00:00Z"), Date.parse("2026-11-17T09:00:00Z"))).toBe(2);
    // L'été (UTC+2) : lundi 9 h – 18 h à Paris = 7 h – 16 h UTC.
    expect(businessHours(Date.parse("2026-07-06T06:00:00Z"), Date.parse("2026-07-06T17:00:00Z"))).toBe(9);
    // Le week-end ne compte pas.
    expect(businessHours(Date.parse("2026-11-14T08:00:00Z"), Date.parse("2026-11-15T20:00:00Z"))).toBe(0);
  });

  it("un mois plus tard reste dans le mois ; le jour est celui de Paris", async () => {
    const { addMonths, parisDay } = await import("@/modules/ai-team/lib/format");
    expect(addMonths(new Date("2026-01-31T12:00:00Z"), 1).toISOString().slice(0, 10)).toBe("2026-02-28");
    expect(addMonths(new Date("2026-11-15T12:00:00Z"), 3).toISOString().slice(0, 10)).toBe("2027-02-15");
    expect(parisDay(new Date("2026-11-15T23:30:00Z"))).toBe("2026-11-16");
  });

  it("l'avant / après se lit aussi sur une courbe de fins de mois ; la balise des objectifs se lit sans planter", async () => {
    const { beforeAfter } = await import("@/modules/ai-team/lib/roadmap-calc");
    const { horizonsOf } = await import("@/modules/ai-team/lib/roadmap");
    const monthly = ["2026-07-27", "2026-08-31", "2026-09-28", "2026-10-26"].map((week, i) => ({ week, value: 100 + i * 10 }));
    const r = beforeAfter(monthly, "2026-09-10T10:00:00Z", "up");
    expect(r.before).toBe(110);
    expect(r.after.find((a) => a.days === 30)?.value).toBe(120);
    expect(horizonsOf('ok <horizons>{"propositions":[]}</horizons>')).toEqual({ propositions: [] });
    expect(horizonsOf("<horizons>pas du json</horizons>")).toBeNull();
    expect(horizonsOf("rien")).toBeNull();
  });
});

describe("le tri du jour de Jordan (16/11/2026)", () => {
  it("garde au plus les places libres, des sources connues sans doublon, et les raisons des écartées", async () => {
    const { parseTriage } = await import("@/modules/ai-team/lib/com-triage");
    const known = new Set(["pipeline-0", "pipeline-1", "sante-0", "demande-9"]);
    const text = [
      "<synthese>Deux affaires se jouent cette semaine.</synthese>",
      '<taches>[{"sources":["pipeline-0","demande-9"],"priorite":"A","titre":"Appeler Dupont BTP","pourquoi":"signature proche","etapes":["Appeler"],"message":"Bonjour"},{"sources":["pipeline-0"],"titre":"Doublon","etapes":["x"]},{"sources":["inconnue"],"titre":"Hors liste","etapes":["x"]},{"sources":["sante-0"],"titre":"Martin TP","etapes":["Appeler"]}]</taches>',
      '<ecartees>[{"id":"pipeline-1","raison":"déjà relancé hier"},{"id":"inconnue","raison":"x"}]</ecartees>',
    ].join("\n");
    const out = parseTriage(text, known, 1)!;
    expect(out.picks).toHaveLength(1);
    expect(out.picks[0]).toMatchObject({ sources: ["pipeline-0", "demande-9"], priority: "A", title: "Appeler Dupont BTP" });
    expect([...out.dropped]).toEqual([["pipeline-1", "déjà relancé hier"]]);
    expect(parseTriage("<synthese>x</synthese><taches>pas du json</taches>", known, 3)).toBeNull();
  });

  it("seul l'urgent part directement à la direction, marqué 🔴, au nom de l'agent", async () => {
    vi.resetModules();
    const filed: Record<string, unknown>[] = [];
    vi.doMock("@/modules/ai-team/lib/agent-report", async (orig) => ({
      ...(await orig<object>()),
      runAgentReport: async (_p: unknown, o: { data: () => Promise<unknown>; parse: (t: string) => unknown }) => {
        await o.data();
        o.parse('<synthese>ok</synthese><actions>[{"affaire":"c1","titre":"Relancer Dupont","pourquoi":"lead","etapes":["Appeler"]},{"affaire":"c2","titre":"Relancer Martin","pourquoi":"stagne","etapes":["Appeler"]}]</actions>');
        return { status: "fait", findings: 2 };
      },
    }));
    const { runActionsReport } = await import("@/modules/ai-team/lib/pipeline-agent");
    const payload = {
      find: async ({ collection }: { collection: string }) => ({ docs: collection === "ai-team-members" ? [{ id: 7 }] : [] }),
      create: async ({ data }: { data: Record<string, unknown> }) => (filed.push(data), data),
      logger: { warn: () => {} },
    };
    await runActionsReport(payload as never, {
      memberKey: "com-pipeline",
      kind: "pipeline",
      period: "2026-11-16",
      now: new Date(NOW),
      due: () => true,
      load: async () => ({ data: {}, measure: {}, links: new Map([["c1", "/admin/collections/partner-clients/c1"], ["c2", "/admin/collections/partner-clients/c2"]]), urgent: new Map([["c1", "Lead sans réponse depuis 3 h ouvrées"]]) }),
      system: () => "",
      ask: "",
      detail: () => "",
    });
    expect(filed).toHaveLength(1);
    expect(filed[0]).toMatchObject({ member: 7, title: "🔴 Urgent — Relancer Dupont", url: "/admin/collections/partner-clients/c1" });
    expect(String(filed[0].why)).toContain("Lead sans réponse depuis 3 h ouvrées");
    vi.doUnmock("@/modules/ai-team/lib/agent-report");
  });
});

describe("Malo tient les mots des clients (16/11/2026)", () => {
  it("ajoute en tête les phrases vérifiées mot pour mot, une fois par semaine", async () => {
    vi.resetModules();
    vi.doMock("@/modules/ai-team/lib/brief", async (orig) => ({
      ...(await orig<object>()),
      crmCorpus: async () => ({ data: { textesDuCrm: ["[E-mail reçu — Dupont BTP — 2026-11-12] Re : je passe mes soirées à ressaisir les heures des gars"] }, corpus: "[E-mail reçu — Dupont BTP — 2026-11-12] Re : je passe mes soirées à ressaisir les heures des gars" }),
    }));
    const { runClientVoice } = await import("@/modules/ai-team/lib/client-voice");
    let brief: Record<string, unknown> = { quotes: [{ quote: "Une ancienne phrase bien réelle" }], changelog: [], version: 3 };
    const payload = {
      find: async () => ({ docs: [{ id: 9, name: "Malo", active: true }] }),
      findGlobal: async () => brief,
      updateGlobal: async ({ data }: { data: Record<string, unknown> }) => (brief = { ...brief, ...data }),
      create: async () => ({}),
      findByID: async () => null,
      logger: { warn: () => {} },
    };
    const call = async () => ({ content: [{ type: "text", text: '<citations>[{"citation":"je passe mes soirées à ressaisir les heures des gars","nature":"douleur","qui":"gérant, électricité","source":"E-mail reçu — Dupont BTP"},{"citation":"phrase inventée qui n existe pas","nature":"douleur"}]</citations>' }], usage: { input_tokens: 100, output_tokens: 50 }, stop_reason: "end_turn" });
    const r = await runClientVoice(payload as never, { now: new Date("2026-11-16T10:30:00Z"), call: call as never });
    expect(r).toMatchObject({ status: "faite", added: 1 });
    expect((brief.quotes as { quote: string }[]).map((q) => q.quote)).toEqual(["je passe mes soirées à ressaisir les heures des gars", "Une ancienne phrase bien réelle"]);
    expect(brief.version).toBe(4);
    expect((await runClientVoice(payload as never, { now: new Date("2026-11-16T11:30:00Z"), call: call as never })).status).toBe("deja-faite");
    vi.doUnmock("@/modules/ai-team/lib/brief");
  });
});

describe("une revue en échec ne compte pas comme faite (16/11/2026)", () => {
  const fake = (texts: { text: string; createdAt: string }[]) => {
    const created: unknown[] = [];
    return {
      created,
      payload: {
        find: async ({ collection }: { collection: string }) =>
          collection === "ai-team-members" ? { docs: [{ id: 1, name: "Sergey", active: true }] } : { docs: [...texts.map((t, i) => ({ id: i + 1, ...t })), ...created.map((c, i) => ({ id: 100 + i, ...(c as object) }))] },
        update: async () => ({ docs: [] }),
        create: async ({ data }: { data: Record<string, unknown> }) => (created.push({ ...data, createdAt: new Date().toISOString() }), { id: 100 + created.length - 1, ...data }),
        delete: async () => ({}),
      },
    };
  };
  const o = (now: string) => ({ chiefKey: "chef-seo", missing: "x", mark: "🎯 Objectifs", title: "🎯 Objectifs — semaine", preparing: "je prépare vos objectifs", interrupted: "⏳", since: "2026-11-12T00:00:00Z", now: new Date(now), due: () => true });

  it("échec le lundi : pas de relance le jour même, rattrapage le mardi ; une revue réussie ferme la semaine", async () => {
    const { reserveChiefReview } = await import("@/modules/ai-team/lib/stale");
    const failed = [{ text: "🎯 Objectifs — semaine : je n'ai pas pu préparer vos objectifs (Plafond du jour…).", createdAt: "2026-11-16T08:51:52Z" }];
    expect(await reserveChiefReview(fake(failed).payload as never, o("2026-11-16T14:00:00Z"))).toEqual({ skip: { status: "pas-encore" } });
    const tuesday = await reserveChiefReview(fake(failed).payload as never, o("2026-11-17T08:00:00Z"));
    expect("chief" in tuesday).toBe(true);
    const done = [{ text: "🎯 Objectifs — semaine\n\nSynthèse…", createdAt: "2026-11-16T08:51:52Z" }];
    expect(await reserveChiefReview(fake(done).payload as never, o("2026-11-17T08:00:00Z"))).toEqual({ skip: { status: "deja-faite" } });
  });
});
