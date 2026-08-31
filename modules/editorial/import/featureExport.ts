/**
 * Une feature, rendue dans le format que l'IMPORT sait relire.
 *
 * Le miroir exact de featureTemplate + importFeatureHandler : ce qui sort ici
 * doit pouvoir être recollé dans la boîte d'import sans retouche. C'est ce qui
 * permet de reprendre une fiche existante — la faire relire, la décliner pour
 * une fonctionnalité voisine, la corriger en masse — au lieu de la réécrire.
 *
 * La CONVERSION du texte riche est injectée plutôt qu'importée : elle exige la
 * configuration de l'éditeur, qui n'existe que côté serveur. Cette fonction
 * reste ainsi pure, donc vérifiable.
 */

/** Une partie, dans la forme attendue par l'import. */
export type PartieExportee = {
  titre: string;
  description: string;
  mediaPosition: string;
};

/** Une feature entière, dans la forme attendue par l'import. */
export type FeatureExportee = {
  title: string;
  titleFeature: string;
  shortDescription: string;
  keywords: string[];
  availability: string;
  intro: string;
  parties: PartieExportee[];
};

/** Ce qu'on lit sur le document Payload — seuls les champs qui ressortent. */
export type FeatureSource = {
  title?: unknown;
  titleFeature?: unknown;
  shortDescription?: unknown;
  keywords?: unknown;
  availability?: unknown;
  content?: unknown;
  doc?: unknown;
};

const texte = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * @param toMarkdown convertit un état Lexical en Markdown. Rend "" si le champ
 *                   est vide ou si la conversion échoue — un export amputé d'un
 *                   paragraphe reste utilisable, une exception ne l'est pas.
 */
export function featureToImportJson(
  doc: FeatureSource,
  toMarkdown: (rich: unknown) => string,
): FeatureExportee {
  const title = texte(doc.title);
  const titleFeature = texte(doc.titleFeature);

  const parties = (Array.isArray(doc.doc) ? doc.doc : [])
    .filter((p): p is Record<string, unknown> => Boolean(p) && typeof p === "object")
    .map((p) => ({
      titre: texte(p.titleDoc),
      description: toMarkdown(p.descriptionDoc),
      mediaPosition: texte(p.mediaPosition) || "droite",
    }));

  /**
   * L'ORDRE des clés reprend celui du modèle.
   *
   * `JSON.stringify` respecte l'ordre d'insertion : un export et le modèle se
   * comparent alors ligne à ligne, et deux exports de features différentes
   * aussi. Un ordre qui dériverait rendrait tout diff illisible.
   */
  return {
    title,
    // Vide quand il répète le titre — c'est la convention que l'import attend,
    // et ce que le rédacteur doit retrouver s'il repasse le JSON en revue.
    titleFeature: titleFeature && titleFeature !== title ? titleFeature : "",
    shortDescription: texte(doc.shortDescription),
    keywords: Array.isArray(doc.keywords)
      ? doc.keywords.filter((k): k is string => typeof k === "string" && k.trim() !== "")
      : [],
    availability: texte(doc.availability) || "disponible",
    intro: toMarkdown(doc.content),
    parties,
  };
}

/** Le JSON tel qu'il est remis : indenté, prêt à être relu et recollé. */
export const featureExportText = (feature: FeatureExportee): string =>
  JSON.stringify(feature, null, 2);

/**
 * Nom de fichier proposé au téléchargement, dérivé du titre.
 * Sans nom exploitable, un repli neutre plutôt qu'un fichier appelé « .json ».
 */
export const featureExportFilename = (title: string): string => {
  const base = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return `${base || "feature"}.json`;
};
