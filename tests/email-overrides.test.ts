import { describe, expect, it } from "vitest";

import { normalizeTexts } from "@/modules/marketing/lib/email-overrides";

/**
 * Les textes du parcours repris à la main.
 *
 * La règle qui rend l'opération sûre tient en une phrase : VIDE = LE TEXTE DU
 * CODE. Sans elle, un champ effacé amputerait un message parti chez un client,
 * et il n'y aurait aucun moyen de revenir en arrière.
 */
describe("blocs repris à la main", () => {
  it("écarte les blocs vides : un champ effacé ramène le texte d'origine", () => {
    expect(
      normalizeTexts([
        { slot: "intro", value: "Bonjour à tous" },
        { slot: "final", value: "   " },
        { slot: "autre", value: "" },
      ]),
    ).toEqual({ intro: "Bonjour à tous" });
  });

  it("écarte une ligne sans nom de bloc : elle ne surcharge rien", () => {
    expect(normalizeTexts([{ slot: "  ", value: "texte perdu" }])).toEqual({});
  });

  it("nettoie les espaces autour, qui ne se voient pas à la saisie", () => {
    expect(normalizeTexts([{ slot: " intro ", value: "  Bonjour  " }])).toEqual({
      intro: "Bonjour",
    });
  });

  it("ne se fâche pas sur ce qui n'est pas un tableau", () => {
    expect(normalizeTexts(null)).toEqual({});
    expect(normalizeTexts(undefined)).toEqual({});
    expect(normalizeTexts("texte")).toEqual({});
    expect(normalizeTexts([{ slot: 3, value: 4 }])).toEqual({});
  });
});
