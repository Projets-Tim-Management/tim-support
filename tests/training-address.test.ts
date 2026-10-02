import { describe, expect, it } from "vitest";

import { banSearchUrl, joinAddress, mapsUrl, parseBanSuggestions } from "@/modules/training/lib/address";

describe("recherche d'adresse (BAN)", () => {
  it("suggestions lisibles, doublons et entrées vides écartés", () => {
    const data = {
      features: [
        { properties: { label: "12 Rue des Lilas 69003 Lyon", context: "69, Rhône, Auvergne-Rhône-Alpes" } },
        { properties: { label: "12 Rue des Lilas 69003 Lyon", context: "doublon" } },
        { properties: { label: "  " } },
        { properties: { label: "Rue des Lilas 75019 Paris" } },
      ],
    };
    expect(parseBanSuggestions(data)).toEqual([
      { label: "12 Rue des Lilas 69003 Lyon", context: "69, Rhône, Auvergne-Rhône-Alpes" },
      { label: "Rue des Lilas 75019 Paris", context: "" },
    ]);
  });

  it("réponse illisible : aucune suggestion", () => {
    expect(parseBanSuggestions(null)).toEqual([]);
    expect(parseBanSuggestions({})).toEqual([]);
  });

  it("URL de recherche au fil de la frappe, requête encodée", () => {
    expect(banSearchUrl(" 12 rue des lilas ")).toBe(
      "https://api-adresse.data.gouv.fr/search/?q=12%20rue%20des%20lilas&limit=6&autocomplete=1",
    );
  });

  it("adresse du client en une ligne, lien carte", () => {
    expect(joinAddress("12 rue des Lilas", " Bât. B ")).toBe("12 rue des Lilas, Bât. B");
    expect(joinAddress("12 rue des Lilas", null)).toBe("12 rue des Lilas");
    expect(mapsUrl("12 rue des Lilas, Lyon")).toBe(
      "https://www.google.com/maps/search/?api=1&query=12%20rue%20des%20Lilas%2C%20Lyon",
    );
  });
});
