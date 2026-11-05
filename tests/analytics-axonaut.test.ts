import { describe, expect, it } from "vitest";

import { isTimInvoice, matchAll, matchClient, parseAxonaut, profileOf, splitServices, withCorrections } from "@/modules/analytics/lib/axonaut";
import { analyzeHistory, bucketLabel, bucketStart, buildRevenueHistory, lifetime, monthKeys, rangeLabel, shiftMonth } from "@/modules/analytics/lib/revenue-history";

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

describe("isTimInvoice", () => {
  it("garde les factures de TIM et écarte tout ce qui est DELIGUME", () => {
    expect(isTimInvoice("TIM MANAGEMENT - LC DEV … N° Siret : 89231603500013 … Licences / mois")).toBe(true);
    expect(isTimInvoice("SIREN 892 316 035 · Licence TIM — Compagnon")).toBe(true);
    // DELIGUME, 2019–2020 : son propre SIREN.
    expect(isTimInvoice("DELIGUME - Société par actions simplifiée … R.C.S. ANSE 831150305")).toBe(false);
    // Avril 2022 : saisie sur le compte TIM, mais un panier DELIGUME.
    expect(isTimInvoice("N° Siret : 89231603500013 … DeliBox' DeliFruit' (10kg) … SAS DELIGUME")).toBe(false);
    // Sans SIREN lisible : rien n'entre.
    expect(isTimInvoice("Facture F20200111-10306")).toBe(false);
  });
});

describe("withCorrections", () => {
  it("compte au bon prix les factures Pro11 de 2024 citées par la régularisation, pas juillet 2024", () => {
    const pro = { kind: "facture" as const, date: "2024-09-03", month: "2024-09", clientName: "Pro11", siren: null, vatNumber: null, totalTTC: 0, creditFor: null, lines: [], note: null };
    expect(withCorrections({ ...pro, number: "F20240903-145", totalHT: 1308.75, recurringHT: 1308.75, servicesHT: 0 })).toMatchObject({ recurringHT: 419.4 });
    expect(withCorrections({ ...pro, number: "F20240603-126", totalHT: 1113, recurringHT: 1113, servicesHT: 0 })).toMatchObject({ recurringHT: 419.4 });
    expect(withCorrections({ ...pro, number: "F20240703-132", totalHT: 1113, recurringHT: 1113, servicesHT: 0 })).toMatchObject({ recurringHT: 1113, note: null });
  });

  it("compte Pro11 au prix régularisé et neutralise la régularisation de juillet 2025", () => {
    const base = { kind: "facture" as const, date: "2025-01-03", month: "2025-01", clientName: "Pro11", siren: null, vatNumber: null, totalTTC: 0, creditFor: null, lines: [], note: null };
    expect(withCorrections({ ...base, number: "F20250103-102", totalHT: 1308.75, recurringHT: 1308.75, servicesHT: 0 })).toMatchObject({ totalHT: 1308.75, recurringHT: 419.4 });
    expect(withCorrections({ ...base, number: "F20250724-164", totalHT: 5652.2, recurringHT: 0, servicesHT: 5652.2 })).toMatchObject({ recurringHT: 0, servicesHT: 0 });
    expect(withCorrections({ ...base, number: "F20260103-102", totalHT: 436.5, recurringHT: 436.5, servicesHT: 0 }).note).toBeNull();
  });

  it("compte les factures CTSM du 29 pour le mois suivant", () => {
    const ctsm = { kind: "facture" as const, number: "F20260829-188", date: "2026-08-29", month: "2026-08", clientName: "CTSM", siren: null, vatNumber: null, totalHT: 152, totalTTC: 152, creditFor: null, lines: [], recurringHT: 152, servicesHT: 0, note: null };
    expect(withCorrections(ctsm)).toMatchObject({ date: "2026-08-29", month: "2026-09", recurringHT: 152 });
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

  it("ne rattache pas un nom court perdu dans un nom long", () => {
    expect(matchClient({ siren: null, clientName: "Steeleo Solar Energy" }, [{ id: 73, companyName: "Erg" }])).toBeNull();
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
    // L'historique commence à la première facture connue (ici septembre 2026), jamais avant le plancher.
    expect(h.start).toBe("2026-09");
    expect(h.months[0].key).toBe("2026-09");
    expect(h.months.at(-1)!.key).toBe("2026-11");
    expect(buildRevenueHistory([{ month: "2020-05", client: 1, clientName: "A", recurringHT: 1, servicesHT: 0 }], [], now).start).toBe("2021-09");
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

  it("lisse une facture trimestrielle sur ses trois mois, sans montrer les mois à venir", () => {
    const pl = [{ date: "2026-10-04", amountHT: 522, client: 9, clientName: "Demathieu Bard", months: 3 }];
    const oct = buildRevenueHistory([], pl, new Date("2026-10-30T00:00:00Z"));
    expect(oct.months.at(-1)).toMatchObject({ key: "2026-10", recurring: 174 });
    const dec = buildRevenueHistory([], pl, new Date("2026-12-15T00:00:00Z"));
    expect(dec.months.slice(-3).map((m) => m.recurring)).toEqual([174, 174, 174]);
    expect(dec.clients[0]).toMatchObject({ monthsBilled: 3, lastMonth: "2026-12" });
    const odd = buildRevenueHistory([], [{ ...pl[0], amountHT: 100 }], new Date("2026-12-15T00:00:00Z"));
    expect(odd.months.slice(-3).map((m) => m.recurring)).toEqual([33.33, 33.33, 33.34]);
  });

  it("monthKeys couvre le mois courant et change d'année", () => {
    expect(monthKeys("2025-11", new Date("2026-02-01T00:00:00Z"))).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("vues et comparaison", () => {
  // A : 100/mois de janv. 2025 à juin 2026 ; B arrive en avril 2026 (50/mois) ;
  // C facturé jusqu'en février 2026 ; une mise en place chez B en mai 2026.
  const months = monthKeys("2025-01", new Date("2026-06-01T00:00:00Z"));
  const legacy = [
    ...months.map((month) => ({ month, client: 1, clientName: "A", recurringHT: 100, servicesHT: 0 })),
    ...["2026-04", "2026-05", "2026-06"].map((month) => ({ month, client: 2, clientName: "B", recurringHT: 50, servicesHT: 0 })),
    ...months.filter((m) => m <= "2026-02").map((month) => ({ month, client: 3, clientName: "C", recurringHT: 30, servicesHT: 0 })),
    { month: "2026-05", client: 2, clientName: "B", recurringHT: 0, servicesHT: 900 },
  ];
  // Juillet 2026 est le mois en cours, pas encore facturé.
  const h = buildRevenueHistory(legacy, [], new Date("2026-07-02T00:00:00Z"));

  it("découpe et nomme les périodes de chaque vue", () => {
    expect(shiftMonth("2025-01", -1)).toBe("2024-12");
    expect(bucketStart("2026-08", "trimestre")).toBe("2026-07");
    expect(bucketStart("2026-08", "semestre")).toBe("2026-07");
    expect(bucketStart("2026-08", "annee")).toBe("2026-01");
    expect(bucketLabel("2026-07", "trimestre")).toBe("T3 2026");
    expect(bucketLabel("2026-01", "semestre")).toBe("S1 2026");
    expect(bucketLabel("2026-01", "annee")).toBe("2026");
    expect(rangeLabel("2025-11", "2026-02")).toBe("nov. 2025 – févr. 2026");
    expect(rangeLabel("2026-04", "2026-06")).toBe("avr. – juin 2026");
  });

  it("par défaut : l'année en cours, par mois, face aux mêmes mois de l'an d'avant", () => {
    const an = analyzeHistory(h, {});
    expect([an.view, an.start, an.end, an.compareMode, an.bStart, an.bEnd]).toEqual(["mois", "2026-01", "2026-06", "n1", "2025-01", "2025-06"]);
    expect(an.buckets).toHaveLength(6);
    expect(an.b).toMatchObject({ covered: 6 });
    expect(an.buckets[0]).toMatchObject({ label: "janv. 2026", compare: { label: "janv. 2025" }, pct: 0 });
    expect(an.buckets[2]).toMatchObject({ label: "mars 2026", pct: -23.08 });
  });

  it("par trimestre, du… au…, face à la période précédente", () => {
    const an = analyzeHistory(h, { hv: "trimestre", hd: "2026-02", hf: "2026-06", hc: "prec" });
    expect(an.buckets.map((x) => [x.label, x.summary.total, x.compare?.label, x.compare?.total, x.pct])).toEqual([
      // Février–mars : le trimestre est coupé par la plage, comparé à date (les mêmes mois du trimestre d'avant).
      ["T1 2026 (2 mois)", 230, "nov. – déc. 2025", 260, -11.54],
      ["T2 2026", 1350, "T1 2026", 360, 275],
    ]);
    expect(an.a).toMatchObject({ label: "févr. – juin 2026", total: 1580, gained: ["B"], lost: ["C"] });
    expect(an.b).toMatchObject({ label: "sept. 2025 – janv. 2026", total: 650 });
    const by = Object.fromEntries(an.clients.map((x) => [x.name, x]));
    expect(by.B).toMatchObject({ recurringA: 150, recurringB: 0, servicesA: 900, status: "nouveau" });
    expect(by.C).toMatchObject({ recurringA: 30, recurringB: 150, status: "baisse" });
  });

  it("un an avant, et une comparaison choisie avec son début et sa fin", () => {
    const n1 = analyzeHistory(h, { hv: "trimestre", hd: "2026-04", hf: "2026-06", hc: "n1" });
    expect([n1.bStart, n1.bEnd, n1.buckets[0].compare?.label]).toEqual(["2025-04", "2025-06", "T2 2025"]);
    const perso = analyzeHistory(h, { hd: "2026-04", hf: "2026-06", hc: "perso", hcd: "2025-01", hcf: "2025-06" });
    expect([perso.bStart, perso.bEnd]).toEqual(["2025-01", "2025-06"]);
    // Durées différentes : pas de % sur les totaux.
    expect(perso.b).toMatchObject({ covered: 6 });
    const none = analyzeHistory(h, { hc: "aucune" });
    expect(none.b).toBeNull();
    expect(none.clients.every((x) => x.status === null)).toBe(true);
  });

  it("par année : 2025 et 2026, l'année en cours face aux mêmes mois de l'an d'avant", () => {
    const an = analyzeHistory(h, { hv: "annee" });
    expect(an.buckets.map((x) => [x.label, x.summary.total, x.compare?.label ?? null, x.compare?.total ?? null, x.pct])).toEqual([
      ["2025", 1560, null, null, null],
      ["2026 (6 mois)", 1710, "janv. – juin 2025", 780, 119.23],
    ]);
  });

  it("par année : une courbe par année, de janvier à décembre, arrêtée au dernier mois facturé", () => {
    const an = analyzeHistory(h, { hv: "annee", hm: "licences" });
    expect(an.yearLines!.years).toEqual(["2025", "2026"]);
    const row = (m: number) => an.yearLines!.rows[m - 1];
    expect(row(1)).toMatchObject({ label: "janv.", y2025: 130, y2026: 130 });
    expect(row(5)).toMatchObject({ y2025: 130, y2026: 150 });
    expect(row(12)).toMatchObject({ label: "déc.", y2025: 130, y2026: null });
    // Sur tout l'historique, quelle que soit la vue ou la plage.
    expect(analyzeHistory(h, { hv: "mois", hd: "2026-05", hf: "2026-06" }).yearLines.rows[0]).toMatchObject({ y2025: 130, y2026: 130 });
  });

  it("ignore un choix invalide et remet la plage dans l'ordre", () => {
    const an = analyzeHistory(h, { hv: "semaine", hd: "2026-06", hf: "2026-03", hc: "n2" });
    expect([an.view, an.start, an.end, an.compareMode]).toEqual(["mois", "2026-03", "2026-06", "n1"]);
    expect(analyzeHistory(h, { hd: "2024-01" }).start).toBe("2026-01");
    expect(analyzeHistory(h, { hv: "annee" }).start).toBe("2025-01");
  });
});

describe("prestations : mise en place / formation et développements", () => {
  it("répartit au prorata des lignes, remise comprise", () => {
    const lines = [
      { label: "Mise en place / Formation", licence: false, amountHT: 300 },
      { label: "Développement sur mesure", licence: false, amountHT: 1020 },
      { label: "Licences / mois ADMINISTRATION", licence: true, amountHT: 27 },
    ];
    // 1 320 € de lignes, 924 € facturés après remise : 30 % de moins sur chacune.
    expect(splitServices(lines, 924)).toEqual({ setupHT: 210, devHT: 714 });
    expect(splitServices([{ label: "Ventilation des heures", licence: false, amountHT: 2520 }], 2520)).toEqual({ setupHT: 0, devHT: 2520 });
    expect(splitServices([], 0)).toEqual({ setupHT: 0, devHT: 0 });
  });

  it("la courbe et le tableau montrent le montant choisi", () => {
    const h = buildRevenueHistory(
      [
        { month: "2025-01", client: 1, clientName: "A", recurringHT: 100, servicesHT: 0 },
        { month: "2025-02", client: 1, clientName: "A", recurringHT: 100, servicesHT: 900, setupHT: 300 },
      ],
      [],
      new Date("2025-02-10T00:00:00Z"),
    );
    const pick = (hm: string) => analyzeHistory(h, { hm, hc: "prec" }).buckets.map((x) => [x.label, x.value, x.pct]);
    expect(pick("tout")).toEqual([["janv. 2025", 100, null], ["févr. 2025", 1000, 900]]);
    expect(pick("licences")).toEqual([["janv. 2025", 100, null], ["févr. 2025", 100, 0]]);
    expect(pick("formation")).toEqual([["janv. 2025", 0, null], ["févr. 2025", 300, null]]);
    expect(pick("developpement")).toEqual([["janv. 2025", 0, null], ["févr. 2025", 600, null]]);
  });
});

describe("depuis le début", () => {
  const legacy = [
    { month: "2025-01", client: 1, clientName: "A", recurringHT: 100, servicesHT: 500 },
    { month: "2025-02", client: 1, clientName: "A", recurringHT: 100, servicesHT: 0 },
    { month: "2025-03", client: 1, clientName: "A", recurringHT: 120, servicesHT: 0 },
    { month: "2025-01", client: 2, clientName: "B", recurringHT: 50, servicesHT: 0 },
  ];
  const h = buildRevenueHistory(legacy, [], new Date("2025-03-20T00:00:00Z"));

  it("totalise le CA depuis le début et donne à chaque client son total, actif ou perdu", () => {
    const l = lifetime(h, "2025-03");
    expect(l.total).toBe(870);
    expect(l.clients.map((c) => [c.name, c.total, c.active, c.currentRecurring, c.firstMonth, c.lastMonth])).toEqual([
      ["A", 820, true, 120, "2025-01", "2025-03"],
      ["B", 50, false, 0, "2025-01", "2025-01"],
    ]);
  });
});

describe("corrections de la revue (02/11/2026)", () => {
  it("le mois en cours ne passe pas pour facturé parce qu'une trimestrielle y est lissée", () => {
    const h = buildRevenueHistory(
      [{ month: "2026-09", client: 1, clientName: "A", recurringHT: 300, servicesHT: 0 }],
      [
        { date: "2026-10-04", amountHT: 300, client: 1, clientName: "A" },
        { date: "2026-10-01", amountHT: 300, client: 2, clientName: "B", months: 3 },
      ],
      new Date("2026-11-02T00:00:00Z"),
    );
    expect(h.lastBilledMonth).toBe("2026-10");
    const an = analyzeHistory(h, {});
    expect(an.end).toBe("2026-10");
    expect(an.a.lost).toEqual([]);
  });

  it("les licences du moment d'un client actif ne tombent pas à zéro un mois de prestations seules", () => {
    const h = buildRevenueHistory(
      [
        { month: "2026-08", client: 1, clientName: "A", recurringHT: 300, servicesHT: 0 },
        { month: "2026-09", client: 1, clientName: "A", recurringHT: 0, servicesHT: 500 },
      ],
      [],
      new Date("2026-09-20T00:00:00Z"),
    );
    expect(lifetime(h, "2026-09").clients[0]).toMatchObject({ active: true, currentRecurring: 300 });
  });

  it("un SIREN contradictoire empêche le rattachement par nom", () => {
    expect(matchClient({ siren: "111111111", clientName: "Martin BTP" }, [{ id: 1, companyName: "Martin BTP SAS", siren: "222222222" }])).toBeNull();
  });
});

describe("arrivés et partis : deux mois sans licences d'affilée (04/11/2026)", () => {
  const inv = (month: string, client: number, name: string) => ({ month, client, clientName: name, recurringHT: 100, servicesHT: 0 });
  const months = ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"];

  it("un mois sans facture ne fait ni un départ ni un retour ; deux, si", () => {
    const h = buildRevenueHistory(
      [
        ...months.map((m) => inv(m, 1, "A")),
        // B saute avril (une facture en retard) : toujours client.
        ...months.filter((m) => m !== "2026-04").map((m) => inv(m, 2, "B")),
        // C n'est plus facturé à partir de mars : parti.
        inv("2026-01", 3, "C"),
        inv("2026-02", 3, "C"),
      ],
      [],
      new Date("2026-07-05T00:00:00Z"),
    );
    const an = analyzeHistory(h, { hd: "2026-02", hf: "2026-06" });
    expect(an.a.lost).toEqual(["C"]);
    expect(an.a.gained).toEqual([]);
  });

  it("le dernier mois facturé, une facture pas encore émise ne fait pas un départ", () => {
    const h = buildRevenueHistory(
      [inv("2026-09", 1, "A"), inv("2026-09", 2, "Toffolo")],
      [
        { date: "2026-10-04", amountHT: 100, client: 1, clientName: "A" },
        { date: "2026-10-15", amountHT: 100, client: 2, clientName: "Toffolo" },
        { date: "2026-11-02", amountHT: 100, client: 1, clientName: "A" },
      ],
      new Date("2026-11-04T00:00:00Z"),
    );
    const an = analyzeHistory(h, {});
    expect(an.end).toBe("2026-11");
    expect(an.a.lost).toEqual([]);
  });
});
