import { describe, expect, it } from "vitest";

import { categoryAndDescendants } from "@/modules/editorial/lib/category-tree";

const terms = [
  { id: 1, name: "Mobile", slug: "mobile", parent: 0 },
  { id: 2, name: "Chantier", slug: "chantier", parent: 1 },
  { id: 3, name: "Info", slug: "info", parent: 2 },
  { id: 4, name: "Pointage", slug: "pointage", parent: 1 },
];

describe("catégorie et sous-catégories", () => {
  it("« Chantier » inclut « Chantier › Info »", () => {
    expect([...categoryAndDescendants(terms, "chantier")].sort()).toEqual([2, 3]);
  });
  it("la racine inclut toute la branche", () => {
    expect(categoryAndDescendants(terms, "mobile").size).toBe(4);
  });
  it("une feuille ne contient qu'elle-même", () => {
    expect([...categoryAndDescendants(terms, "info")]).toEqual([3]);
  });
  it("un slug inconnu ne contient rien", () => {
    expect(categoryAndDescendants(terms, "nope").size).toBe(0);
  });
});
