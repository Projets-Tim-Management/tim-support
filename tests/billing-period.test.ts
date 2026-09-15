import { describe, expect, it } from "vitest";

import { billingPeriodMonths, monthsLabel, pennylaneMonths } from "@/modules/partner/lib/billing-period";
import { monthKey, monthStart } from "@/modules/partner/lib/month";

/** La périodicité : combien de mois couvre une facture, des deux côtés. */
describe("périodicité de facturation", () => {
  it("traduit la fiche en mois par facture, mensuelle à défaut", () => {
    expect(billingPeriodMonths("mensuelle")).toBe(1);
    expect(billingPeriodMonths("trimestrielle")).toBe(3);
    expect(billingPeriodMonths("semestrielle")).toBe(6);
    expect(billingPeriodMonths("annuelle")).toBe(12);
    expect(billingPeriodMonths(null)).toBe(1);
    expect(billingPeriodMonths("n'importe quoi")).toBe(1);
  });

  it("lit la récurrence Pennylane, et renonce quand elle n'est pas en mois", () => {
    expect(pennylaneMonths({ rule_type: "monthly", interval: 1 })).toBe(1);
    expect(pennylaneMonths({ rule_type: "monthly", interval: 3 })).toBe(3);
    expect(pennylaneMonths({ rule_type: "yearly", interval: 1 })).toBe(12);
    expect(pennylaneMonths({ rule_type: "yearly", interval: 2 })).toBe(24);
    expect(pennylaneMonths({ rule_type: "weekly", interval: 2 })).toBeNull();
    expect(pennylaneMonths(null)).toBe(1);
    expect(pennylaneMonths({ rule_type: "monthly", interval: 0 })).toBe(1);
  });

  it("se dit en français", () => {
    expect(monthsLabel(1)).toBe("tous les mois");
    expect(monthsLabel(3)).toBe("tous les 3 mois");
    expect(monthsLabel(12)).toBe("tous les ans");
  });
});

describe("le mois comme unité", () => {
  it("désigne et borne un mois en UTC, quelle que soit l'heure", () => {
    expect(monthKey("2026-10-04T23:30:00.000Z")).toBe("2026-9");
    expect(monthKey(new Date("2026-01-31T00:00:00.000Z"))).toBe("2026-0");
    expect(monthStart("2026-10-04")).toBe("2026-10-01T00:00:00.000Z");
    expect(monthStart("2026-10-31T23:59:59.000Z")).toBe("2026-10-01T00:00:00.000Z");
  });
});
