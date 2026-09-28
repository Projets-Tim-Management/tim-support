import { describe, expect, it } from "vitest";

import { DEFAULT_CONTRACT_SECTIONS, DEFAULT_PROVIDER } from "@/modules/partner/lib/contract-template.default";
import {
  amount,
  buildContractVars,
  contractPriceRows,
  inWords,
  monthsText,
  rcsNumber,
  yearsText,
} from "@/modules/partner/lib/contract-vars";
import { legalFormFromInsee, legalFormLabel } from "@/modules/partner/lib/legal-forms";

/**
 * Contrat SaaS, étape 1 : les données et le modèle. Ce qui compte : chaque
 * variable du texte a une valeur calculable, et aucun passage conditionnel
 * n'est laissé ouvert.
 */

const CLIENT = {
  companyName: "Souvet",
  raisonSociale: "SOUVET VMB",
  legalForm: "sas",
  shareCapital: 10000,
  siren: "811756721",
  rcsCity: "Lyon",
  billingAddress: "84 impasse des pépinières, 69000 Lyon",
  representativeFirstName: "Charlie",
  representativeLastName: "Piancatelli",
  representativeRole: "Président",
  engagementMonths: "12",
  preferentialYears: 2,
  integrationFee: 1500,
  integrationOffered: true,
  licences: { adminQty: 1, adminPrice: 27, compagnonQty: 20, compagnonPrice: 7, compagnonDiscountPct: 20 },
};
const SETTINGS = { provider: DEFAULT_PROVIDER, bank: { iban: "FR76 0000", bic: "AGRIFRPP" } };

describe("formes juridiques", () => {
  it("se déduisent de la catégorie INSEE", () => {
    expect(legalFormFromInsee("5710")).toBe("sas");
    expect(legalFormFromInsee("5720")).toBe("sasu");
    expect(legalFormFromInsee("5499")).toBe("sarl");
    expect(legalFormFromInsee("5498")).toBe("eurl");
    expect(legalFormFromInsee("1000")).toBe("ei");
    expect(legalFormFromInsee("9220")).toBe("autre");
    expect(legalFormFromInsee(null)).toBeNull();
  });

  it("s'écrivent en toutes lettres dans le contrat", () => {
    expect(legalFormLabel("sas")).toBe("Société par actions simplifiée");
  });

  it("« autre » reste à compléter dans le contrat", () => {
    expect(legalFormLabel("autre")).toBeNull();
    expect(buildContractVars({ legalForm: "autre" }, {})["client.formeSociale"]).toBeNull();
  });
});

describe("mise en forme", () => {
  it("écrit les durées comme un juriste", () => {
    expect(inWords(12)).toBe("douze (12)");
    expect(monthsText(24)).toBe("vingt-quatre (24) mois");
    expect(yearsText(1)).toBe("un (1) an");
    expect(yearsText(2)).toBe("deux (2) ans");
  });

  it("formate montants et RCS", () => {
    expect(amount(1500)).toBe("1 500");
    expect(amount(5.6)).toBe("5,60");
    expect(rcsNumber("811756721")).toBe("811 756 721");
    expect(rcsNumber("123")).toBeNull();
  });
});

describe("variables du contrat", () => {
  const vars = buildContractVars(CLIENT, SETTINGS);

  it("remplit l'identité du client et son représentant", () => {
    expect(vars["client.denomination"]).toBe("SOUVET VMB");
    expect(vars["client.formeSociale"]).toBe("Société par actions simplifiée");
    expect(vars["client.numeroRcs"]).toBe("811 756 721");
    expect(vars["representant.nom"]).toBe("Charlie PIANCATELLI");
  });

  it("remplit les conditions commerciales", () => {
    expect(vars["engagement.duree"]).toBe("douze (12) mois");
    expect(vars["tarifPreferentiel.duree"]).toBe("deux (2) ans");
    expect(vars["integration.offerte"]).toBe(true);
    expect(vars["denonciation.preavis"]).toBe("un (1) mois");
    expect(vars.territoire).toBe("France");
  });

  it("laisse un trou visible quand une donnée manque", () => {
    const empty = buildContractVars({}, {});
    expect(empty["client.formeSociale"]).toBeNull();
    expect(empty["engagement.duree"]).toBeNull();
  });

  it("tarifs : les cinq profils, prix négocié remise déduite, sinon prix de base", () => {
    const rows = contractPriceRows(CLIENT);
    expect(rows.map((r) => r.profile)).toEqual([
      "Administrateur",
      "Conducteur de travaux",
      "Chef d'équipe",
      "Chef de chantier",
      "Compagnon",
    ]);
    expect(rows[0].unitPrice).toBe("27 € HT par mois et par utilisateur");
    expect(rows[4].unitPrice).toBe("5,60 € HT par mois et par utilisateur");
  });
});

describe("le modèle transcrit", () => {
  const vars = buildContractVars(CLIENT, SETTINGS);
  const known = new Set([...Object.keys(vars), "licences.tableau", "signatures"]);

  it("n'utilise que des variables connues", () => {
    for (const s of DEFAULT_CONTRACT_SECTIONS) {
      for (const m of s.body.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)) expect(known.has(m[1]), `${s.key}: ${m[1]}`).toBe(true);
      for (const m of s.body.matchAll(/\[\[si\s+([\w.]+)\]\]/g)) expect(known.has(m[1]), `${s.key}: ${m[1]}`).toBe(true);
    }
  });

  it("ferme chaque passage conditionnel", () => {
    for (const s of DEFAULT_CONTRACT_SECTIONS) {
      const opened = (s.body.match(/\[\[si /g) ?? []).length;
      const closed = (s.body.match(/\[\[\/si\]\]/g) ?? []).length;
      expect(opened, s.key).toBe(closed);
    }
  });

  it("reprend les 15 articles et les 5 annexes", () => {
    expect(DEFAULT_CONTRACT_SECTIONS.filter((s) => s.kind === "article")).toHaveLength(15);
    expect(DEFAULT_CONTRACT_SECTIONS.filter((s) => s.kind === "annexe")).toHaveLength(5);
  });
});
