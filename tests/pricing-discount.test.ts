import { describe, expect, it } from "vitest";

import { computeClientCA, effectiveUnitPrice, licenceLinesOf, tarifsMarkdown } from "@/modules/partner/lib/pricing";

/**
 * Remise sur une ligne de licences : en % ou en € par licence, jamais les deux.
 * Le CA, l'e-mail de tarifs et le rapprochement Pennylane lisent tous le prix
 * EFFECTIF — sinon une licence offerte compterait plein pot dans la commission.
 */
describe("prix effectif", () => {
  it("déduit un montant par licence, sans passer sous zéro", () => {
    expect(effectiveUnitPrice({ price: 18, discountAmount: 18 })).toBe(0);
    expect(effectiveUnitPrice({ price: 18, discountAmount: 25 })).toBe(0);
    expect(effectiveUnitPrice({ price: 18, discountAmount: 3 })).toBe(15);
  });

  it("applique un pourcentage, borné à 100", () => {
    expect(effectiveUnitPrice({ price: 8, discountPct: 25 })).toBe(6);
    expect(effectiveUnitPrice({ price: 8, discountPct: 150 })).toBe(0);
    expect(effectiveUnitPrice({ price: 8 })).toBe(8);
  });

  it("entre dans le CA HT de la fiche", () => {
    const lines = licenceLinesOf({ adminQty: 1, adminPrice: 38, compagnonQty: 2, compagnonPrice: 8, chefChantierQty: 1, chefChantierPrice: 18, chefChantierDiscountAmount: 18 });
    expect(computeClientCA(lines)).toMatchObject({ totalLicences: 4, caHT: 54 });
  });

  it("annonce le prix remisé dans la grille tarifaire", () => {
    expect(tarifsMarkdown({ compagnonQty: 10, compagnonPrice: 8, compagnonDiscountPct: 25 })).toBe("- Compagnon : 10 × 6 €");
  });
});
