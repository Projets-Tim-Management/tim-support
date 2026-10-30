import { describe, expect, it } from "vitest";

import { matchAll, matchClient, parseAxonaut, profileOf, withCorrections } from "@/modules/analytics/lib/axonaut";
import { buildRevenueHistory, monthKeys } from "@/modules/analytics/lib/revenue-history";

/**
 * L'historique Axonaut : lire une facture PDF (texte de `pdftotext -layout`),
 * séparer licences et prestations, la rattacher à sa fiche, et tracer le CA
 * mois par mois sans compter deux fois le mois de la bascule vers Pennylane.
 */

const pad = (s: string) => " ".repeat(82) + s;

// La mise en page d'Axonaut : en-tête, bloc client à droite (colonne 82), tableau, totaux.
const invoice = (o: { kind?: string; number: string; date: string; client: string[]; lines: string[]; ht: string; ttc: string; extra?: string }) =>
  [
    ` TIM MANAGEMENT - LC DEV - ${o.kind ?? "Facture"} ${o.number}                                       Page 1/1`,
    "",
    pad(o.kind ?? "Facture"),
    pad(o.number),
    pad(`LUCENAY, le ${o.date}`),
    "TIM Management",
    ...o.client.map((c, i) => (i === 0 ? "131 chemin du Bief" + " ".repeat(64) + c : pad(c))),
    "",
    " Description                                                    Prix unitaire     Quantité      Remise     Montant HT",
    "",
    ...o.lines,
    "",
    o.extra ?? "",
    `Conditions générales: Nos contrats …                                   Total HT                 ${o.ht} €`,
    `                                                                       TVA 20,00%               0,00 €`,
    `Modalités et conditions de règlement :                                 Total TTC                ${o.ttc} €`,
  ].join("\n");

const LIC = (label: string, pu: string, qty: number, ht: string, remise = "") =>
  ` ${label.padEnd(70)}${pu} €${String(qty).padStart(12)}${remise ? `   ${remise}` : ""}${ht.padStart(14)} €`;

describe("parseAxonaut", () => {
  it("lit une facture de licences : numéro, date, client, SIREN tiré du SIRET, lignes par profil", () => {
    const d = parseAxonaut(
      invoice({
        number: "F20260704-164",
        date: "04/07/2026",
        client: ["E.R.B.", "10 RUE DU CHENE GALANT", "N° de TVA : FR15384238341", "N° Siret : 38423834100026"],
        lines: [LIC("Licences / mois ADMINISTRATION", "27,00", 1, "27,00"), LIC("Licences / mois CONDUCTEUR DE TRAVAUX", "22,00", 11, "242,00")],
        ht: "269,00",
        ttc: "322,80",
      }),
    );
    expect(d).toMatchObject({ kind: "facture", number: "F20260704-164", date: "2026-07-04", month: "2026-07", clientName: "E.R.B.", siren: "384238341", totalHT: 269, recurringHT: 269, servicesHT: 0 });
    expect(d.lines.map((l) => [l.profile, l.qty, l.amountHT])).toEqual([
      ["admin", 1, 27],
      ["conducteur", 11, 242],
    ]);
  });

  it("garde la remise imprimée et compte un ajustement global comme du récurrent quand tout est licence", () => {
    const d = parseAxonaut(
      invoice({
        number: "F20251204-197",
        date: "04/12/2025",
        client: ["Afonso Construction"],
        lines: [LIC("Licences / MOIS", "41,00", 23, "707,25", "-25,00 %")],
        extra: " Régulariser la situation                                                                    -125,21 €",
        ht: "582,04",
        ttc: "698,45",
      }),
    );
    expect(d.lines[0]).toMatchObject({ discount: "-25,00 %", amountHT: 707.25, profile: null, licence: true });
    expect(d).toMatchObject({ recurringHT: 582.04, servicesHT: 0, siren: null });
  });

  it("sépare les prestations ponctuelles des licences", () => {
    const d = parseAxonaut(
      invoice({
        number: "F20260611-157",
        date: "11/06/2026",
        client: ["Berthouly Construction", "SIREN : 320940174"],
        lines: [LIC("Mise en place / Formation", "2 100,00", 1, "2 100,00"), LIC("Licences / mois COMPAGNON", "6,00", 5, "30,00")],
        ht: "2 130,00",
        ttc: "2 556,00",
      }),
    );
    expect(d).toMatchObject({ siren: "320940174", totalHT: 2130, recurringHT: 30, servicesHT: 2100 });
  });

  it("reconnaît un avoir et la facture qu'il corrige ; le SIREN vient de la TVA s'il manque", () => {
    const d = parseAxonaut(
      invoice({
        kind: "Avoir",
        number: "F20260824-187",
        date: "24/08/2026",
        client: ["Groupe Viriate Services", "N° de TVA : FR52820715332"],
        lines: [LIC("Licences / mois CONDUCTEUR DE TRAVAUX Maçonnerie", "23,00", -5, "-115,00")],
        extra: "Avoir sur facture : #F20260815-186",
        ht: "-115,00",
        ttc: "-138,00",
      }),
    );
    expect(d).toMatchObject({ kind: "avoir", creditFor: "F20260815-186", siren: "820715332", recurringHT: -115 });
  });

  it("refuse un document qui n'est pas une facture Axonaut", () => {
    expect(() => parseAxonaut("Bonjour")).toThrow(/Axonaut/);
  });

  it("reconnaît les profils, y compris « CHEF DE EQUIPE »", () => {
    expect(profileOf("Licences / mois CHEF DE EQUIPE")).toBe("chefEquipe");
    expect(profileOf("Licences / mois CHEF DE CHANTIER Maçonnerie")).toBe("chefChantier");
    expect(profileOf("Licences / MOIS")).toBeNull();
  });
});

describe("withCorrections", () => {
  it("compte Pro11 au prix régularisé et neutralise la régularisation de juillet 2025", () => {
    const base = { kind: "facture" as const, date: "2025-01-03", month: "2025-01", clientName: "Pro11", siren: null, vatNumber: null, totalTTC: 0, creditFor: null, lines: [], note: null };
    expect(withCorrections({ ...base, number: "F20250103-102", totalHT: 1308.75, recurringHT: 1308.75, servicesHT: 0 })).toMatchObject({ totalHT: 1308.75, recurringHT: 419.4 });
    expect(withCorrections({ ...base, number: "F20250724-164", totalHT: 5652.2, recurringHT: 0, servicesHT: 5652.2 })).toMatchObject({ recurringHT: 0, servicesHT: 0 });
    expect(withCorrections({ ...base, number: "F20260103-102", totalHT: 436.5, recurringHT: 436.5, servicesHT: 0 }).note).toBeNull();
  });
});

describe("rattachement aux fiches", () => {
  const clients = [
    { id: 5, companyName: "PRO 11", raisonSociale: "Groupe Viriate Services", siren: null },
    { id: 14, companyName: "AFONSO HUMBERTO SAS", siren: "479 680 076" },
    { id: 13, companyName: "ENF" },
    { id: 20, companyName: "Dupont Bâtiment" },
    { id: 21, companyName: "Dupont Bâtiment Sud" },
  ];

  it("par SIREN d'abord, puis par nom ou raison sociale, sans forme juridique", () => {
    expect(matchClient({ clientName: "Afonso Construction", siren: "479680076" }, clients)).toEqual({ id: 14, by: "siren" });
    expect(matchClient({ clientName: "SARL E.N.F", siren: null }, clients)).toEqual({ id: 13, by: "nom" });
    expect(matchClient({ clientName: "Pro11", siren: null }, clients)).toEqual({ id: 5, by: "nom" });
    expect(matchClient({ clientName: "Groupe Viriate Services", siren: "820715332" }, clients)).toEqual({ id: 5, by: "nom" });
  });

  it("ne devine pas quand le nom désigne plusieurs fiches", () => {
    expect(matchClient({ clientName: "Dupont", siren: null }, clients)).toBeNull();
  });

  it("étend le SIREN d'une facture à toutes celles du même nom", () => {
    const doc = (number: string, siren: string | null) => ({ number, clientName: "Afonso Construction", siren }) as never;
    const m = matchAll([doc("F20250104-104", null), doc("F20260804-177", "479680076")], clients);
    expect(m.get("F20250104-104")).toEqual({ id: 14, by: "siren" });
  });
});

describe("buildRevenueHistory", () => {
  const now = new Date("2026-11-15T10:00:00Z");

  it("enchaîne Axonaut puis Pennylane sans compter deux fois la bascule", () => {
    const h = buildRevenueHistory(
      [
        { month: "2026-09", client: 1, clientName: "A", recurringHT: 100, servicesHT: 50 },
        // Une facture Axonaut après la bascule ne compte pas : Pennylane fait foi.
        { month: "2026-10", client: 1, clientName: "A", recurringHT: 999, servicesHT: 0 },
      ],
      [
        { date: "2026-09-20", amountHT: 999, client: 1, clientName: "A" },
        { date: "2026-10-04", amountHT: 120, client: 1, clientName: "A" },
      ],
      now,
    );
    const by = Object.fromEntries(h.months.map((m) => [m.key, m]));
    expect(by["2026-09"]).toMatchObject({ source: "axonaut", recurring: 100, services: 50, total: 150 });
    expect(by["2026-10"]).toMatchObject({ source: "pennylane", recurring: 120, total: 120 });
    expect(h.months[0].key).toBe("2025-01");
    expect(h.months.at(-1)!.key).toBe("2026-11");
  });

  it("lit les mouvements sur les licences : nouveaux, départs, hausses, baisses", () => {
    const h = buildRevenueHistory(
      [
        { month: "2025-01", client: 1, clientName: "A", recurringHT: 100, servicesHT: 0 },
        { month: "2025-01", client: 2, clientName: "B", recurringHT: 50, servicesHT: 0 },
        { month: "2025-02", client: 1, clientName: "A", recurringHT: 130, servicesHT: 0 },
        { month: "2025-02", client: 3, clientName: "C", recurringHT: 40, servicesHT: 500 },
        { month: "2025-03", client: 1, clientName: "A", recurringHT: 110, servicesHT: 0 },
        { month: "2025-03", client: 3, clientName: "C", recurringHT: 40, servicesHT: 0 },
      ],
      [],
      new Date("2025-03-10T00:00:00Z"),
    );
    const [jan, feb, mar] = h.months;
    expect(jan).toMatchObject({ clients: 2, gained: 0, lost: 0 });
    expect(feb).toMatchObject({ clients: 2, gained: 1, gainedNames: "C", lost: 1, lostNames: "B", expansion: 30, contraction: 0, services: 500 });
    expect(mar).toMatchObject({ gained: 0, lost: 0, expansion: 0, contraction: 20 });
    const a = h.clients.find((c) => c.clientId === 1)!;
    expect(a).toMatchObject({ firstMonth: "2025-01", lastMonth: "2025-03", monthsBilled: 3, lastRecurring: 110, byYear: { "2025": 340 } });
    expect(h.years).toEqual([{ year: "2025", recurring: 470, services: 500, total: 970 }]);
  });

  it("garde un client sans fiche sous son nom", () => {
    const h = buildRevenueHistory([{ month: "2025-01", client: null, clientName: "Inconnu", recurringHT: 10, servicesHT: 0 }], [], new Date("2025-01-20T00:00:00Z"));
    expect(h.clients[0]).toMatchObject({ id: "nom:Inconnu", clientId: null, name: "Inconnu" });
  });

  it("monthKeys couvre le mois courant et change d'année", () => {
    expect(monthKeys("2025-11", new Date("2026-02-01T00:00:00Z"))).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});
