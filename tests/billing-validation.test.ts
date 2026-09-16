import { describe, expect, it } from "vitest";

import type { ClientCheck, Issue } from "@/modules/partner/lib/billing-check";
import {
  monthValidation,
  pendingValidations,
  targetMonth,
  withValidation,
  withoutValidation,
} from "@/modules/partner/lib/billing-validation";
import type { HistoryEntry } from "@/modules/partner/lib/history";

/**
 * La validation mensuelle du rapprochement : signer que fiche et abonnement
 * disent la même chose pour la prochaine facture, garder la trace, et savoir
 * ce qui reste à signer sans interroger Pennylane.
 */
const LE_16 = new Date("2026-09-16T08:00:00.000Z");

const rows = (qty: number, price = 25) =>
  [
    { key: "admin", supportQty: 1, supportPrice: 49 },
    { key: "compagnon", supportQty: qty, supportPrice: price },
  ] as ClientCheck["rows"];

/** Un rapprochement conforme : abonnement vivant, prochaine facture le 4 octobre. */
const check = (over: Partial<ClientCheck> = {}): ClientCheck =>
  ({
    client: { id: 7, name: "Instalclim", siren: null, clientStatus: "actif", paymentMethod: null, paymentTerms: null },
    match: "siren",
    pennylane: { customerId: 1, customerName: "Instalclim", regNo: null, subscriptionId: 42, subscriptionLabel: null, status: "in_progress", start: "2026-07-04", nextOccurrence: "2026-10-04", paymentMethod: null, paymentConditions: null, amountHT: 299, months: 1 },
    rows: rows(10),
    extraLines: [],
    totals: { supportQty: 11, supportHT: 299, plQty: 11, plHT: 299 },
    issues: [],
    verdict: "ok",
    invoices: [],
    latePayments: [],
    months: [],
    ...over,
  }) as ClientCheck;

const detail = (qty: number, price = 25) => [
  { key: "admin", qty: 1, price: 49 },
  { key: "compagnon", qty, price },
];

const signed: HistoryEntry = {
  at: "2026-10-01T00:00:00.000Z",
  detail: detail(10),
  validatedAt: "2026-09-16T08:00:00.000Z",
  validatedBy: 1,
  invoiceDate: "2026-10-04",
};

describe("le mois visé", () => {
  it("est celui de la prochaine facture, pas le mois courant", () => {
    // Le 16 septembre, la facture du 4 octobre est ce qu'on prépare.
    expect(targetMonth(check(), LE_16)).toBe("2026-10-01T00:00:00.000Z");
  });

  it("retombe sur le mois courant sans prochaine occurrence connue", () => {
    expect(targetMonth(check({ pennylane: { ...check().pennylane!, nextOccurrence: null } }), LE_16)).toBe("2026-09-01T00:00:00.000Z");
  });
});

describe("l'état du mois", () => {
  it("est « à valider » quand tout est conforme et que personne n'a signé", () => {
    expect(monthValidation([], check(), LE_16)).toMatchObject({ state: "a-valider", month: "2026-10-01T00:00:00.000Z", invoiceDate: "2026-10-04" });
  });

  it("est « validé » une fois signé, tant que la fiche n'a pas bougé", () => {
    expect(monthValidation([signed], check(), LE_16)).toMatchObject({ state: "valide", validatedAt: signed.validatedAt, validatedBy: 1 });
  });

  it("repasse « à revalider » si les licences de la fiche ont changé depuis la signature", () => {
    // Une licence ajoutée sur la fiche : la signature d'octobre ne vaut plus.
    expect(monthValidation([signed], check({ rows: rows(11) }), LE_16)).toMatchObject({ state: "a-revalider" });
  });

  it("repasse « à revalider » si un écart est apparu après la signature", () => {
    const qty: Issue = { code: "qty", severity: "error", label: "11 licences facturées, 10 sur la fiche" };
    expect(monthValidation([signed], check({ issues: [qty], verdict: "ecart" }), LE_16)).toMatchObject({ state: "a-revalider", blockers: [qty] });
  });

  it("est bloqué par un écart de quantité ou de prix, jamais par un retard de paiement", () => {
    const qty: Issue = { code: "qty", severity: "error", label: "écart" };
    const late: Issue = { code: "late-payment", severity: "error", label: "en retard" };
    expect(monthValidation([], check({ issues: [qty], verdict: "ecart" }), LE_16)).toMatchObject({ state: "ecart", blockers: [qty] });
    // Un impayé se règle ailleurs : la configuration d'octobre, elle, est juste.
    expect(monthValidation([], check({ issues: [late], verdict: "ecart" }), LE_16)).toMatchObject({ state: "a-valider", blockers: [] });
  });

  it("n'a rien à valider sans abonnement vivant", () => {
    expect(monthValidation([], check({ verdict: "sans-abonnement", pennylane: { ...check().pennylane!, subscriptionId: null } }), LE_16)).toMatchObject({ state: "indisponible" });
    expect(monthValidation([], null, LE_16)).toMatchObject({ state: "indisponible" });
  });
});

describe("signer, et retirer sa signature", () => {
  const entry = { totalLicences: 11, caHT: 299, commission: 29.9, commissionRate: 10, detail: detail(10) };
  const stamp = { start: "2026-07-04", ok: true, checkedAt: "2026-09-16T07:00:00.000Z" };

  it("crée la ligne du mois visé quand elle n'existe pas — la config du jour, signée, datée de la facture", () => {
    const prev: HistoryEntry[] = [{ at: "2026-07-01T00:00:00.000Z", detail: detail(10), caHT: 299 }];
    const next = withValidation(prev, { month: "2026-10-01T00:00:00.000Z", invoiceDate: "2026-10-04", entry, stamp, userId: 1, at: LE_16 });
    expect(next.map((e) => e.at)).toEqual(["2026-07-01T00:00:00.000Z", "2026-10-01T00:00:00.000Z"]);
    expect(next[1]).toMatchObject({ caHT: 299, validatedAt: LE_16.toISOString(), validatedBy: 1, invoiceDate: "2026-10-04", pennylane: stamp });
  });

  it("remplace la ligne du mois par la config du jour : on signe ce que la fiche dit maintenant", () => {
    const prev: HistoryEntry[] = [{ at: "2026-10-01T00:00:00.000Z", detail: detail(9), caHT: 274 }];
    const next = withValidation(prev, { month: "2026-10-01T00:00:00.000Z", invoiceDate: "2026-10-04", entry, stamp, userId: 1, at: LE_16 });
    expect(next).toHaveLength(1);
    expect(next[0]).toMatchObject({ caHT: 299, validatedBy: 1 });
  });

  it("retirer la signature garde la ligne comme attendu, sans signature", () => {
    const next = withoutValidation([signed], "2026-10-01T00:00:00.000Z");
    expect(next[0]).toMatchObject({ detail: detail(10), validatedAt: null, validatedBy: null, invoiceDate: null });
  });
});

describe("ce qui reste à valider, depuis la base seule", () => {
  const clients = [
    { id: 1, clientStatus: "actif", history: [signed] }, // couvert jusqu'au 4 octobre
    { id: 2, clientStatus: "actif", history: [{ ...signed, invoiceDate: "2026-09-04" }] }, // facture passée
    { id: 3, clientStatus: "actif", history: [] },
    { id: 4, clientStatus: "en-test", history: [] }, // pas facturé
  ];

  it("liste les fiches gagnées sans validation couvrant une facture à venir", () => {
    expect(pendingValidations(clients, LE_16)).toEqual([2, 3]);
  });

  it("une validation vaut jusqu'au jour de sa facture, puis la suivante est à préparer", () => {
    expect(pendingValidations(clients, new Date("2026-10-04T06:00:00.000Z"))).toEqual([2, 3]);
    expect(pendingValidations(clients, new Date("2026-10-05T06:00:00.000Z"))).toEqual([1, 2, 3]);
  });
});
