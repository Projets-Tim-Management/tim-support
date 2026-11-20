import { describe, expect, it } from "vitest";

import { changesSummary, judge, judgeChanges, withChange, type ChangeEntry } from "@/modules/editorial/lib/articles/changes";
import { suggestKeyword } from "@/modules/editorial/lib/articles/performance";

const NOW = new Date("2026-11-19T10:00:00Z");

describe("mesure des modifications d'un article en ligne", () => {
  it("note les chiffres d'avant ; rien pour un article pas en ligne", () => {
    const log = withChange({ status: "publie", gscClicks28: 12, gscPosition: 8.4 }, "maj-auto", "raison : baisse", NOW);
    expect(log).toEqual([{ le: "2026-11-19", type: "maj-auto", detail: "raison : baisse", avant: { clics28: 12, position: 8.4 } }]);
    expect(withChange({ status: "programme" }, "tiroir", "titre", NOW)).toBeNull();
  });
  it("deux modifications le même jour se fondent", () => {
    const a = { status: "publie", gscClicks28: 5, changesLog: [{ le: "2026-11-19", type: "tiroir", detail: "titre", avant: { clics28: 5, position: null } }] };
    expect(withChange(a, "tiroir", "introduction", NOW)).toEqual([{ le: "2026-11-19", type: "tiroir", detail: "titre ; introduction", avant: { clics28: 5, position: null } }]);
  });
  it("verdict : mieux, moins bien, stable", () => {
    expect(judge({ clics28: 10, position: 9 }, { clics28: 15, position: 8.5 }).verdict).toBe("mieux");
    expect(judge({ clics28: 10, position: 9 }, { clics28: 6, position: 9.2 }).verdict).toBe("moins-bien");
    expect(judge({ clics28: 10, position: 9 }, { clics28: 11, position: 9.3 }).verdict).toBe("stable");
    expect(judge({ clics28: 2, position: 14 }, { clics28: 2, position: 11 }).verdict).toBe("mieux"); // 3 places gagnées
  });
  it("jugée seulement après 31 jours ; une modification suivie d'une autre trop tôt n'est pas jugée seule", () => {
    const log: ChangeEntry[] = [
      { le: "2026-10-01", type: "maj-auto", detail: "a", avant: { clics28: 10, position: 9 } },
      { le: "2026-10-10", type: "tiroir", detail: "b", avant: { clics28: 10, position: 9 } },
      { le: "2026-11-10", type: "mot-cle", detail: "c", avant: { clics28: 10, position: 9 } },
    ];
    const out = judgeChanges({ status: "publie", gscClicks28: 20, gscPosition: 6, changesLog: log }, NOW) as ChangeEntry[];
    expect(out[0].lecture).toMatch(/effets mêlés/);
    expect(out[1].verdict).toBe("mieux");
    expect(out[2].verdict).toBeUndefined();
    expect(changesSummary([{ title: "T", changesLog: out }]).enAttenteDeVerdict).toBe(1);
  });
});

describe("mot-clé suggéré d'après les requêtes Search Console", () => {
  it("la requête la plus vue qui parle du sujet, jamais la marque", () => {
    const qs = [
      { requete: "tim management", impressions: 900 },
      { requete: "application pointage chantier", impressions: 500 },
      { requete: "panier repas btp", impressions: 44 },
      { requete: "panier btp 2026", impressions: 49 },
    ];
    expect(suggestKeyword(qs, "Panier repas BTP 2026 : montants imposables")).toBe("panier btp 2026");
    expect(suggestKeyword([], "Titre")).toBeNull();
  });
});
