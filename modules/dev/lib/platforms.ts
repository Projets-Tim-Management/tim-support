/**
 * Reconnaître une plateforme à son nom, pour l'afficher d'un signe.
 *
 * Les plateformes sont du contenu (collection `platforms`, partagée avec la
 * documentation) : leurs libellés peuvent être renommés sans prévenir le code.
 * On les reconnaît donc sur ce qu'ils CONTIENNENT — « Web », « Application
 * mobile », « Mobile iOS » —, et tout ce qui échappe à la règle garde un signe
 * neutre plutôt que de disparaître de la carte.
 */
export type PlatformKind = "web" | "mobile" | "other";

export const platformKind = (name: string): PlatformKind => {
  const value = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  if (/\bweb\b|navigateur|desktop|bureau/.test(value)) return "web";
  if (/mobil|smartphone|ios|android|tablette/.test(value)) return "mobile";
  return "other";
};
