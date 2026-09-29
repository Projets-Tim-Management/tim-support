/**
 * Un nom de fichier lisible et sûr : sans accents, minuscules, tirets.
 *
 * Une seule définition pour le support : les documents du contrat
 * (`fileSlug`, e-signature) et les créas publicitaires. `max` borne la longueur
 * — un angle publicitaire fait une phrase, un nom de fichier ne doit pas.
 */
export const slugify = (name: string, opts: { max?: number; fallback?: string } = {}): string => {
  const s = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\w]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const cut = opts.max ? s.slice(0, opts.max).replace(/-$/, "") : s;
  return cut || (opts.fallback ?? "x");
};
