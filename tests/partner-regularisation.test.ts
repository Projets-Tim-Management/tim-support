import { describe, expect, it } from "vitest";

import { addMonths, clientRegularisations, regulLines, type LicenceMove } from "@/modules/partner/lib/regularisation";

/**
 * Régularisation d'un client trimestriel payé d'avance (Demathieu Bard) :
 * tout mois commencé est dû, pas d'avoir, mois de la PÉRIODE.
 */
const lic = (compagnon: number, price = 25) => ({ compagnonQty: compagnon, compagnonPrice: price });
const mv = (at: string, before: number, after: number): LicenceMove => ({ at: `${at}T10:00:00.000Z`, profile: "compagnon", before, after, price: 25 });

describe("addMonths", () => {
  it("garde le quantième, borné à la fin du mois", () => {
    expect(addMonths("2026-11-01", 3)).toBe("2027-02-01");
    expect(addMonths("2026-11-30", 3)).toBe("2027-02-28");
    expect(addMonths("2027-02-01", -3)).toBe("2026-11-01");
  });
});

describe("regulLines", () => {
  const base = { periodStart: "2026-11-01", months: 3 };

  it("ajout le 12/11 dans un trimestre nov.–janv. : 3 mois dus, mois à venir compris", () => {
    const [l] = regulLines({ ...base, moves: [mv("2026-11-12", 10, 12)], licences: lic(12), now: new Date("2026-11-20") });
    expect(l.perMonth).toEqual([2, 2, 2]);
    expect(l.licenceMonths).toBe(6);
    expect(l.amountHT).toBe(150);
  });

  it("ajout en décembre : novembre ne doit rien", () => {
    const [l] = regulLines({ ...base, moves: [mv("2026-12-03", 10, 11)], licences: lic(11), now: new Date("2026-12-10") });
    expect(l.perMonth).toEqual([0, 1, 1]);
  });

  it("ajout puis retrait : le mois commencé reste dû, pas au-delà", () => {
    const [l] = regulLines({
      ...base,
      moves: [mv("2026-11-12", 10, 12), mv("2026-12-05", 12, 10)],
      licences: lic(10),
      now: new Date("2027-01-15"),
    });
    expect(l.perMonth).toEqual([2, 2, 0]);
  });

  it("retrait seul : pas d'avoir", () => {
    expect(regulLines({ ...base, moves: [mv("2026-11-12", 10, 8)], licences: lic(8), now: new Date("2026-12-01") })).toEqual([]);
  });

  it("un changement d'avant la période est déjà facturé", () => {
    expect(regulLines({ ...base, moves: [mv("2026-10-20", 10, 12)], licences: lic(12), now: new Date("2026-11-20") })).toEqual([]);
  });

  it("un changement le jour même de la facture compte dans la période", () => {
    const [l] = regulLines({ ...base, moves: [mv("2026-11-01", 10, 11)], licences: lic(11), now: new Date("2026-11-02") });
    expect(l.perMonth).toEqual([1, 1, 1]);
  });
});

describe("clientRegularisations", () => {
  const common = {
    licences: lic(12),
    nextOccurrence: "2027-02-01",
    months: 3,
    subscriptionHT: 300,
    plannedHT: null,
    invoices: [],
  };

  it("période en cours : à facturer sur la prochaine facture", () => {
    const r = clientRegularisations({ ...common, moves: [mv("2026-11-12", 10, 12)], now: new Date("2026-11-20") });
    expect(r.current?.state).toBe("a-facturer");
    expect(r.current?.periodEnd).toBe("2027-02-01");
    expect(r.current?.amountHT).toBe(150);
    expect(r.current?.pennylaneLines[0]).toEqual({ label: "Régularisation Compagnon du 01/11/2026 au 31/01/2027", qty: 6, unitPrice: 25 });
    expect(r.previous).toBeNull();
  });

  it("déjà posée sur l'abonnement : prévue", () => {
    const r = clientRegularisations({ ...common, plannedHT: 150, moves: [mv("2026-11-12", 10, 12)], now: new Date("2026-11-20") });
    expect(r.current?.state).toBe("prevue");
  });

  it("client mensuel : jamais de régularisation", () => {
    const r = clientRegularisations({ ...common, months: 1, nextOccurrence: "2026-12-01", moves: [mv("2026-11-12", 10, 12)], now: new Date("2026-11-20") });
    expect(r).toEqual({ current: null, previous: null });
  });

  describe("période écoulée (facture du 01/02/2027 passée)", () => {
    const after = { ...common, nextOccurrence: "2027-05-01", moves: [mv("2026-11-12", 10, 12)], now: new Date("2027-02-10") };

    it("rien sur les factures : manquante", () => {
      expect(clientRegularisations(after).previous?.state).toBe("manquante");
    });
    it("une facture « Régularisation » : facturée", () => {
      const invoices = [{ date: "2027-02-03", label: "Régularisation licences T4", amountHT: 150, fromSubscription: false }];
      expect(clientRegularisations({ ...after, invoices }).previous?.state).toBe("facturee");
    });
    it("ajoutée sur la facture de l'abonnement : facturée", () => {
      const invoices = [{ date: "2027-02-01", label: "Abonnement TIM", amountHT: 450, fromSubscription: true }];
      expect(clientRegularisations({ ...after, invoices }).previous?.state).toBe("facturee");
    });
    it("abonnement démarré après : rien à contrôler", () => {
      expect(clientRegularisations({ ...after, subscriptionStart: "2027-02-01" }).previous).toBeNull();
    });
  });
});

describe("rappel du rapprochement", () => {
  it("parle de la régularisation le 1er du mois et à J-2 de la facture qui la porte", async () => {
    const { regulDue } = await import("@/modules/partner/lib/billing-reminder");
    const r = clientRegularisations({
      licences: lic(12),
      nextOccurrence: "2027-02-01",
      months: 3,
      subscriptionHT: 300,
      plannedHT: null,
      invoices: [],
      moves: [mv("2026-11-12", 10, 12)],
      now: new Date("2026-11-20"),
    });
    const check = { regularisation: r };
    expect(regulDue(check, "2026-12-01")?.kind).toBe("mois");
    expect(regulDue(check, "2027-01-30")?.kind).toBe("dernier-appel");
    expect(regulDue(check, "2027-01-30")?.text).toContain("150,00");
    expect(regulDue(check, "2026-12-15")).toBeNull();
  });
});

describe("un mouvement par jour", () => {
  it("regroupe les licences d'un même jour, garde l'avant d'origine, retire un aller-retour", async () => {
    const { nextLicenceMoves, flattenMoves } = await import("@/modules/partner/lib/regularisation");
    const morning = new Date("2026-11-12T09:00:00Z");
    const noon = new Date("2026-11-12T12:00:00Z");
    let days = nextLicenceMoves([], { compagnonQty: 10, adminQty: 1 }, { compagnonQty: 12, adminQty: 1 }, morning);
    days = nextLicenceMoves(days, { compagnonQty: 12, adminQty: 1 }, { compagnonQty: 13, adminQty: 2 }, noon);
    expect(days).toHaveLength(1);
    expect(days[0].lines?.map((l) => [l.profile, l.before, l.after])).toEqual([
      ["compagnon", 10, 13],
      ["admin", 1, 2],
    ]);
    // Le lendemain : un nouveau mouvement.
    days = nextLicenceMoves(days, { compagnonQty: 13, adminQty: 2 }, { compagnonQty: 11, adminQty: 2 }, new Date("2026-11-13T09:00:00Z"));
    expect(days).toHaveLength(2);
    // Revenu au point de départ le même jour : la licence sort du mouvement, le mouvement vide disparaît.
    days = nextLicenceMoves(days, { compagnonQty: 11, adminQty: 2 }, { compagnonQty: 13, adminQty: 2 }, new Date("2026-11-13T15:00:00Z"));
    expect(days).toHaveLength(1);
    expect(flattenMoves(days)).toHaveLength(2);
  });
});

describe("préremplissage d'une licence ajoutée à la main", () => {
  it("reprend le mouvement précédent, sinon l'historique, sinon la quantité actuelle", async () => {
    const { suggestMoveLine } = await import("@/modules/partner/lib/regularisation");
    const licences = { compagnonQty: 12, compagnonPrice: 25 };
    const history = [
      { at: "2026-10-01T00:00:00.000Z", detail: [{ key: "compagnon", qty: 10 }] },
      { at: "2026-11-01T00:00:00.000Z", detail: [{ key: "compagnon", qty: 12 }] },
    ];
    // Rien d'autre : l'historique du mois d'avant (10) et du mois même (12).
    expect(suggestMoveLine({ days: [{ at: "2026-11-12T11:00:00.000Z", lines: [] }], dayIndex: 0, profile: "compagnon", at: "2026-11-12T11:00:00.000Z", history, licences })).toEqual({ before: 10, after: 12, price: 25 });
    // Un mouvement plus tôt : son « après » devient notre « avant ».
    const days = [
      { at: "2026-11-05T11:00:00.000Z", lines: [{ profile: "compagnon", before: 10, after: 11, price: null }] },
      { at: "2026-11-12T11:00:00.000Z", lines: [] },
    ];
    expect(suggestMoveLine({ days, dayIndex: 1, profile: "compagnon", at: "2026-11-12T11:00:00.000Z", history, licences }).before).toBe(11);
    // Ni mouvement ni historique : la quantité actuelle.
    expect(suggestMoveLine({ days: [], dayIndex: 0, profile: "compagnon", at: "2026-11-12T11:00:00.000Z", history: [], licences })).toMatchObject({ before: 12, after: 12 });
  });
});

describe("mise à plat des mouvements", () => {
  it("écarte une ligne incomplète : un « avant » vide ne compte pas pour 0", async () => {
    const { flattenMoves, nextLicenceMoves } = await import("@/modules/partner/lib/regularisation");
    const days = [
      {
        at: "2026-11-12T12:00:00.000Z",
        lines: [
          { profile: "compagnon", before: 10, after: 12, price: 25 },
          { profile: "admin", before: null, after: 3, price: null },
          { profile: "", before: 1, after: 2, price: null },
        ],
      },
      { at: "2026-11-13T12:00:00.000Z" },
      "abîmé",
    ];
    expect(flattenMoves(days)).toEqual([{ at: "2026-11-12T12:00:00.000Z", profile: "compagnon", before: 10, after: 12, price: 25 }]);
    expect(flattenMoves(null)).toEqual([]);
    // Une valeur abîmée ne fait pas échouer l'enregistrement de la fiche.
    expect(() => nextLicenceMoves(days as never, { compagnonQty: 12 }, { compagnonQty: 13 }, new Date("2026-11-20T09:00:00Z"))).not.toThrow();
  });
});
