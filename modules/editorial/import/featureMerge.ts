/**
 * Fusionner un JSON dans une feature EXISTANTE.
 *
 * Ce n'est pas un remplacement : seul ce que le JSON contient est écrasé. Le
 * reste de la fiche — et surtout ses VISUELS — survit. C'est ce qui permet de
 * sortir le JSON, le retravailler ailleurs, et le remettre sans repasser
 * derrière pour rattacher les GIF un par un.
 *
 * ⚠️ Aucune suppression. Un JSON qui contient trois parties là où la fiche en a
 * six en met trois à jour et laisse les trois autres intactes. Retirer une
 * partie se fait dans l'écran, à la main — une suppression déclenchée par ce
 * qui MANQUE dans un fichier est trop facile à provoquer par accident, et
 * emporterait des médias avec elle.
 */

/** Une partie telle que le JSON la porte. */
export type PartieEntrante = {
  titre?: unknown;
  description?: unknown;
  mediaPosition?: unknown;
};

/** Une partie telle qu'elle vit sur la fiche (le média y est attaché). */
export type PartieExistante = Record<string, unknown>;

const MEDIA_POS = new Set(["droite", "gauche"]);

const texte = (v: unknown): string | undefined =>
  typeof v === "string" && v.trim() !== "" ? v.trim() : undefined;

/** Le JSON déclare-t-il cette clé ? `null` compte comme « déclarée, vidée ». */
const declaree = (source: Record<string, unknown>, cle: string): boolean =>
  Object.prototype.hasOwnProperty.call(source, cle);

/**
 * Fusionne les parties, en PRÉSERVANT tout ce que le JSON ne connaît pas.
 *
 * Le rapprochement se fait par RANG, pas par titre : un titre corrigé est
 * précisément ce qu'on vient mettre à jour, s'y fier ferait perdre le lien avec
 * le média au moment où on en a le plus besoin. Le rang, lui, ne change pas
 * tant qu'on ne réordonne pas les parties dans l'écran.
 *
 * @param toRich conversion Markdown → texte riche, injectée (elle exige
 *               l'éditeur serveur ; la garder dehors rend ceci vérifiable).
 */
export function mergeParties(
  existantes: PartieExistante[],
  entrantes: PartieEntrante[],
  toRich: (markdown: string) => unknown,
): PartieExistante[] {
  const sortie = existantes.map((p) => ({ ...p }));

  entrantes.forEach((entrante, i) => {
    // Au-delà des parties existantes, on ajoute — sans média, il n'y en a pas.
    const base = sortie[i] ?? {};

    const titre = texte(entrante.titre);
    if (titre !== undefined) base.titleDoc = titre;

    const description = texte(entrante.description);
    if (description !== undefined) base.descriptionDoc = toRich(description);

    const position = texte(entrante.mediaPosition);
    if (position !== undefined && MEDIA_POS.has(position)) base.mediaPosition = position;

    // `mediaDoc` n'est jamais touché : c'est lui qui porte les GIF.
    sortie[i] = base;
  });

  return sortie;
}

/** Ce qu'on transmet à `payload.update` : uniquement les champs déclarés. */
export type PatchFeature = Record<string, unknown>;

/**
 * Construit la mise à jour à partir du JSON reçu.
 *
 * @param existant   la fiche actuelle (pour ses parties et leurs médias)
 * @param json       le JSON collé par l'utilisateur
 * @param toRich     conversion Markdown → texte riche
 * @param availabilityValide valeurs acceptées par le champ « disponibilité »
 */
export function mergeFeatureFromJson(
  existant: { doc?: unknown },
  json: Record<string, unknown>,
  toRich: (markdown: string) => unknown,
  availabilityValide: ReadonlySet<string>,
): PatchFeature {
  const patch: PatchFeature = {};

  if (declaree(json, "title")) {
    const v = texte(json.title);
    // Un titre vide n'efface pas le titre : le champ est obligatoire, et une
    // fiche sans nom serait introuvable.
    if (v !== undefined) patch.title = v;
  }
  // Celui-ci accepte le vide : « vide = identique au titre » est la convention
  // de l'import, et c'est ce que l'export produit.
  if (declaree(json, "titleFeature")) patch.titleFeature = texte(json.titleFeature) ?? "";
  if (declaree(json, "shortDescription")) {
    patch.shortDescription = texte(json.shortDescription) ?? "";
  }
  if (declaree(json, "keywords") && Array.isArray(json.keywords)) {
    patch.keywords = json.keywords.filter(
      (k): k is string => typeof k === "string" && k.trim() !== "",
    );
  }
  if (declaree(json, "availability")) {
    const v = texte(json.availability);
    if (v && availabilityValide.has(v)) patch.availability = v;
  }
  if (declaree(json, "intro") || declaree(json, "content")) {
    const md = texte(json.intro ?? json.content);
    patch.content = md === undefined ? null : toRich(md);
  }
  if (declaree(json, "parties") && Array.isArray(json.parties)) {
    const existantes = Array.isArray(existant.doc) ? (existant.doc as PartieExistante[]) : [];
    const entrantes = json.parties.filter(
      (p): p is PartieEntrante => Boolean(p) && typeof p === "object",
    );
    patch.doc = mergeParties(existantes, entrantes, toRich);
  }

  return patch;
}
