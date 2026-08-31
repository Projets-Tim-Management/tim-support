import { describe, expect, it } from "vitest";

import {
  featureExportFilename,
  featureExportText,
  featureToImportJson,
} from "@/modules/editorial/import/featureExport";
import { FEATURE_IMPORT_TEMPLATE } from "@/modules/editorial/import/featureTemplate";

/**
 * Ce qui sort de l'export doit pouvoir rentrer par l'import.
 *
 * C'est la seule propriété qui compte : un JSON exporté se recolle dans la
 * boîte d'import sans retouche. Sinon l'export n'est qu'un affichage, et le
 * cas d'usage — reprendre une fiche pour la décliner ou la faire relire —
 * tombe à l'eau sans que rien ne le signale.
 */

/** Conversion Lexical → Markdown, simulée : la vraie exige l'éditeur serveur. */
const md = (rich: unknown) => (typeof rich === "string" ? rich : "");

const source = {
  title: "Consulter les chiffres d'un chantier",
  titleFeature: "",
  shortDescription: "L'onglet Chiffres centralise le suivi budgétaire.",
  keywords: ["chiffres chantier", "budget chantier"],
  availability: "disponible",
  content: "L'onglet **Chiffres** offre une vue de pilotage.",
  doc: [
    { titleDoc: "Suivre le budget", descriptionDoc: "→ **Initial** : enveloppe.", mediaPosition: "gauche" },
    { titleDoc: "Suivre les heures", descriptionDoc: "→ **Prévues** : 20 000 h.", mediaPosition: "droite" },
  ],
};

describe("format de l'export", () => {
  it("porte exactement les clés du modèle d'import, dans le même ordre", () => {
    // L'ordre compte : il rend comparables un export et le modèle, et deux
    // exports entre eux. Un ordre qui dérive rend tout diff illisible.
    const sortie = featureToImportJson(source, md);
    expect(Object.keys(sortie)).toEqual(Object.keys(FEATURE_IMPORT_TEMPLATE));
  });

  it("donne aux parties les clés que l'import lit", () => {
    const partie = featureToImportJson(source, md).parties[0];
    expect(Object.keys(partie)).toEqual(Object.keys(FEATURE_IMPORT_TEMPLATE.parties[0]));
  });

  it("restitue le contenu, converti en Markdown", () => {
    const s = featureToImportJson(source, md);
    expect(s.title).toBe("Consulter les chiffres d'un chantier");
    expect(s.intro).toBe("L'onglet **Chiffres** offre une vue de pilotage.");
    expect(s.keywords).toEqual(["chiffres chantier", "budget chantier"]);
    expect(s.parties).toHaveLength(2);
    expect(s.parties[0]).toEqual({
      titre: "Suivre le budget",
      description: "→ **Initial** : enveloppe.",
      mediaPosition: "gauche",
    });
  });
});

describe("conventions reprises de l'import", () => {
  it("vide titleFeature quand il répète le titre", () => {
    // La convention de l'import : vide = identique au titre. Le rédacteur qui
    // relit le JSON doit retrouver ce qu'il aurait écrit lui-même.
    const s = featureToImportJson({ ...source, titleFeature: source.title }, md);
    expect(s.titleFeature).toBe("");
  });

  it("le garde quand il diffère vraiment", () => {
    const s = featureToImportJson({ ...source, titleFeature: "Les chiffres" }, md);
    expect(s.titleFeature).toBe("Les chiffres");
  });

  it("retombe sur les valeurs par défaut de l'import", () => {
    const s = featureToImportJson({ title: "X", doc: [{ titleDoc: "Y" }] }, md);
    expect(s.availability).toBe("disponible");
    expect(s.parties[0].mediaPosition).toBe("droite");
  });
});

describe("robustesse", () => {
  it("survit à une fiche vide sans rien inventer", () => {
    const s = featureToImportJson({}, md);
    expect(s).toEqual({
      title: "",
      titleFeature: "",
      shortDescription: "",
      keywords: [],
      availability: "disponible",
      intro: "",
      parties: [],
    });
  });

  it("écarte les mots-clés vides et les parties illisibles", () => {
    const s = featureToImportJson(
      { ...source, keywords: ["ok", "", "   ", 42], doc: [null, "texte", { titleDoc: "Z" }] } as never,
      md,
    );
    expect(s.keywords).toEqual(["ok"]);
    expect(s.parties).toHaveLength(1);
  });

  it("rend un JSON relisible, indenté", () => {
    const texte = featureExportText(featureToImportJson(source, md));
    expect(() => JSON.parse(texte)).not.toThrow();
    expect(texte).toContain('\n  "title"');
  });
});

describe("nom du fichier téléchargé", () => {
  it("dérive du titre, sans accent ni espace", () => {
    expect(featureExportFilename("Consulter les chiffres d'un chantier")).toBe(
      "consulter-les-chiffres-d-un-chantier.json",
    );
    expect(featureExportFilename("Accéder à l'Administration")).toBe(
      "acceder-a-l-administration.json",
    );
  });

  it("ne produit jamais un fichier sans nom", () => {
    for (const titre of ["", "   ", "!!!", "—"]) {
      expect(featureExportFilename(titre), JSON.stringify(titre)).toBe("feature.json");
    }
  });
});
