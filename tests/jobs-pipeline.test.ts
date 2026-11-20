import { describe, expect, it } from "vitest";

import { mergeFigures, numberForms, replaceFigures } from "@/modules/editorial/lib/jobs/pipeline";
import { byFieldKey } from "@/modules/editorial/lib/jobs/write";

describe("fiches métier : écrire par les clés des champs en conflit", () => {
  it("certifications et FAQ passent par leur clé, le reste par son nom", () => {
    expect(byFieldKey({ certifications: { items: [] }, faq: { items: [] }, definition: "x" })).toEqual({ field_fm_cert: { items: [] }, field_fm_faq: { items: [] }, definition: "x" });
  });
});

describe("rafraîchissement annuel : les chiffres cités dans les textes", () => {
  it("toutes les écritures d'un nombre", () => {
    expect(numberForms(2189)).toEqual(["2 189", "2 189", "2 189", "2189"]);
  });
  it("remplace l'ancien chiffre par le nouveau, avec le même séparateur", () => {
    const r = replaceFigures("Salaire médian de 2 189 € ; 2189 offres ; 12 mois", [
      [2189, 2310],
      [12, 12],
    ]);
    expect(r).toEqual({ text: "Salaire médian de 2 310 € ; 2310 offres ; 12 mois", stale: [] });
  });
  it("ne touche pas un nombre qui en contient un autre", () => {
    expect(replaceFigures("21890 et 2,189", [[2189, 2310]]).text).toBe("21890 et 2,189");
  });
  it("un chiffre absent des nouvelles données garde sa valeur (signalé)", () => {
    expect(mergeFigures({ salaire_median: 2189, offres_12m: 540, date_donnees: "2026-10" }, { salaire_median: 2310, offres_12m: null })).toEqual({ figures: { salaire_median: 2310, offres_12m: 540, date_donnees: "2026-10" }, kept: ["offres_12m"] });
  });
});
