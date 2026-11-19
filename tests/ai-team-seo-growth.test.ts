import { describe, expect, it } from "vitest";

import { computeMastery, SEA_MASTERY_KEYS, SEO_MASTERY_KEYS, type MasteryInput } from "@/modules/ai-team/lib/mastery";
import { parseObjectiveVerdicts, parseSeoWeekly } from "@/modules/ai-team/lib/seo-weekly";
import { veilleSystem } from "@/modules/ai-team/lib/veille";
import { SEA_VEILLE_KEYS, SEO_VEILLE_KEYS, VEILLE_DOMAINS } from "@/modules/ai-team/lib/veille-domains";

/**
 * L'équipe SEO/GEO progresse comme celle de Mark (14/11/2026) : une veille
 * chaque semaine (ce qui a changé, en France et aux États-Unis), une méthode
 * réécrite, un score de maîtrise sur 100, et des preuves — les verdicts de
 * Sergey sur les objectifs tirés du travail de chacun.
 */

describe("la veille de chaque semaine", () => {
  it("toute l'équipe SEO/GEO fait sa veille, et chaque équipe garde la sienne", () => {
    expect(SEO_VEILLE_KEYS).toEqual(["chef-seo", "seo-analyste", "seo-concurrence", "seo-contenu", "seo-visibilite-ia", "seo-technique", "seo-autorite", "seo-reseaux", "seo-conversion"]);
    expect(SEA_VEILLE_KEYS).toContain("chef-sea");
    expect(SEA_VEILLE_KEYS.some((k) => k.startsWith("seo-"))).toBe(false);
    for (const k of SEO_VEILLE_KEYS) expect(VEILLE_DOMAINS[k].repere.length).toBeGreaterThan(20);
  });

  it("cherche d'abord ce qui a changé, en France ET aux États-Unis, et date chaque information", () => {
    for (const team of ["sea", "seo"] as const) {
      const sys = veilleSystem(team, "un repère");
      expect(sys).toMatch(/CE QUI A CHANGÉ/);
      expect(sys).toMatch(/ÉTATS-UNIS/);
      expect(sys).toMatch(/FRANCE/);
      expect(sys).toMatch(/## Ce qui a changé/);
      expect(sys).toContain("un repère");
    }
    expect(veilleSystem("seo", "x")).toMatch(/équipe SEO\/GEO/);
    expect(veilleSystem("sea", "x")).toMatch(/équipe SEA/);
  });
});

describe("les verdicts de Sergey", () => {
  it("ne juge qu'un objectif à juger, une fois, et jamais « trop tôt »", () => {
    const text = '<verdicts>[{"id":"7","resultat":"a-marche","lecon":"+40 % de clics"},{"id":"7","resultat":"a-empire"},{"id":"8","resultat":"trop-tot"},{"id":"99","resultat":"a-marche"}]</verdicts>';
    expect(parseObjectiveVerdicts(text, new Set(["7", "8"]))).toEqual([{ id: "7", outcome: "a-marche", lesson: "+40 % de clics" }]);
    expect(parseObjectiveVerdicts("pas de balise", new Set(["7"]))).toEqual([]);
  });

  it("un objectif dit de quel agent il reprend l'action (une clé de l'équipe, sinon personne)", () => {
    const obj = (proposePar: string) => `{"titre":"Refaire la page","etapes":[{"texte":"x","minutes":30}],"proposePar":"${proposePar}","echeance":"2026-11-16"}`;
    const text = `<synthese>ok</synthese><objectifs>[${obj("seo-contenu")},${obj("sea-meta")},${obj("chef-seo")}]</objectifs>`;
    expect(parseSeoWeekly(text, 300, ["2026-11-16"])!.objectives.map((o) => o.proposedBy)).toEqual(["seo-contenu", null, null]);
  });
});

describe("la maîtrise de l'équipe SEO/GEO", () => {
  const NOW = new Date("2026-11-16T09:00:00Z");
  const base: MasteryInput = { key: "seo-analyste", cost: null, benchmark: null, trackingPct: null, seoValue: null, lastVeilleAt: null, verdicts: [], tests: { judged: 0, applied: 0 }, now: NOW };
  const results = (i: Partial<MasteryInput>) => computeMastery({ ...base, ...i }).parts.find((p) => p.key === "resultats")!;

  it("chaque équipe a ses agents", () => {
    expect(SEO_MASTERY_KEYS).toHaveLength(9);
    expect(SEA_MASTERY_KEYS.every((k) => !SEO_MASTERY_KEYS.includes(k))).toBe(true);
  });

  it("ses résultats : un chiffre de TIM face au repère de sa veille", () => {
    expect(results({ seoValue: 2, benchmark: 2 }).points).toBe(40);
    expect(results({ seoValue: 1, benchmark: 2 }).points).toBe(20);
    expect(results({ seoValue: 1 }).points).toBe(0);
    expect(results({ seoValue: 1 }).detail).toMatch(/pas encore de repère/);
    expect(results({}).points).toBe(0);
  });

  it("Robert : la part des pages indexées, cible 100 %", () => {
    expect(results({ key: "seo-technique", seoValue: 75 }).points).toBe(30);
    expect(results({ key: "seo-technique", seoValue: 100 }).points).toBe(40);
  });

  it("ses preuves parlent d'objectifs jugés par Sergey", () => {
    const m = computeMastery({ ...base, verdicts: [{ outcome: "a-marche" }, { outcome: "sans-effet" }] });
    const p = m.parts.find((x) => x.key === "preuves")!;
    expect(p.points).toBe(10);
    expect(p.detail).toMatch(/objectif/);
  });
});

import { INTERRUPTED, isPeriodDone } from "@/modules/ai-team/lib/stale";

describe("un travail coupé en route", () => {
  it("se relance, deux fois au plus ; un travail fait ou échoué pour de bon compte comme fait", () => {
    expect(isPeriodDone([])).toBe(false);
    expect(isPeriodDone([{ status: "echec", error: INTERRUPTED }])).toBe(false);
    expect(isPeriodDone([{ status: "echec", error: INTERRUPTED }, { status: "echec", error: INTERRUPTED }])).toBe(true);
    expect(isPeriodDone([{ status: "echec", error: INTERRUPTED }, { status: "fait" }])).toBe(true);
    expect(isPeriodDone([{ status: "echec", error: "Réponse inutilisable" }])).toBe(true);
    expect(isPeriodDone([{ status: "en-cours" }])).toBe(true);
  });
});

import { isPaidStep } from "@/modules/ai-team/lib/seo-weekly";

describe("une étape de publicité payante n'a rien à faire chez Sergey", () => {
  it("est reconnue (et retirée de ses objectifs), une étape SEO non", () => {
    expect(isPaidStep("Hors SEO, à décider : couper la campagne Meta « Campagne brouillon de test » (10 €/jour)")).toBe(true);
    expect(isPaidStep("Baisser le budget de la campagne Google Ads marque")).toBe(true);
    expect(isPaidStep("Couper la publicité payante sur Instagram")).toBe(true);
    expect(isPaidStep("Se connecter à Bing Webmaster Tools et soumettre le sitemap")).toBe(false);
    expect(isPaidStep("Lire la page du numéro 1 sur Google pour « logiciel BTP »")).toBe(false);
  });

  it("disparaît de l'objectif à la lecture de la revue, et part dans la liste pour Mark", () => {
    const text = `<synthese>ok</synthese><objectifs>[{"titre":"Rebrancher Bing","etapes":[{"texte":"Rebrancher la clé d'API","minutes":15},{"texte":"Hors SEO, à décider : couper la campagne Meta test","minutes":5}],"echeance":"2026-11-16"}]</objectifs>`;
    const r = parseSeoWeekly(text, 300, ["2026-11-16"])!;
    expect(r.objectives[0].steps.map((x) => x.text)).toEqual(["Rebrancher la clé d'API"]);
    expect(r.objectives[0].minutes).toBe(15);
    expect(r.paid).toEqual(["Hors SEO, à décider : couper la campagne Meta test"]);
  });
});
