import { describe, expect, it } from "vitest";

import { coerceCell, parseClipboard, parseDateText } from "@/modules/marketing/lib/portal-paste";
import { PORTAL_SECTIONS } from "@/modules/marketing/lib/portal-sections";

/**
 * Collage depuis un tableur.
 *
 * Ces informations existent chez le client dans un Excel : si le collage ne
 * marche pas, on a supprimé le fichier à importer sans supprimer la corvée.
 */

describe("découpage du presse-papiers", () => {
  it("tabulations en colonnes, retours en lignes", () => {
    expect(parseClipboard("a\tb\nc\td")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("le retour final d'un tableur ne crée pas de ligne vide", () => {
    expect(parseClipboard("a\tb\r\nc\td\r\n")).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("une seule cellule reste une seule cellule", () => {
    expect(parseClipboard("Piancatelli")).toEqual([["Piancatelli"]]);
  });
});

describe("dates collées", () => {
  it("le format français, sous ses séparateurs habituels", () => {
    for (const s of ["12/03/1985", "12-03-1985", "12.03.1985", "12 03 1985"]) {
      expect(parseDateText(s), s).toBe("1985-03-12");
    }
  });

  it("un seul chiffre pour le jour ou le mois", () => {
    expect(parseDateText("2/3/1985")).toBe("1985-03-12".replace("12", "02"));
  });

  it("deux chiffres d'année : 85 est 1985, 24 est 2024", () => {
    expect(parseDateText("12/03/85")).toBe("1985-03-12");
    expect(parseDateText("12/03/24")).toBe("2024-03-12");
  });

  it("l'ISO passe tel quel, y compris avec une heure", () => {
    expect(parseDateText("1985-03-12")).toBe("1985-03-12");
    expect(parseDateText("1985-03-12T09:00:00.000Z")).toBe("1985-03-12");
  });

  it("le jour vient en premier : 03/12 est le 3 décembre, pas le 12 mars", () => {
    expect(parseDateText("03/12/1985")).toBe("1985-12-03");
  });

  it("une date qui n'existe pas est refusée plutôt que rattrapée", () => {
    expect(parseDateText("31/02/1985")).toBeNull();
    expect(parseDateText("12/13/1985")).toBeNull();
    expect(parseDateText("bientôt")).toBeNull();
    expect(parseDateText("")).toBeNull();
  });
});

describe("conversion vers le type du champ", () => {
  const salaries = PORTAL_SECTIONS.find((s) => s.key === "salaries")!;
  const vehicules = PORTAL_SECTIONS.find((s) => s.key === "vehicules")!;
  const field = (section: typeof salaries, name: string) =>
    section.fields.find((f) => f.name === name)!;

  it("une liste accepte l'INTITULÉ autant que la clé", () => {
    const contrat = field(salaries, "contractType");
    expect(coerceCell(contrat, "CDI")).toBe("cdi");
    expect(coerceCell(contrat, "cdi")).toBe("cdi");
    expect(coerceCell(contrat, "Contrat inconnu")).toBe("");
  });

  it("un nombre supporte la virgule et les espaces", () => {
    const annee = field(vehicules, "year");
    expect(coerceCell(annee, "2019")).toBe(2019);
    expect(coerceCell(annee, " 2 019 ")).toBe(2019);
  });

  it("un choix multiple se sépare par virgule ou point-virgule", () => {
    const permis = field(vehicules, "licenseTypes");
    const out = coerceCell(permis, `${permis.options![0].label}; ${permis.options![1].label}`);
    expect(out).toEqual([permis.options![0].value, permis.options![1].value]);
  });

  it("une date collée devient une date, pas du texte", () => {
    const assurance = field(vehicules, "insuranceDate");
    expect(coerceCell(assurance, "01/09/2026")).toBe("2026-09-01");
    expect(coerceCell(assurance, "n'importe quoi")).toBe("");
  });
});

describe("aller-retour saisie ↔ affichage d'une date", () => {
  it("ce qui est affiché se recolle à l'identique", () => {
    // La grille montre « 12/03/1985 » ; copier cette case et la recoller
    // ailleurs doit redonner exactement la même date.
    const affiche = "12/03/1985";
    expect(parseDateText(affiche)).toBe("1985-03-12");
  });

  it("une date incomplète en cours de frappe n'est pas une date", () => {
    for (const partiel of ["1", "12", "12/", "12/0", "12/03/"]) {
      expect(parseDateText(partiel), partiel).toBeNull();
    }
  });

  it("« 12/03/19 » est une année sur deux chiffres, pas une frappe inachevée", () => {
    // C'est la règle voulue et elle est levée à la SORTIE de la ligne, jamais
    // pendant la frappe : le tampon de saisie garde le texte brut d'ici là.
    expect(parseDateText("12/03/19")).toBe("2019-03-12");
  });
});
