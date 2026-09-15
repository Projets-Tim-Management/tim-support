import { describe, expect, it } from "vitest";

import {
  buildBillingReport,
  normalizeName,
  normalizeSiren,
  pennylaneStampFor,
  type SupportClientFacts,
} from "@/modules/partner/lib/billing-check";
import type { PennylaneSnapshot, PlInvoice, PlInvoiceLine, PlSubscriptionFull } from "@/modules/partner/lib/pennylane";

/**
 * Contrôle de facturation : la fiche du support face à l'abonnement Pennylane.
 *
 * On ne décide rien, on constate — mais chaque constat doit être le bon : une
 * licence de trop, un prix qui dérive, un client jamais facturé, un abonnement
 * qui tourne pour un client résilié.
 */

const PRODUCTS = [
  { id: 1, label: "Licence TIM — Administration", reference: "LA-Tim" },
  { id: 2, label: "Licence TIM — Conducteur de travaux", reference: "LCT-Tim" },
  { id: 3, label: "Licence TIM — Chef de chantier", reference: "LCC-Tim" },
  { id: 4, label: "Licence TIM — Chef d'équipe", reference: "LCE-Tim" },
  { id: 5, label: "Licence TIM — Compagnon", reference: "LC-Tim" },
  { id: 9, label: "Mise en place & Formation (forfait unique)", reference: "M-Tim" },
];

let lineId = 100;
const line = (productId: number | null, qty: number, price: number, label = ""): PlInvoiceLine => ({
  id: lineId++,
  label: label || PRODUCTS.find((p) => p.id === productId)?.label || "Ligne libre",
  quantity: String(qty),
  raw_currency_unit_price: String(price),
  currency_amount_before_tax: String(qty * price),
  product: productId == null ? null : { id: productId },
});

const sub = (
  id: number,
  customerId: number,
  lines: PlInvoiceLine[],
  over: Partial<PlSubscriptionFull> = {},
): PlSubscriptionFull => ({
  id,
  status: "not_started",
  label: "Prélèvement / licences",
  start: "2026-10-04",
  next_occurrence: "2026-10-04",
  payment_method: "gocardless_direct_debit",
  payment_conditions: "upon_receipt",
  customer: { id: customerId },
  customer_invoice_data: {
    currency_amount_before_tax: String(lines.reduce((a, l) => a + Number(l.currency_amount_before_tax), 0)),
  },
  lines,
  ...over,
});

const snapshot = (subscriptions: PlSubscriptionFull[], customers = CUSTOMERS, invoices: PlInvoice[] = []): PennylaneSnapshot => ({
  fetchedAt: "2026-09-15T08:00:00.000Z",
  customers,
  products: PRODUCTS,
  subscriptions,
  invoices,
});

const CUSTOMERS = [
  { id: 10, name: "CTSM", reg_no: "898999166" },
  { id: 11, name: "CHAUF'AVENIR", reg_no: "504416090" },
  { id: 12, name: "GROUPE VIRIATE SERVICES", reg_no: "927770578" },
  { id: 13, name: "CLIENTS DIVERS", reg_no: "" },
  { id: 14, name: "SOUVET VMB", reg_no: "811758721" },
];

const client = (over: Partial<SupportClientFacts> & { id: number; name: string }): SupportClientFacts => ({
  clientStatus: "actif",
  paymentMethod: "prelevement-gocardless",
  licences: {},
  ...over,
});

describe("normalisation", () => {
  it("ramène un SIRET au SIREN et tolère les espaces", () => {
    expect(normalizeSiren("898 999 166")).toBe("898999166");
    expect(normalizeSiren("89899916600012")).toBe("898999166");
    expect(normalizeSiren("")).toBeNull();
  });

  it("compare les noms sans accents, ponctuation ni forme juridique", () => {
    expect(normalizeName("Chauf'Avenir")).toBe("CHAUF AVENIR");
    expect(normalizeName("SARL ENF")).toBe(normalizeName("ENF"));
    expect(normalizeName("E.R.B.")).toBe("E R B");
  });
});

describe("rapprochement", () => {
  it("relie par SIREN même si le nom diffère (PRO 11 = GROUPE VIRIATE SERVICES)", () => {
    const rep = buildBillingReport(
      [client({ id: 5, name: "PRO 11", siren: "927770578", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 12, [line(1, 1, 39)])]),
    );
    expect(rep.checks[0].match).toBe("siren");
    expect(rep.checks[0].pennylane?.customerName).toBe("GROUPE VIRIATE SERVICES");
    expect(rep.checks[0].verdict).toBe("ok");
  });

  it("retombe sur le nom quand le SIREN diverge, et le signale", () => {
    const rep = buildBillingReport(
      [client({ id: 6, name: "CHAUF'AVENIR", siren: "819560038", licences: { adminQty: 1, adminPrice: 35 } })],
      snapshot([sub(1, 11, [line(1, 1, 35)])]),
    );
    const c = rep.checks[0];
    expect(c.match).toBe("name");
    expect(c.verdict).toBe("ecart");
    expect(c.issues).toContainEqual(
      expect.objectContaining({ code: "siren-mismatch", severity: "error" }),
    );
    expect(c.issues[0].label).toContain("819560038");
    expect(c.issues[0].label).toContain("504416090");
  });

  it("dit quand un client gagné n'existe pas dans Pennylane", () => {
    const rep = buildBillingReport(
      [client({ id: 7, name: "Inconnu SAS", siren: "111111111", licences: { adminQty: 2 } })],
      snapshot([]),
    );
    expect(rep.checks[0].verdict).toBe("non-rapproche");
    expect(rep.summary.nonRapproche).toBe(1);
  });

  it("dit quand le client Pennylane existe mais sans abonnement", () => {
    const rep = buildBillingReport(
      [client({ id: 8, name: "CTSM", siren: "898999166", licences: { adminQty: 1 } })],
      snapshot([]),
    );
    expect(rep.checks[0].verdict).toBe("sans-abonnement");
    expect(rep.checks[0].issues[0].code).toBe("no-subscription");
  });

  it("ignore les prospects sans abonnement : rien à contrôler", () => {
    const rep = buildBillingReport(
      [client({ id: 9, name: "Prospect", clientStatus: "en-qualification", licences: { adminQty: 3 } })],
      snapshot([]),
    );
    expect(rep.checks).toHaveLength(0);
  });
});

describe("comparaison des licences", () => {
  it("valide un client identique des deux côtés", () => {
    const rep = buildBillingReport(
      [
        client({
          id: 15,
          name: "CTSM",
          siren: "898999166",
          licences: { adminQty: 1, adminPrice: 29, conducteurQty: 3, conducteurPrice: 19, compagnonQty: 11, compagnonPrice: 6 },
        }),
      ],
      snapshot([sub(1, 10, [line(5, 11, 6), line(2, 3, 19), line(1, 1, 29)])]),
    );
    const c = rep.checks[0];
    expect(c.verdict).toBe("ok");
    expect(c.issues).toEqual([]);
    expect(c.totals).toEqual({ supportQty: 15, supportHT: 152, plQty: 15, plHT: 152 });
  });

  it("repère une quantité différente par profil", () => {
    const rep = buildBillingReport(
      [client({ id: 11, name: "LAURIN", siren: "898999166", licences: { adminQty: 1, adminPrice: 27, compagnonQty: 50, compagnonPrice: 5.6 } })],
      snapshot([sub(1, 10, [line(5, 45, 5.6), line(1, 1, 27)])]),
    );
    const c = rep.checks[0];
    expect(c.verdict).toBe("ecart");
    const compagnon = c.rows.find((r) => r.key === "compagnon")!;
    expect(compagnon).toMatchObject({ supportQty: 50, plQty: 45, qtyDiff: -5 });
    expect(c.issues.map((i) => i.code)).toEqual(["qty"]);
    expect(c.issues[0].label).toBe("Compagnon : 50 sur la fiche, 45 facturées");
  });

  it("repère un prix qui diffère, en avertissement seulement", () => {
    const rep = buildBillingReport(
      [client({ id: 5, name: "PRO 11", siren: "927770578", licences: { adminQty: 1, adminPrice: 36 } })],
      snapshot([sub(1, 12, [line(1, 1, 39)])]),
    );
    const c = rep.checks[0];
    expect(c.verdict).toBe("ecart");
    expect(c.issues).toEqual([{ code: "price", severity: "warn", label: "Admin : 36 € sur la fiche, 39 € facturé" }]);
  });

  it("voit quantité et prix inversés comme un écart de quantité (SOUVET : 7@6 vs 6@7)", () => {
    const rep = buildBillingReport(
      [client({ id: 3, name: "SOUVET VMB", siren: "811758721", licences: { adminQty: 1, adminPrice: 29, compagnonQty: 7, compagnonPrice: 6 } })],
      snapshot([sub(1, 14, [line(5, 6, 7), line(1, 1, 29)])]),
    );
    expect(rep.checks[0].issues.map((i) => i.code)).toEqual(["qty"]);
  });

  it("additionne plusieurs lignes du même profil et signale le doublon quand rien ne les distingue", () => {
    const rep = buildBillingReport(
      [client({ id: 7, name: "Toffolo", siren: "898999166", licences: { conducteurQty: 7, conducteurPrice: 22 } })],
      snapshot([sub(1, 10, [line(2, 5, 22), line(2, 2, 22)])]),
    );
    const c = rep.checks[0];
    expect(c.rows.find((r) => r.key === "conducteur")).toMatchObject({ plQty: 7, qtyDiff: 0, plPrice: 22 });
    expect(c.issues.map((i) => i.code)).toEqual(["duplicate-lines"]);
  });

  it("accepte plusieurs lignes par entité (groupe facturé par activité) et garde le détail", () => {
    const desc = (...paras: string[]) => JSON.stringify(paras.map((t) => ({ type: "paragraph", children: [{ text: t }] })));
    const rep = buildBillingReport(
      [client({ id: 7, name: "Toffolo", siren: "898999166", licences: { conducteurQty: 7, conducteurPrice: 22 } })],
      snapshot([
        sub(1, 10, [
          { ...line(2, 5, 22), description: desc("Maçonnerie", "Accès web + mobile") },
          { ...line(2, 2, 22), description: desc("Echafaudage", "Accès web + mobile") },
        ]),
      ]),
    );
    const c = rep.checks[0];
    expect(c.verdict).toBe("ok");
    expect(c.rows.find((r) => r.key === "conducteur")?.plLines).toEqual([
      { qty: 5, note: "Maçonnerie" },
      { qty: 2, note: "Echafaudage" },
    ]);
  });

  it("reconnaît le profil au libellé quand le produit n'a pas de référence", () => {
    const rep = buildBillingReport(
      [client({ id: 7, name: "CTSM", siren: "898999166", licences: { chefEquipeQty: 2, chefEquipePrice: 12 } })],
      snapshot([sub(1, 10, [line(null, 2, 12, "Licence TIM — Chef d'équipe")])]),
    );
    expect(rep.checks[0].verdict).toBe("ok");
  });

  it("met à part les lignes hors licences (forfait de mise en place)", () => {
    const rep = buildBillingReport(
      [client({ id: 7, name: "CTSM", siren: "898999166", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 10, [line(1, 1, 39), line(9, 1, 2000)])]),
    );
    const c = rep.checks[0];
    expect(c.extraLines).toEqual([{ label: "Mise en place & Formation (forfait unique)", qty: 1, unitPrice: 2000, amountHT: 2000 }]);
    expect(c.issues.map((i) => i.code)).toEqual(["extra-lines"]);
  });
});

describe("état de l'abonnement et paiement", () => {
  it("alerte sur un abonnement arrêté", () => {
    const rep = buildBillingReport(
      [client({ id: 7, name: "CTSM", siren: "898999166", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 10, [line(1, 1, 39)], { status: "stopped" })]),
    );
    expect(rep.checks[0].verdict).toBe("sans-abonnement");
    expect(rep.checks[0].issues[0].code).toBe("subscription-stopped");
  });

  it("alerte quand un client résilié est encore facturé", () => {
    const rep = buildBillingReport(
      [client({ id: 7, name: "CTSM", siren: "898999166", clientStatus: "resilie", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 10, [line(1, 1, 39)], { status: "in_progress" })]),
    );
    expect(rep.checks[0].issues.map((i) => i.code)).toContain("not-active-but-billed");
    expect(rep.checks[0].verdict).toBe("ecart");
  });

  it("compare le mode de paiement et le délai de règlement", () => {
    const rep = buildBillingReport(
      [
        client({
          id: 7,
          name: "CTSM",
          siren: "898999166",
          paymentMethod: "virement",
          paymentTerms: "30j",
          licences: { adminQty: 1, adminPrice: 39 },
        }),
      ],
      snapshot([sub(1, 10, [line(1, 1, 39)], { payment_method: "offline", payment_conditions: "15_days" })]),
    );
    expect(rep.checks[0].issues.map((i) => i.code)).toEqual(["payment-terms"]);

    const rep2 = buildBillingReport(
      [client({ id: 7, name: "CTSM", siren: "898999166", paymentMethod: "virement", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 10, [line(1, 1, 39)])]),
    );
    expect(rep2.checks[0].issues.map((i) => i.code)).toEqual(["payment-method"]);
  });
});

describe("abonnements orphelins et tri", () => {
  it("liste les abonnements vivants qu'aucune fiche ne réclame", () => {
    const rep = buildBillingReport(
      [client({ id: 7, name: "CTSM", siren: "898999166", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 10, [line(1, 1, 39)]), sub(2, 14, [line(1, 1, 29)]), sub(3, 11, [], { status: "stopped" })]),
    );
    expect(rep.orphans).toHaveLength(1);
    expect(rep.orphans[0]).toMatchObject({ customerName: "SOUVET VMB", regNo: "811758721", amountHT: 29 });
  });

  it("met les écarts avant les conformes", () => {
    const rep = buildBillingReport(
      [
        client({ id: 1, name: "A OK", siren: "898999166", licences: { adminQty: 1, adminPrice: 39 } }),
        client({ id: 2, name: "B Écart", siren: "811758721", licences: { adminQty: 2, adminPrice: 39 } }),
        client({ id: 3, name: "C Absent", siren: "000000000", licences: { adminQty: 1 } }),
      ],
      snapshot([sub(1, 10, [line(1, 1, 39)]), sub(2, 14, [line(1, 1, 39)])]),
    );
    expect(rep.checks.map((c) => c.client.name)).toEqual(["C Absent", "B Écart", "A OK"]);
    expect(rep.summary).toEqual({ total: 3, ok: 1, ecart: 1, sansAbonnement: 0, nonRapproche: 1, orphans: 0, latePayments: 0, lateAmount: 0 });
  });
});

describe("fiches homonymes", () => {
  it("ne laisse pas une fiche sans SIREN prendre le client Pennylane déjà relié par SIREN", () => {
    const rep = buildBillingReport(
      [
        client({ id: 20, name: "SOUVET VMB", clientStatus: "en-test", licences: { adminQty: 1, compagnonQty: 20 } }),
        client({ id: 3, name: "SOUVET VMB", siren: "811758721", licences: { adminQty: 1, adminPrice: 29 } }),
      ],
      snapshot([sub(1, 14, [line(1, 1, 29)])]),
    );
    expect(rep.checks).toHaveLength(1);
    expect(rep.checks[0].client.id).toBe(3);
    expect(rep.checks[0].verdict).toBe("ok");
  });
});

describe("remises de ligne", () => {
  // Pennylane pose la remise sur le total HT de la ligne : c'est lui qu'on lit.
  const discounted = (productId: number, qty: number, price: number, off: number): PlInvoiceLine => ({
    ...line(productId, qty, price),
    currency_amount_before_tax: String(qty * price - off),
  });

  it("compare le prix réellement facturé : une licence offerte dans Pennylane vaut 0", () => {
    // SCHNEIDER : 1 chef de chantier à 18 € avec 18 € de remise → 0 € facturé.
    const rep = buildBillingReport(
      [client({ id: 8, name: "SCHNEIDER", siren: "898999166", licences: { chefChantierQty: 1, chefChantierPrice: 18 } })],
      snapshot([sub(1, 10, [discounted(3, 1, 18, 18)])]),
    );
    const row = rep.checks[0].rows.find((r) => r.key === "chefChantier")!;
    expect(row).toMatchObject({ plQty: 1, plPrice: 0, plListPrice: 18, priceMismatch: true });
    expect(rep.checks[0].issues.map((i) => i.code)).toEqual(["price"]);
  });

  it("est conforme quand la fiche porte la même remise en €", () => {
    const rep = buildBillingReport(
      [
        client({
          id: 8,
          name: "SCHNEIDER",
          siren: "898999166",
          licences: { chefChantierQty: 1, chefChantierPrice: 18, chefChantierDiscountAmount: 18 },
        }),
      ],
      snapshot([sub(1, 10, [discounted(3, 1, 18, 18)])]),
    );
    const c = rep.checks[0];
    expect(c.verdict).toBe("ok");
    expect(c.rows.find((r) => r.key === "chefChantier")).toMatchObject({ supportPrice: 0, supportListPrice: 18 });
    expect(c.totals.supportHT).toBe(0);
  });

  it("applique une remise en % sur la fiche", () => {
    // 10 compagnons à 8 € avec 25 % → 6 € l'unité, 60 € HT.
    const rep = buildBillingReport(
      [client({ id: 9, name: "CTSM", siren: "898999166", licences: { compagnonQty: 10, compagnonPrice: 8, compagnonDiscountPct: 25 } })],
      snapshot([sub(1, 10, [line(5, 10, 6)])]),
    );
    const c = rep.checks[0];
    expect(c.verdict).toBe("ok");
    expect(c.totals.supportHT).toBe(60);
  });
});

describe("facture couvrant plusieurs mois (trimestrielle)", () => {
  const quarterly = { recurring_rule: { rule_type: "monthly", interval: 3, day_of_month: [4] } };
  const month = (section: number, qtyCC = 3) => [
    { ...line(3, qtyCC, 10), section_rank: section },
    { ...line(2, 4, 16), section_rank: section },
    { ...line(1, 4, 20), section_rank: section },
  ];

  it("ramène les trois sections « Mois 1/2/3 » à une quantité et un montant par mois", () => {
    // DEMATHIEU : 3 CC / 4 CT / 4 Admin par mois, facturés tous les 3 mois → 522 € par facture.
    const rep = buildBillingReport(
      [
        client({
          id: 183,
          name: "Demathieu bard",
          siren: "898999166",
          billingPeriod: "trimestrielle",
          licences: { adminQty: 4, adminPrice: 20, conducteurQty: 4, conducteurPrice: 16, chefChantierQty: 3, chefChantierPrice: 10 },
        }),
      ],
      snapshot([sub(1, 10, [...month(0), ...month(1), ...month(2)], quarterly)]),
    );
    const c = rep.checks[0];
    expect(c.verdict).toBe("ok");
    expect(c.totals).toEqual({ supportQty: 11, supportHT: 174, plQty: 11, plHT: 174 });
    expect(c.pennylane).toMatchObject({ months: 3, amountHT: 522 });
    expect(c.rows.find((r) => r.key === "chefChantier")?.plLines).toEqual([]);
  });

  it("signale une périodicité différente entre la fiche et Pennylane", () => {
    const rep = buildBillingReport(
      [
        client({
          id: 183,
          name: "Demathieu bard",
          siren: "898999166",
          licences: { adminQty: 4, adminPrice: 20, conducteurQty: 4, conducteurPrice: 16, chefChantierQty: 3, chefChantierPrice: 10 },
        }),
      ],
      snapshot([sub(1, 10, [...month(0), ...month(1), ...month(2)], quarterly)]),
    );
    const c = rep.checks[0];
    expect(c.issues).toEqual([
      { code: "billing-period", severity: "error", label: "Périodicité : tous les mois sur la fiche, tous les 3 mois dans Pennylane" },
    ]);
  });

  it("alerte quand les mois de la facture ne se répètent pas à l'identique", () => {
    const rep = buildBillingReport(
      [client({ id: 183, name: "Demathieu bard", siren: "898999166", billingPeriod: "trimestrielle", licences: { adminQty: 4, adminPrice: 20, conducteurQty: 4, conducteurPrice: 16, chefChantierQty: 3, chefChantierPrice: 10 } })],
      snapshot([sub(1, 10, [...month(0), ...month(1, 4), ...month(2)], quarterly)]),
    );
    const c = rep.checks[0];
    expect(c.issues.map((i) => i.code)).toContain("uneven-months");
    const cc = c.rows.find((r) => r.key === "chefChantier")!;
    expect(cc.plQty).toBe(3.33);
    expect(cc.plLines.map((l) => l.note)).toEqual(["Mois 1", "Mois 2", "Mois 3"]);
  });
});

describe("tampon pour l'historique mensuel", () => {
  it("donne le début de facturation et la conformité des licences seules", () => {
    const facts = client({ id: 8, name: "CTSM", siren: "898999166", paymentMethod: "virement", licences: { adminQty: 1, adminPrice: 39 } });
    const stamp = pennylaneStampFor(facts, snapshot([sub(1, 10, [line(1, 1, 39)], { start: "2026-10-04" })]));
    // Le mode de paiement diverge (virement / GoCardless) mais les licences sont bonnes : conforme.
    expect(stamp).toMatchObject({ start: "2026-10-04", ok: true, checkedAt: "2026-09-15T08:00:00.000Z" });
  });

  it("marque l'écart, et ne date rien sans abonnement vivant", () => {
    const facts = client({ id: 8, name: "CTSM", siren: "898999166", licences: { adminQty: 2, adminPrice: 39 } });
    expect(pennylaneStampFor(facts, snapshot([sub(1, 10, [line(1, 1, 39)])]))).toMatchObject({ ok: false });
    expect(pennylaneStampFor(facts, snapshot([sub(1, 10, [line(1, 2, 39)], { status: "stopped" })]))).toMatchObject({ start: null, ok: null });
    expect(pennylaneStampFor(facts, snapshot([]))).toMatchObject({ start: null, ok: null });
  });
});

describe("paiements", () => {
  const invoice = (over: Partial<PlInvoice>): PlInvoice => ({
    id: 900 + Math.floor(Math.random() * 1000),
    invoice_number: "F2026100001",
    date: "2026-07-04",
    deadline: "2026-07-19",
    status: "upcoming",
    paid: false,
    draft: false,
    amount: "46.8",
    currency_amount_before_tax: "39.0",
    remaining_amount_with_tax: "46.8",
    customer: { id: 10 },
    ...over,
  });
  // Abonnement démarré en juillet, on est le 15 septembre : juillet, août et septembre sont attendus.
  const started = { start: "2026-07-04", status: "in_progress" as const };

  it("fait ressortir une facture en retard, avec le reste dû", () => {
    const rep = buildBillingReport(
      [client({ id: 8, name: "CTSM", siren: "898999166", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 10, [line(1, 1, 39)], started)], CUSTOMERS, [
        invoice({ id: 1, date: "2026-07-04", deadline: "2026-07-19", status: "late" }),
        invoice({ id: 2, date: "2026-08-04", deadline: "2026-08-19", status: "paid", paid: true, remaining_amount_with_tax: "0" }),
        invoice({ id: 3, date: "2026-09-04", deadline: "2026-09-19", status: "upcoming" }),
      ]),
    );
    const c = rep.checks[0];
    expect(c.verdict).toBe("ecart");
    expect(c.latePayments.map((i) => i.id)).toEqual([1]);
    expect(c.latePayments[0]).toMatchObject({ state: "retard", lateDays: 58, remaining: 46.8 });
    expect(c.issues).toEqual([
      { code: "late-payment", severity: "error", label: "Facture F2026100001 en retard de 58 j — 46,8 € TTC restant dus" },
    ]);
    expect(c.invoices.map((i) => i.state)).toEqual(["a-echoir", "payee", "retard"]);
    expect(rep.summary).toMatchObject({ latePayments: 1, lateAmount: 46.8 });
  });

  it("déduit le retard de l'échéance quand Pennylane dit encore « à échoir »", () => {
    const rep = buildBillingReport(
      [client({ id: 8, name: "CTSM", siren: "898999166", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 10, [line(1, 1, 39)], started)], CUSTOMERS, [
        invoice({ id: 1, date: "2026-07-04", deadline: "2026-09-10", status: "upcoming" }),
        invoice({ id: 2, date: "2026-08-04", deadline: "2026-08-19", status: "paid", paid: true }),
        invoice({ id: 3, date: "2026-09-04", deadline: "2026-09-19", status: "upcoming" }),
      ]),
    );
    expect(rep.checks[0].latePayments.map((i) => i.id)).toEqual([1]);
  });

  it("signale un mois attendu sans facture émise", () => {
    const rep = buildBillingReport(
      [client({ id: 8, name: "CTSM", siren: "898999166", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 10, [line(1, 1, 39)], started)], CUSTOMERS, [
        invoice({ id: 1, date: "2026-07-04", status: "paid", paid: true }),
        invoice({ id: 3, date: "2026-09-04", deadline: "2026-09-19", status: "upcoming" }),
      ]),
    );
    const c = rep.checks[0];
    expect(c.months.map((m) => [m.month.slice(0, 7), m.missing])).toEqual([
      ["2026-07", false],
      ["2026-08", true],
      ["2026-09", false],
    ]);
    expect(c.issues).toEqual([{ code: "missing-invoice", severity: "error", label: "Aucune facture émise en août 2026" }]);
  });

  it("n'attend qu'une facture par trimestre pour un abonnement trimestriel", () => {
    const rep = buildBillingReport(
      [client({ id: 8, name: "CTSM", siren: "898999166", billingPeriod: "trimestrielle", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot(
        [sub(1, 10, [line(1, 1, 39), { ...line(1, 1, 39), section_rank: 1 }, { ...line(1, 1, 39), section_rank: 2 }], { ...started, start: "2026-04-04", recurring_rule: { rule_type: "monthly", interval: 3 } })],
        CUSTOMERS,
        [invoice({ id: 1, date: "2026-04-04", status: "paid", paid: true }), invoice({ id: 2, date: "2026-07-04", status: "paid", paid: true })],
      ),
    );
    const c = rep.checks[0];
    expect(c.months.map((m) => m.month.slice(0, 7))).toEqual(["2026-04", "2026-07"]);
    expect(c.issues).toEqual([]);
  });

  it("n'attend rien avant le début de l'abonnement, ni pour un abonnement à venir", () => {
    const rep = buildBillingReport(
      [client({ id: 8, name: "CTSM", siren: "898999166", licences: { adminQty: 1, adminPrice: 39 } })],
      snapshot([sub(1, 10, [line(1, 1, 39)])]),
    );
    expect(rep.checks[0].months).toEqual([]);
    expect(rep.checks[0].verdict).toBe("ok");
  });
});
