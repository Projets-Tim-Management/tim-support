import { describe, expect, it } from "vitest";

import { buildFeatureFilters, canonical, countFor, platformOf, whereFor } from "@/modules/editorial/lib/feature-filters";

const CATS = [
  { id: 1, name: "Web" },
  { id: 2, name: "Mobile" },
  { id: 10, name: "Chantier", parent: 1 },
  { id: 11, name: "Chiffres", parent: 1 },
  { id: 12, name: "Photos", parent: 10 },
  { id: 20, name: "Chantier", parent: 2 },
  { id: 21, name: "Pointage", parent: { id: 2 } },
];
const PLATS = [
  { id: 100, name: "Web", slug: "web" },
  { id: 101, name: "Application mobile", slug: "mobile" },
];
const F = buildFeatureFilters(CATS, PLATS);

describe("filtres de la liste des features", () => {
  it("reconnaît la plateforme d'un nom", () => {
    expect(platformOf("Web")).toBe("web");
    expect(platformOf("Application mobile")).toBe("mobile");
    expect(platformOf("Planning")).toBeNull();
  });

  it("range sous chaque plateforme toute son arborescence, sections comprises", () => {
    expect(F.platforms.web.catIds.sort()).toEqual(["1", "10", "11", "12"]);
    expect(F.platforms.web.sections.map((s) => s.label)).toEqual(["Chantier", "Chiffres"]);
    // Une sous-catégorie appartient à sa section.
    expect(F.platforms.web.sections[0].ids.sort()).toEqual(["10", "12"]);
    expect(F.platforms.mobile.sections.map((s) => s.label)).toEqual(["Chantier", "Pointage"]);
  });

  it("réunit les sections de même nom quand aucune plateforme n'est choisie", () => {
    const chantier = F.allSections.find((s) => s.key === "chantier")!;
    expect(chantier.ids.sort()).toEqual(["10", "12", "20"]);
    expect(F.allSections.map((s) => s.label)).toEqual(["Chantier", "Chiffres", "Pointage"]);
  });

  it("réunit « Chantier » et « Chantiers » sous « Toutes », sous le libellé le plus long", () => {
    const g = buildFeatureFilters(
      [{ id: 1, name: "Web" }, { id: 2, name: "Mobile" }, { id: 3, name: "Chantiers", parent: 1 }, { id: 4, name: "Chantier", parent: 2 }],
      [],
    );
    expect(g.allSections.map((s) => [s.label, s.ids.sort()])).toEqual([["Chantiers", ["3", "4"]]]);
    // Par plateforme, chacune garde son propre libellé.
    expect(g.platforms.mobile.sections[0].label).toBe("Chantier");
  });

  it("compte par plateforme (catégorie OU étiquette plateforme) et par section", () => {
    const feats = [
      { categories: [12], platforms: [] }, // Web › Chantier › Photos
      { categories: [{ id: 20 }] }, // Mobile › Chantier
      { categories: [], platforms: [101] }, // étiquetée Mobile sans catégorie
      { categories: [11] }, // Web › Chiffres
    ];
    expect(countFor(F, feats, null, null)).toBe(4);
    expect(countFor(F, feats, "web", null)).toBe(2);
    expect(countFor(F, feats, "mobile", null)).toBe(2);
    expect(countFor(F, feats, null, "chantier")).toBe(2);
    expect(countFor(F, feats, "web", "chantier")).toBe(1);
  });

  it("produit une condition vide sans filtre, et une condition qui ne rend rien pour une section inconnue", () => {
    expect(whereFor(F, null, null)).toEqual({});
    expect(whereFor(F, "web", "inconnue")).toEqual({
      and: [{ or: [{ categories: { in: ["1", "10", "11", "12"] } }, { platforms: { in: ["100"] } }] }, { id: { equals: -1 } }],
    });
  });

  it("reconnaît le filtre relu depuis l'URL (tableaux en objets, nombres en texte)", () => {
    const w = whereFor(F, "mobile", "chantier");
    const fromUrl = {
      and: {
        "0": { or: { "0": { categories: { in: { "0": "2", "1": "20", "2": "21" } } }, "1": { platforms: { in: { "0": "101" } } } } },
        "1": { categories: { in: { "0": "20" } } },
      },
    };
    expect(JSON.stringify(canonical(fromUrl))).toBe(JSON.stringify(canonical(w)));
  });
});
