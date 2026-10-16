import { describe, expect, it } from "vitest";

import { detailSignature } from "@/modules/partner/lib/history";
import { computeClientCA, LICENCE_BASE_PRICES, licenceLinesOf, profileRank, PROFILS, volumeDiscountPct } from "@/modules/partner/lib/pricing";

/**
 * La licence « Visuel » (16/10/2026) : 2,20 € de base, en dernier, hors du
 * volume de la remise dégressive, et sans effet sur l'historique des fiches
 * qui n'en ont pas.
 */

describe("la licence Visuel", () => {
  it("2,20 € de base, en dernier dans la grille et dans la hiérarchie", () => {
    expect(LICENCE_BASE_PRICES.visuel).toBe(2.2);
    expect(PROFILS.at(-1)).toEqual({ key: "visuel", label: "Visuel" });
    expect(profileRank("visuel")).toBe(5);
  });

  it("compte dans le total et le CA, mais pas dans le volume de la remise", () => {
    const lines = licenceLinesOf({ adminQty: 2, visuelQty: 50 } as never);
    const r = computeClientCA(lines);
    expect(r.totalLicences).toBe(52);
    expect(r.caHT).toBe(2 * 39 + 50 * 2.2);
    // 2 licences seulement comptent : pas de palier, malgré les 50 Visuels.
    expect(r.suggestedDiscountPct).toBe(volumeDiscountPct(2));
  });

  it("une fiche sans Visuel garde exactement sa signature (ni historique ni mois à revalider)", () => {
    const before = [
      { key: "admin", qty: 1, price: 39 },
      { key: "compagnon", qty: 0, price: 8 },
    ];
    expect(detailSignature([...before, { key: "visuel", qty: 0, price: 2.2 }])).toBe(detailSignature(before));
    expect(detailSignature([...before, { key: "visuel", qty: 3, price: 2.2 }])).not.toBe(detailSignature(before));
  });
});
