import { describe, expect, it } from "vitest";

import { checkParams, defaultParams, describeParams, paramSpecs } from "@/modules/ads/video/element-params";
import { ELEMENT_TYPES } from "@/modules/ads/video/elements";
import { buildRenderProps } from "@/modules/ads/video/props";
import { parseScore } from "@/modules/ads/video/score";

/** Les réglages des éléments (atelier des éléments) : ce qu'on peut changer sans toucher au code, vérifié. */

describe("le contrat des réglages", () => {
  it("chaque élément a des réglages, dont les communs (taille, vitesse, rebond)", () => {
    for (const t of ELEMENT_TYPES) {
      const keys = paramSpecs(t).map((s) => s.key);
      expect(keys).toEqual(expect.arrayContaining(["taille_texte", "vitesse", "rebond"]));
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  it("une valeur hors contrat est refusée avec la raison, jamais appliquée ; le reste prend le défaut", () => {
    const r = checkParams("liste", { coche: "carre", vitesse: 9, surface: "verre", inconnu: 1, avatars: "oui" });
    expect(r.params).toMatchObject({ coche: "carre", surface: "verre", vitesse: 1, avatars: true, cadence: 1 });
    expect(r.errors).toEqual([
      expect.stringMatching(/Vitesse des animations : 9 hors de la plage 0.5 à 2/),
      expect.stringMatching(/Réglage « inconnu » inconnu/),
      expect.stringMatching(/Initiales en pastille : oui ou non attendu/),
    ]);
  });

  it("les défauts, et la description lue par l'IA", () => {
    expect(defaultParams("titre")).toMatchObject({ graisse: 900, casse: "style", contour: false });
    expect(describeParams("surbrillance")).toMatch(/assombrir \(Assombrir le reste\) : 0 à 0.8 ; défaut 0.45/);
  });
});

describe("au rendu", () => {
  const ctx = { format: "9x16" as const, style: {}, kit: {}, cta: "En savoir plus", rushes: new Map(), facts: new Map() };
  const score = parseScore({
    shots: [
      { kind: "compo", seconds: 3, fond: { type: "style" }, elements: [{ type: "badge", variante: 7, data: { texte: "Validé" }, x: 0.5, y: 0.5, debut: 0 }, { type: "badge", variante: 8, data: { texte: "Validé" }, x: 0.5, y: 0.7, debut: 0 }] },
      { kind: "fin", seconds: 2 },
    ],
  });

  it("un élément prend les réglages de sa variante ; une variante d'un autre type, ou absente, laisse les défauts", () => {
    const p = buildRenderProps(score, { ...ctx, variants: new Map([[7, { type: "badge", params: { couleur: "principale", icone: "etoile" } }], [8, { type: "liste", params: { couleur: "clair" } }]]) });
    const els = (p.shots[0] as { elements: { params: Record<string, unknown> }[] }).elements;
    expect(els[0].params).toMatchObject({ couleur: "principale", icone: "etoile", vitesse: 1 });
    expect(els[1].params).toMatchObject({ couleur: "accent", icone: "coche" });
  });
});
