import { describe, expect, it } from "vitest";

import { computeMastery, type MasteryInput } from "@/modules/ai-team/lib/mastery";
import { costPerQualified, parseBenchmark, trackingPct } from "@/modules/ai-team/lib/objectives";
import type { Figures } from "@/modules/ai-team/lib/scorecard";
import { parseVeille } from "@/modules/ai-team/lib/veille";

const fig = (spend: number, qualified: number): Figures => ({ spend, leads: qualified * 3, qualified, won: 0, costPerLead: null, costPerQualified: qualified ? Math.round((spend / qualified) * 100) / 100 : null, costPerWon: null, qualifiedRate: null });

describe("Mesures de résultat", () => {
  it("canal : son coût par lead qualifié ; Margaux : toute la publicité payante, sans le SEO", () => {
    const rows = [
      { key: "google", now: fig(1000, 5) },
      { key: "chatgpt", now: fig(900, 3) },
      { key: "meta", now: fig(0, 0) },
      { key: "seo", now: fig(0, 9) },
    ];
    expect(costPerQualified(rows, "google")).toBe(200);
    expect(costPerQualified(rows, "meta")).toBeNull();
    expect(costPerQualified(rows, null)).toBe(237.5);
    expect(trackingPct({ leads: 40, known: 34 })).toBe(85);
    expect(trackingPct({ leads: 0, known: 0 })).toBeNull();
  });
});

describe("Score de maîtrise : la cible est 100, à eux de s'en approcher", () => {
  const NOW = new Date("2026-11-16T10:00:00Z");
  const base: MasteryInput = { key: "sea-google", cost: null, benchmark: null, trackingPct: null, lastVeilleAt: null, verdicts: [], tests: { judged: 0, applied: 0 }, now: NOW };
  const part = (m: ReturnType<typeof computeMastery>, k: string) => m.parts.find((p) => p.key === k)!;

  it("un agent qui démarre : 0, et chaque part dit ce qui la débloque", () => {
    const m = computeMastery(base);
    expect(m.score).toBe(0);
    expect(m.parts.every((p) => p.next)).toBe(true);
  });

  it("résultats : 40 au niveau du marché, 0 à deux fois le marché, linéaire entre les deux", () => {
    expect(part(computeMastery({ ...base, cost: 120, benchmark: 140 }), "resultats").points).toBe(40);
    expect(part(computeMastery({ ...base, cost: 210, benchmark: 140 }), "resultats").points).toBe(20);
    expect(part(computeMastery({ ...base, cost: 300, benchmark: 140 }), "resultats").points).toBe(0);
    // Yanis : la part des leads au canal connu.
    expect(part(computeMastery({ ...base, key: "sea-mesure", trackingPct: 90 }), "resultats").points).toBe(36);
  });

  it("à jour : 20 avec la veille de la semaine, −5 par semaine de retard", () => {
    const daysAgo = (d: number) => new Date(NOW.getTime() - d * 86_400_000).toISOString();
    expect(part(computeMastery({ ...base, lastVeilleAt: daysAgo(1) }), "ajour").points).toBe(20);
    expect(part(computeMastery({ ...base, lastVeilleAt: daysAgo(10) }), "ajour").points).toBe(15);
    expect(part(computeMastery({ ...base, lastVeilleAt: daysAgo(40) }), "ajour").points).toBe(0);
  });

  it("preuves et apprentissage : ce qui a marché, et ses idées testées", () => {
    const m = computeMastery({ ...base, verdicts: [{ outcome: "a-marche" }, { outcome: "sans-effet" }, { outcome: "a-marche" }, { outcome: "a-empire" }], tests: { judged: 0, applied: 1 } });
    expect(part(m, "preuves").points).toBe(10);
    expect(part(m, "apprentissage").points).toBe(10);
    expect(part(computeMastery({ ...base, tests: { judged: 1, applied: 0 } }), "apprentissage").points).toBe(20);
  });

  it("un agent excellent approche 100 — et le perd s'il arrête sa veille", () => {
    const top = { ...base, cost: 100, benchmark: 140, lastVeilleAt: new Date(NOW.getTime() - 86_400_000).toISOString(), verdicts: [{ outcome: "a-marche" }], tests: { judged: 1, applied: 0 } };
    expect(computeMastery(top).score).toBe(100);
    // Trois semaines plus tard sans veille (22 jours depuis la dernière) : 3 semaines de retard, −15.
    expect(computeMastery({ ...top, now: new Date(NOW.getTime() + 21 * 86_400_000) }).score).toBe(85);
  });
});

describe("Repère du marché : rapporté par la veille, vérifié", () => {
  it("garde un chiffre positif et une source https ; écarte le reste", () => {
    expect(parseBenchmark({ valeur: "142.5", unite: "€", libelle: "Coût par SQL, SaaS B2B", source: "https://exemple.fr/etude" })).toEqual({ valeur: 142.5, unite: "€", libelle: "Coût par SQL, SaaS B2B", source: "https://exemple.fr/etude" });
    expect(parseBenchmark({})).toBeNull();
    expect(parseBenchmark({ valeur: 100, source: "javascript:alert(1)" })).toBeNull();
    expect(parseBenchmark({ valeur: -3, source: "https://exemple.fr" })).toBeNull();
  });

  it("la veille le lit dans sa balise, et vit sans", () => {
    const method = `## Mes principes\n${"Détail. ".repeat(40)}`;
    const out = parseVeille(`<methode>${method}</methode><changements>-</changements><idees>[]</idees><repere>{"valeur": 120, "unite": "€", "libelle": "CPL B2B", "source": "https://exemple.fr/a"}</repere>`)!;
    expect(out.benchmark).toMatchObject({ valeur: 120, source: "https://exemple.fr/a" });
    expect(parseVeille(`<methode>${method}</methode><repere>{}</repere>`)!.benchmark).toBeNull();
  });
});
