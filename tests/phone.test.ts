import { describe, expect, it } from "vitest";

import { collapsePhoneGroups, phoneDigits, phoneQuery } from "@/core/lib/phone";

/**
 * Chercher un numéro sans se soucier du +33, des espaces ni des points :
 * « 065046 » et « 06 50 46 » doivent retrouver « +33 6 50 46 12 34 ».
 */
describe("phoneDigits", () => {
  it("ramène un numéro formaté à ses chiffres nationaux", () => {
    expect(phoneDigits("+33 6 50 46 12 34")).toBe("0650461234");
    expect(phoneDigits("06.50.46.12.34")).toBe("0650461234");
    expect(phoneDigits("0033 6 50 46 12 34")).toBe("0650461234");
    expect(phoneDigits("06 50 46 12 34")).toBe("0650461234");
  });
  it("garde l'indicatif d'un autre pays", () => {
    expect(phoneDigits("+41 22 123 45 67")).toBe("41221234567");
  });
  it("vide pour rien", () => {
    expect(phoneDigits(null)).toBe("");
    expect(phoneDigits("  ")).toBe("");
  });
});

describe("phoneQuery", () => {
  it("reconnaît un début de numéro, quel que soit son habillage", () => {
    expect(phoneQuery("065046")).toBe("065046");
    expect(phoneQuery("06 50 46")).toBe("065046");
    expect(phoneQuery("+33 6 50 46")).toBe("065046");
    expect(phoneQuery("06.50.46")).toBe("065046");
  });
  it("n'est pas un numéro : du texte, ou trop court", () => {
    expect(phoneQuery("dupont")).toBeNull();
    expect(phoneQuery("06")).toBeNull();
    expect(phoneQuery("SAS 2000")).toBeNull();
  });
});

describe("collapsePhoneGroups", () => {
  it("replie les groupes de chiffres d'une recherche libre", () => {
    expect(collapsePhoneGroups("dupont 06 50 46")).toBe("dupont 065046");
    expect(collapsePhoneGroups("+33 6 50 46 paris")).toBe("065046 paris");
  });
  it("laisse un texte sans chiffres intact", () => {
    expect(collapsePhoneGroups("rénové sas")).toBe("rénové sas");
  });
});
