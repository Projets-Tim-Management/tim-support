import { describe, expect, it } from "vitest";

import { contractPriceRows } from "@/modules/partner/lib/contract-vars";
import { buildHistoryEntry, nextHistory } from "@/modules/partner/lib/history";
import {
  adminPriceForModules,
  annualOffer,
  computeClientCA,
  LATE_PROFILES,
  LICENCE_BASE_PRICES,
  licenceLinesOf,
  offerSummary,
  tarifsMarkdown,
} from "@/modules/partner/lib/pricing";

/** La grille « Offre » du 16/11/2026 : les modules ne changent que l'Admin et ajoutent le Magasinier. */
describe("les modules de l'offre", () => {
  it("posent le prix de l'Admin : 29 € pour un module, 39 € pour les deux, 9 € pour Stock seul", () => {
    expect(adminPriceForModules({})).toBeNull();
    expect(adminPriceForModules({ planning: true })).toBe(29);
    expect(adminPriceForModules({ pointage: true })).toBe(29);
    expect(adminPriceForModules({ planning: true, pointage: true })).toBe(39);
    expect(adminPriceForModules({ planning: true, stock: true })).toBe(29);
    expect(adminPriceForModules({ planning: true, pointage: true, stock: true })).toBe(39);
    expect(adminPriceForModules({ stock: true })).toBe(9);
  });

  it("retrouvent les totaux « dès » de la grille avec le Magasinier à 40 €", () => {
    const total = (m: Parameters<typeof adminPriceForModules>[0]) => (adminPriceForModules(m) ?? 0) + (m.stock ? LICENCE_BASE_PRICES.magasinier : 0);
    expect(total({ planning: true, stock: true })).toBe(69);
    expect(total({ pointage: true, stock: true })).toBe(69);
    expect(total({ planning: true, pointage: true, stock: true })).toBe(79);
    expect(total({ stock: true })).toBe(49);
  });

  it("le Magasinier compte dans le volume de la remise", () => {
    const r = computeClientCA(licenceLinesOf({ adminQty: 1, compagnonQty: 4, magasinierQty: 1 } as never));
    expect(r.totalLicences).toBe(6);
    expect(r.suggestedDiscountPct).toBe(10);
  });

  it("une ligne Magasinier vide ne touche ni la signature des fiches, ni la grille, ni le contrat", () => {
    expect(LATE_PROFILES.has("magasinier")).toBe(true);
    expect(tarifsMarkdown({})).not.toContain("Magasinier");
    expect(tarifsMarkdown({ moduleStock: true })).toContain("- Magasinier : 40 €");
    expect(contractPriceRows({ licences: {} }).map((r) => r.profile)).not.toContain("Magasinier");
    expect(contractPriceRows({ licences: { magasinierQty: 2 } }).map((r) => r.profile)).toContain("Magasinier");
  });

  it("le paiement annuel retire 10 % de tout l'abonnement", () => {
    expect(annualOffer(79)).toEqual({ monthly: 71.1, saving: 7.9, yearly: 853.2 });
  });

  it("payé à l'année, le CA de la fiche est après −10 % ; au mois ou au trimestre, rien ne change", () => {
    const lines = licenceLinesOf({ adminQty: 1, adminPrice: 39, magasinierQty: 1 } as never);
    expect(computeClientCA(lines, "annuelle")).toMatchObject({ caBrut: 79, caHT: 71.1 });
    expect(computeClientCA(lines, "mensuelle")).toMatchObject({ caBrut: 79, caHT: 79 });
    expect(computeClientCA(lines, "trimestrielle").caHT).toBe(79);
    expect(computeClientCA(lines).caHT).toBe(79);
  });

  it("l'historique note le passage à l'année : une ligne, CA et commission après −10 %", () => {
    const e = buildHistoryEntry({ adminQty: 1, adminPrice: 39, magasinierQty: 1 } as never, 10, "annuelle");
    expect(e).toMatchObject({ caHT: 71.1, caBrut: 79, annual: true, commission: 7.11 });
    expect(buildHistoryEntry({ adminQty: 1 } as never, 10, "mensuelle")).not.toHaveProperty("annual");
    const { caBrut: _b, suggestedDiscountPct: _s, ...monthly } = buildHistoryEntry({ adminQty: 1, adminPrice: 39, magasinierQty: 1 } as never, 10, "mensuelle");
    void _b;
    void _s;
    const prev = nextHistory([], { clientStatus: "actif", billingStart: "2026-10-01", now: new Date("2026-11-16"), entry: monthly, freshStamp: false });
    const { caBrut: _b2, suggestedDiscountPct: _s2, ...yearly } = e;
    void _b2;
    void _s2;
    const next = nextHistory(prev, { clientStatus: "actif", billingStart: "2026-10-01", now: new Date("2026-11-16"), entry: yearly, freshStamp: false });
    expect(next[next.length - 1]).toMatchObject({ caHT: 71.1, annual: true });
  });

  it("une fiche à l'année réenregistrée ne réécrit pas sa ligne : la validation du mois reste", () => {
    const { caBrut: _b, suggestedDiscountPct: _s, ...entry } = buildHistoryEntry({ adminQty: 1, adminPrice: 39 } as never, 10, "annuelle");
    void _b;
    void _s;
    const first = nextHistory([], { clientStatus: "actif", billingStart: "2026-10-01", now: new Date("2026-11-16"), entry, freshStamp: false });
    const validated = first.map((e) => ({ ...e, validatedAt: "2026-11-05T10:00:00Z" }));
    const again = nextHistory(validated, { clientStatus: "actif", billingStart: "2026-10-01", now: new Date("2026-11-20"), entry, freshStamp: false });
    expect(again[again.length - 1].validatedAt).toBe("2026-11-05T10:00:00Z");
  });

  it("se résument en une ligne pour les agents, et rien tant que rien n'est coché", () => {
    expect(offerSummary({})).toBeNull();
    expect(offerSummary({ modulePlanning: true, moduleStock: true, magasinierQty: 2 }, "annuelle")).toBe("Planning + Stock · 2 magasiniers · paiement annuel −10 %");
    expect(offerSummary({ modulePointage: true }, "mensuelle")).toBe("Pointage");
  });
});
