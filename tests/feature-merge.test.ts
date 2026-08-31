import { describe, expect, it } from "vitest";

import { mergeFeatureFromJson, mergeParties } from "@/modules/editorial/import/featureMerge";

/**
 * Remettre un JSON dans une fiche EXISTANTE sans rien perdre.
 *
 * L'enjeu tient en une phrase : les GIF de démonstration sont attachés aux
 * parties, et ils ne figurent pas dans le JSON. Une fusion naïve — remplacer le
 * tableau des parties — les effacerait toutes, silencieusement, au moment même
 * où l'on croit ne corriger qu'un texte. Il faudrait ensuite les rattacher une
 * par une, en devinant lequel allait où.
 *
 * D'où deux règles : on ne touche qu'aux clés que le JSON déclare, et on ne
 * supprime jamais.
 */

/** Conversion Markdown → texte riche, simulée. */
const toRich = (md: string) => ({ md });
const AVAILABILITY = new Set(["disponible", "beta", "prochainement"]);

const fiche = () => ({
  doc: [
    { titleDoc: "Budget", descriptionDoc: { md: "ancien budget" }, mediaPosition: "gauche", mediaDoc: [{ blockType: "img", image: 42 }] },
    { titleDoc: "Heures", descriptionDoc: { md: "ancien heures" }, mediaPosition: "droite", mediaDoc: [{ blockType: "img", image: 43 }] },
    { titleDoc: "Factures", descriptionDoc: { md: "ancien factures" }, mediaPosition: "droite", mediaDoc: [{ blockType: "img", image: 44 }] },
  ],
});

describe("les visuels survivent à la fusion", () => {
  it("garde le média de chaque partie mise à jour", () => {
    // LE test. Sans lui, on efface des GIF de 20 Mo en corrigeant une faute.
    const out = mergeParties(fiche().doc, [{ titre: "Budget global", description: "nouveau" }], toRich);
    expect(out[0].mediaDoc).toEqual([{ blockType: "img", image: 42 }]);
    expect(out[0].titleDoc).toBe("Budget global");
    expect(out[0].descriptionDoc).toEqual({ md: "nouveau" });
  });

  it("laisse intactes les parties que le JSON ne mentionne pas", () => {
    // Trois parties en base, une seule dans le JSON : les deux autres restent.
    const out = mergeParties(fiche().doc, [{ titre: "Budget global" }], toRich);
    expect(out).toHaveLength(3);
    expect(out[1].titleDoc).toBe("Heures");
    expect(out[2].mediaDoc).toEqual([{ blockType: "img", image: 44 }]);
  });

  it("ne supprime JAMAIS, même sur un JSON aux parties vides", () => {
    const out = mergeParties(fiche().doc, [], toRich);
    expect(out).toHaveLength(3);
  });

  it("ajoute les parties en trop, sans média", () => {
    const out = mergeParties(fiche().doc, [{}, {}, {}, { titre: "Nouvelle" }], toRich);
    expect(out).toHaveLength(4);
    expect(out[3].titleDoc).toBe("Nouvelle");
    expect(out[3].mediaDoc).toBeUndefined();
  });

  it("rapproche par RANG, pas par titre", () => {
    // Un titre corrigé est précisément ce qu'on vient mettre à jour : s'y fier
    // ferait perdre le lien avec le média au pire moment.
    const out = mergeParties(fiche().doc, [{ titre: "Tout autre chose" }], toRich);
    expect(out[0].mediaDoc).toEqual([{ blockType: "img", image: 42 }]);
  });

  it("ignore une position de média fantaisiste plutôt que de l'écrire", () => {
    const out = mergeParties(fiche().doc, [{ mediaPosition: "au-milieu" }], toRich);
    expect(out[0].mediaPosition).toBe("gauche");
  });

  it("ne modifie pas la fiche d'origine", () => {
    const source = fiche();
    mergeParties(source.doc, [{ titre: "X" }], toRich);
    expect(source.doc[0].titleDoc).toBe("Budget");
  });
});

describe("seules les clés déclarées sont écrasées", () => {
  it("ne touche à rien d'autre que ce que le JSON contient", () => {
    const patch = mergeFeatureFromJson(fiche(), { shortDescription: "Nouveau résumé" }, toRich, AVAILABILITY);
    expect(Object.keys(patch)).toEqual(["shortDescription"]);
  });

  it("reprend chaque champ quand il est présent", () => {
    const patch = mergeFeatureFromJson(
      fiche(),
      {
        title: "Nouveau titre",
        titleFeature: "Affiché",
        shortDescription: "Résumé",
        keywords: ["a", "", "b"],
        availability: "beta",
        intro: "**Intro**",
        parties: [{ titre: "T" }],
      },
      toRich,
      AVAILABILITY,
    );
    expect(patch.title).toBe("Nouveau titre");
    expect(patch.titleFeature).toBe("Affiché");
    expect(patch.keywords).toEqual(["a", "b"]);
    expect(patch.availability).toBe("beta");
    expect(patch.content).toEqual({ md: "**Intro**" });
    expect((patch.doc as unknown[])).toHaveLength(3);
  });

  it("refuse d'effacer le titre, qui est obligatoire", () => {
    // Une fiche sans nom serait introuvable dans la liste.
    const patch = mergeFeatureFromJson(fiche(), { title: "   " }, toRich, AVAILABILITY);
    expect(patch).not.toHaveProperty("title");
  });

  it("accepte en revanche de vider titleFeature — c'est sa convention", () => {
    const patch = mergeFeatureFromJson(fiche(), { titleFeature: "" }, toRich, AVAILABILITY);
    expect(patch.titleFeature).toBe("");
  });

  it("écarte une disponibilité hors des valeurs permises", () => {
    const patch = mergeFeatureFromJson(fiche(), { availability: "peut-être" }, toRich, AVAILABILITY);
    expect(patch).not.toHaveProperty("availability");
  });

  it("accepte l'ancienne clé « content » comme « intro »", () => {
    const patch = mergeFeatureFromJson(fiche(), { content: "texte" }, toRich, AVAILABILITY);
    expect(patch.content).toEqual({ md: "texte" });
  });

  it("ne bronche pas sur un JSON vide", () => {
    expect(mergeFeatureFromJson(fiche(), {}, toRich, AVAILABILITY)).toEqual({});
  });
});
