import { describe, expect, it } from "vitest";

import { diagnose, expectedCtr } from "@/modules/editorial/lib/articles/performance";

const NOW = new Date("2026-11-19T10:00:00Z");
const art = (o: Record<string, unknown>) => ({ status: "publie", publishedAt: "2026-06-01T08:00:00Z", gscClicks: 100, gscImpressions: 5000, gscPosition: 8, gscClicks28: 12, gscClicks28Prev: 11, ...o });

describe("diagnostic de performance d'un article", () => {
  it("pas en ligne, ou trop récent : pas de verdict", () => {
    expect(diagnose(art({ status: "programme" }), NOW).verdict).toBe("hors-ligne");
    expect(diagnose(art({ publishedAt: "2026-11-05T08:00:00Z" }), NOW).verdict).toBe("observation");
    expect(diagnose(art({ gscImpressions: null }), NOW).verdict).toBe("observation");
  });
  it("Google ne le montre presque pas → à améliorer (mot-clé, indexation)", () => {
    const d = diagnose(art({ gscImpressions: 60, gscClicks: 0 }), NOW);
    expect(d.verdict).toBe("a-ameliorer");
    expect(d.why).toMatch(/impressions par mois/);
  });
  it("clics en baisse de plus de 30 % → à améliorer, reprise « baisse »", () => {
    const d = diagnose(art({ gscClicks28: 6, gscClicks28Prev: 20 }), NOW);
    expect(d).toMatchObject({ verdict: "a-ameliorer", refreshReason: "baisse" });
  });
  it("au-delà de la 20ᵉ place → à améliorer (contenu)", () => {
    expect(diagnose(art({ gscPosition: 34 }), NOW)).toMatchObject({ verdict: "a-ameliorer", refreshReason: "position" });
  });
  it("top 3 bien cliqué → performe ; top 3 peu cliqué → moyen (GEO)", () => {
    expect(diagnose(art({ gscPosition: 2, gscClicks: 900, gscImpressions: 5000 }), NOW).verdict).toBe("performe");
    expect(diagnose(art({ gscPosition: 2, gscClicks: 100, gscImpressions: 5000 }), NOW)).toMatchObject({ verdict: "moyen", refreshReason: "format" });
  });
  it("position 4-20 peu cliquée → moyen (titre et description)", () => {
    const d = diagnose(art({ gscPosition: 8, gscClicks: 20, gscImpressions: 5000 }), NOW);
    expect(d.verdict).toBe("moyen");
    expect(d.action).toMatch(/titre et la description/);
  });
  it("50 clics sur 28 jours → performe", () => {
    expect(diagnose(art({ gscPosition: 6, gscClicks28: 60, gscClicks28Prev: 55, gscClicks: 600 }), NOW).verdict).toBe("performe");
  });
  it("taux de clic habituel décroissant avec la position", () => {
    expect(expectedCtr(1)).toBeGreaterThan(expectedCtr(5));
    expect(expectedCtr(5)).toBeGreaterThan(expectedCtr(15));
  });
});

describe("diagnostic : mot-clé hors sujet et DataForSEO", () => {
  it("repère un mot-clé qui ne correspond pas au titre", async () => {
    const { keywordOffTopic } = await import("@/modules/editorial/lib/articles/performance");
    expect(keywordOffTopic("paie btp", "Repos compensateur dans le BTP : règles et calcul 2026")).toBe(true);
    expect(keywordOffTopic("repos compensateur btp", "Repos compensateur dans le BTP : règles et calcul 2026")).toBe(false);
    expect(keywordOffTopic("", "Titre")).toBe(false);
  });
  it("le mot-clé hors sujet passe en premier dans le pourquoi et l'action", () => {
    const d = diagnose(art({ title: "Repos compensateur dans le BTP", keyword: "paie btp", gscPosition: 34 }), NOW);
    expect(d.why).toMatch(/ne correspond pas au sujet/);
    expect(d.action).toMatch(/^D'abord : choisir le vrai mot-clé/);
  });
  it("top 3 peu cliqué sans réponse IA : c'est le titre, pas le GEO", () => {
    const d = diagnose(art({ title: "Grille salaire", keyword: "grille salaire", gscPosition: 2, gscClicks: 100, gscImpressions: 5000 }), NOW, { keyword: "grille salaire", volume: 1600, checkedAt: "2026-11-19", aiOverview: false, aiCited: false });
    expect(d).toMatchObject({ verdict: "moyen", refreshReason: "autre" });
    expect(d.why).toMatch(/Pas de réponse IA/);
  });
  it("mot-clé presque pas recherché (volume DataForSEO) : recentrer le mot-clé", () => {
    const d = diagnose(art({ title: "Grille salaire", keyword: "grille salaire", gscImpressions: 60 }), NOW, { keyword: "grille salaire", volume: 10 });
    expect(d.action).toMatch(/Recentrer/);
  });
});
