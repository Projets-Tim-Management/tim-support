import { describe, expect, it } from "vitest";

import { buildValidationReminder, reminderDue } from "@/modules/partner/lib/billing-reminder";
import type { MonthValidation } from "@/modules/partner/lib/billing-validation";

/**
 * Le rappel du rapprochement n'écrit que deux fois : le 1er du mois, et
 * deux jours avant une facture encore non signée. Un rappel quotidien
 * apprendrait à ne plus être lu.
 */
const v = (over: Partial<MonthValidation> = {}): MonthValidation => ({
  month: "2026-10-01T00:00:00.000Z",
  invoiceDate: "2026-10-04",
  state: "a-valider",
  validatedAt: null,
  validatedBy: null,
  blockers: [],
  ...over,
});

describe("quand rappeler", () => {
  it("le 1er du mois, tout ce qui attend", () => {
    expect(reminderDue(v(), "2026-10-01")).toBe("mois");
    expect(reminderDue(v({ state: "a-revalider" }), "2026-10-01")).toBe("mois");
    expect(reminderDue(v({ state: "ecart" }), "2026-10-01")).toBe("mois");
  });

  it("deux jours avant la facture, si toujours pas signé — et pas les autres jours", () => {
    expect(reminderDue(v(), "2026-10-02")).toBe("dernier-appel");
    expect(reminderDue(v(), "2026-10-03")).toBeNull();
    expect(reminderDue(v(), "2026-09-20")).toBeNull();
    // Toffolo, facturé le 15 : son dernier appel tombe le 13.
    expect(reminderDue(v({ invoiceDate: "2026-10-15" }), "2026-10-13")).toBe("dernier-appel");
  });

  it("jamais pour un mois signé ou sans abonnement", () => {
    expect(reminderDue(v({ state: "valide", validatedAt: "2026-09-16T08:00:00.000Z" }), "2026-10-01")).toBeNull();
    expect(reminderDue(v({ state: "indisponible" }), "2026-10-02")).toBeNull();
  });
});

describe("le message", () => {
  const items = [
    { clientId: 1, client: "Instalclim", validation: v() },
    { clientId: 2, client: "Groupe Toffolo", validation: v({ invoiceDate: "2026-10-15", state: "ecart", blockers: [{ code: "qty", severity: "error", label: "11 facturées, 10 sur la fiche" }] }) },
  ];

  it("compte les factures dans l'objet et nomme chaque fiche avec sa date et ce qui attend", () => {
    const m = buildValidationReminder(items, "mois", "2026-10-01")!;
    expect(m.subject).toBe("2 factures à valider ce mois-ci");
    expect(m.text).toContain("• Instalclim — facture le 4 octobre — à signer");
    expect(m.text).toContain("• Groupe Toffolo — facture le 15 octobre — écart à corriger : 11 facturées, 10 sur la fiche");
    expect(m.html).toContain("/admin/facturation?f=a-valider");
  });

  it("dit l'urgence en dernier appel", () => {
    const m = buildValidationReminder([items[0]], "dernier-appel", "2026-10-02")!;
    expect(m.subject).toBe("Dernier appel : 1 facture à valider avant le 4 octobre");
  });

  it("ne fabrique rien sans fiche à rappeler", () => {
    expect(buildValidationReminder([], "mois", "2026-10-01")).toBeNull();
  });
});
