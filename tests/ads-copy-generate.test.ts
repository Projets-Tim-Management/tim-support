import { describe, expect, it } from "vitest";

import { claudeCostUsd, usdToEur } from "@/core/lib/ai-pricing";
import { CopyModelError, type ModelCall } from "@/modules/ads/lib/copy/claude";
import { creativeFromAngle, generateCreatives, missingBrief, publishable, type GenerateOptions } from "@/modules/ads/lib/copy/generate";
import { systemPrompt, userPrompt, type CopyAngle } from "@/modules/ads/lib/copy/prompt";
import { ADS_TEXT_MODEL } from "@/modules/ads/lib/models";

const NOW = new Date("2026-09-29T10:00:00Z");
const FACT = { id: 7, statement: "Nos clients gagnent 2 h par semaine sur le pointage", source: "Enquête, mars 2026", active: true };
const CAMPAIGN = {
  id: 4,
  name: "Pointage BTP",
  brief: { audience: "Conducteurs de travaux", pain: "Le pointage papier", offer: "Démo de 30 minutes", promise: "Un pointage juste", proofs: [FACT], forbidden: "révolutionnaire", cta: "reserver", tone: "vous" as const, angles: [] },
};

function memory(opts: { campaign?: unknown; settings?: Record<string, unknown>; kit?: Record<string, unknown>; creativesThisWeek?: number; spentToday?: number } = {}) {
  const created: { collection: string; data: Record<string, unknown> }[] = [];
  const payload = {
    findByID: async () => opts.campaign ?? CAMPAIGN,
    findGlobal: async ({ slug }: { slug: string }) =>
      slug === "ads-brand-kit" ? { defaultTone: "vous", forbidden: [{ term: "n°1" }], ...(opts.kit ?? {}) } : { enabled: true, textDailyEur: 5, textMonthlyEur: 50, creativesPerCampaignPerWeek: 6, ...(opts.settings ?? {}) },
    count: async () => ({ totalDocs: opts.creativesThisWeek ?? 0 }),
    find: async () => ({ docs: opts.spentToday ? [{ eur: opts.spentToday }] : [] }),
    create: async ({ collection, data }: { collection: string; data: Record<string, unknown> }) => (created.push({ collection, data }), { id: created.length, ...data }),
  };
  return { payload: payload as never, created };
}

const angle = (over: Partial<CopyAngle> = {}): CopyAngle => ({
  angle: "Le pointage papier coûte cher",
  hook: "Finie la feuille de temps",
  tone: "vous",
  test: "aucun",
  primaryTexts: ["Gagnez 2 h par semaine sur le pointage de vos équipes.", "Vos équipes pointent depuis le chantier, en 3 clics.", "Réservez une démo de 30 minutes.", "Un outil révolutionnaire.", "Le pointage, enfin simple."],
  headlines: ["Le pointage sans papier", "Démo de 30 minutes", "Pointez depuis le chantier", "Moins de ressaisie", "Des heures justes"],
  descriptions: ["Démo gratuite", "Sans engagement", "Pour le BTP"],
  factIds: ["7", "99"],
  ...over,
});

const USAGE = { input: 4000, output: 3000, cacheRead: 0, cacheWrite: 1500 };
const model = (angles: CopyAngle[]): ModelCall & { calls: number } => {
  const state = { calls: 0 };
  const call: ModelCall = async () => {
    state.calls++;
    return { result: { angles }, usage: USAGE };
  };
  return Object.assign(call, { get calls() { return state.calls; } });
};
const OPTS: GenerateOptions = { angles: 1, toneTest: false };

describe("avant l'appel : rien ne part si une condition manque", () => {
  it("brief incomplet", async () => {
    const m = model([angle()]);
    const { payload } = memory({ campaign: { ...CAMPAIGN, brief: { ...CAMPAIGN.brief, pain: "" } } });
    await expect(generateCreatives(payload, 4, OPTS, { call: m, now: NOW })).rejects.toThrow(/il manque la douleur/);
    expect(m.calls).toBe(0);
    expect(missingBrief({ id: 1, name: "x", brief: {} })).toEqual(["la cible", "la douleur", "l'offre"]);
  });

  it("quota de la semaine", async () => {
    const m = model([angle()]);
    const { payload } = memory({ creativesThisWeek: 5 });
    await expect(generateCreatives(payload, 4, { angles: 1, toneTest: true }, { call: m, now: NOW })).rejects.toThrow(/Quota de la semaine : 5 créa\(s\) sur 6/);
    expect(m.calls).toBe(0);
  });

  it("budget du jour : le coût MAXIMAL doit tenir", async () => {
    const m = model([angle()]);
    const { payload } = memory({ spentToday: 4.9 });
    await expect(generateCreatives(payload, 4, OPTS, { call: m, now: NOW })).rejects.toThrow(/Plafond du jour/);
    expect(m.calls).toBe(0);
  });

  it("interrupteur général coupé", async () => {
    const m = model([angle()]);
    const { payload } = memory({ settings: { enabled: false } });
    await expect(generateCreatives(payload, 4, OPTS, { call: m, now: NOW })).rejects.toThrow(/Interrupteur/);
    expect(m.calls).toBe(0);
  });
});

describe("après l'appel", () => {
  it("inscrit la dépense réelle, puis une créa brouillon par angle, textes passés aux garde-fous", async () => {
    const m = model([angle()]);
    const { payload, created } = memory();
    const r = await generateCreatives(payload, 4, OPTS, { call: m, now: NOW });

    const usage = created.find((c) => c.collection === "ad-ai-usage")!.data;
    expect(usage).toMatchObject({ kind: "texte", model: ADS_TEXT_MODEL, campaign: 4 });
    expect(usage.usd).toBeCloseTo(claudeCostUsd(ADS_TEXT_MODEL, USAGE), 4);

    const crea = created.find((c) => c.collection === "ad-creatives")!.data as { copy: { text: string; status: string; reason: string | null }[]; status: string; cta: string; facts: unknown[]; tone: string; tests: unknown[] };
    expect(crea).toMatchObject({ status: "brouillon", cta: "reserver", tone: "vous", tests: [] });
    // Le fait inconnu (99) n'est pas retenu
    expect(crea.facts).toEqual([7]);
    // « 3 clics » : chiffre non sourcé ; « révolutionnaire » : interdit de campagne
    const rejected = crea.copy.filter((t) => t.status === "rejete").map((t) => t.reason);
    expect(rejected).toEqual(expect.arrayContaining([expect.stringMatching(/non sourcé : 3/), expect.stringMatching(/révolutionnaire/)]));
    expect(r.texts.rejected).toBe(2);
    expect(r.costEur).toBeCloseTo(usdToEur(claudeCostUsd(ADS_TEXT_MODEL, USAGE)), 6);
    expect(r.created).toHaveLength(1);
  });

  it("étiquette la variante en tutoiement « test de ton », même si le modèle l'oublie", async () => {
    const tu = angle({ tone: "tu", test: "aucun", primaryTexts: ["Gagne 2 h par semaine sur ton pointage."], headlines: ["Ton pointage sans papier"], descriptions: ["Démo gratuite"], hook: "Finie ta feuille de temps" });
    const m = model([angle(), tu]);
    const { payload, created } = memory();
    const r = await generateCreatives(payload, 4, { angles: 1, toneTest: true }, { call: m, now: NOW });
    const creas = created.filter((c) => c.collection === "ad-creatives").map((c) => c.data as { tone: string; tests: unknown[] });
    expect(creas[1]).toMatchObject({ tone: "tu", tests: [{ dimension: "ton", value: "tu" }] });
    expect(r.toneTests).toBe(1);
  });

  it("une réponse refusée est facturée : la dépense est inscrite, l'erreur relayée", async () => {
    const failing: ModelCall = async () => {
      throw Object.assign(new CopyModelError("Claude a décliné"), { usage: USAGE });
    };
    const { payload, created } = memory();
    await expect(generateCreatives(payload, 4, OPTS, { call: failing, now: NOW })).rejects.toThrow(/décliné/);
    expect(created.filter((c) => c.collection === "ad-ai-usage")).toHaveLength(1);
    expect(created.filter((c) => c.collection === "ad-creatives")).toHaveLength(0);
  });
});

describe("demandée par l'agent de campagne (décisions du 30/09/2026)", () => {
  const prompts: string[] = [];
  const recording = (angles: CopyAngle[]): ModelCall => async ({ user }) => {
    prompts.push(user);
    return { result: { angles }, usage: USAGE };
  };
  const agentOpts = (preCheck: (maxEur: number) => Promise<void> = async () => {}): GenerateOptions => ({ angles: 1, toneTest: true, agent: { run: 12, agent: 30, angles: ["Le temps perdu à ressaisir"], preCheck } });

  it("passe les angles de l'agent au prompt sans toucher au brief, et garde l'angle demandé sur chaque créa", async () => {
    prompts.length = 0;
    const tu = angle({ angle: "Ta ressaisie te coûte cher", tone: "tu" });
    const { payload, created } = memory();
    await generateCreatives(payload, 4, agentOpts(), { call: recording([angle({ angle: "Ressaisir coûte cher" }), tu]), now: NOW });
    expect(prompts[0]).toContain("Angles imposés, dans cet ordre : « Le temps perdu à ressaisir »");
    expect(CAMPAIGN.brief.angles).toEqual([]); // le brief saisi n'a pas bougé
    expect(created.some((c) => c.collection === "ad-campaigns")).toBe(false);
    const creas = created.filter((c) => c.collection === "ad-creatives").map((c) => c.data);
    // Le test de ton reprend le premier angle : il en porte l'origine.
    expect(creas).toEqual([
      expect.objectContaining({ angle: "Ressaisir coûte cher", requestedAngle: "Le temps perdu à ressaisir", run: 12, origin: "agent" }),
      expect.objectContaining({ angle: "Ta ressaisie te coûte cher", requestedAngle: "Le temps perdu à ressaisir", run: 12, origin: "agent" }),
    ]);
  });

  it("une seule ligne de dépense, de nature « texte », rattachée au passage et à l'agent", async () => {
    const { payload, created } = memory();
    await generateCreatives(payload, 4, agentOpts(), { call: recording([angle()]), now: NOW });
    const usage = created.filter((c) => c.collection === "ad-ai-usage");
    expect(usage).toHaveLength(1);
    expect(usage[0].data).toMatchObject({ kind: "texte", campaign: 4, run: 12, agent: 30 });
  });

  it("le contrôle de l'agent reçoit le coût maximal, et s'il refuse, rien ne part", async () => {
    let seen = 0;
    const refuse = async (maxEur: number) => {
      seen = maxEur;
      throw new Error("Budget de l'agent épuisé");
    };
    const m = model([angle()]);
    const { payload, created } = memory();
    await expect(generateCreatives(payload, 4, agentOpts(refuse), { call: m, now: NOW })).rejects.toThrow(/Budget de l'agent épuisé/);
    expect(seen).toBeGreaterThan(0);
    expect(m.calls).toBe(0);
    expect(created).toHaveLength(0);
  });

  it("les plafonds de l'atelier s'appliquent aussi : le plus strict l'emporte", async () => {
    const check = { called: false };
    const { payload } = memory({ spentToday: 4.9 });
    await expect(generateCreatives(payload, 4, agentOpts(async () => void (check.called = true)), { call: model([angle()]), now: NOW })).rejects.toThrow(/Plafond du jour/);
    expect(check.called).toBe(false);
  });

  it("sans agent, une créa garde l'origine « générée » et aucun angle demandé", () => {
    const c = creativeFromAngle(angle(), { brief: { ...CAMPAIGN.brief, campaign: "x", ctaValue: "reserver", facts: [FACT], forbidden: [] } as never, forbidden: [], campaignId: 4, batch: "b", costEur: 0 });
    expect(c).toMatchObject({ origin: "generee", requestedAngle: null, run: null });
  });
});

describe("une créa à partir d'un angle", () => {
  const brief = { campaign: "C", cta: "Réserver", ctaValue: "reserver", tone: "vous" as const, angles: [], facts: [{ id: 7, statement: FACT.statement, source: FACT.source }], forbidden: [], offer: "Démo de 30 minutes" };
  it("remplace une accroche rejetée par le premier titre passé, jamais l'inverse", () => {
    const c = creativeFromAngle(angle({ hook: "Déjà 1 000 entreprises conquises" }), { brief, forbidden: [], campaignId: 4, batch: "b", costEur: 0.1 });
    expect(c.hook).toBe("Le pointage sans papier");
  });
  it("ne garde pas plus de variantes que Meta n'en accepte", () => {
    const c = creativeFromAngle(angle({ headlines: Array.from({ length: 8 }, (_, i) => `Titre ${i}`) }), { brief, forbidden: [], campaignId: 4, batch: "b", costEur: 0 });
    expect(c.copy.filter((t) => t.kind === "titre")).toHaveLength(5);
  });
  it("une créa publiable a au moins un texte principal et un titre passés", () => {
    expect(publishable([{ kind: "principal", status: "ok" }, { kind: "titre", status: "ok" }])).toBe(true);
    expect(publishable([{ kind: "principal", status: "ok" }, { kind: "titre", status: "rejete" }])).toBe(false);
  });
});

describe("le prompt", () => {
  it("énonce les règles, les interdits et le ton ; les faits avec leur identifiant", () => {
    const sys = systemPrompt({ defaultTone: "vous", forbidden: ["n°1"] });
    expect(sys).toMatch(/Aucun chiffre qui ne figure pas/);
    expect(sys).toMatch(/Aucun témoignage/);
    expect(sys).toMatch(/« n°1 »/);
    const user = userPrompt({ campaign: "C", cta: "Réserver", ctaValue: "reserver", tone: "vous", angles: [], facts: [{ id: 7, statement: "2 h", source: "Enquête" }], forbidden: [] }, { angles: 2, toneTest: true });
    expect(user).toMatch(/\[7\] 2 h \(source : Enquête\)/);
    expect(user).toMatch(/TEST DE TON/);
    expect(user).toMatch(/reprend EXACTEMENT le premier angle/);
  });
});
