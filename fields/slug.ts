import type { Field } from "payload";

// Regex hissées au niveau module : compilées une seule fois, pas à chaque
// appel. Sûres avec .replace() (qui réinitialise lastIndex malgré le flag /g).
const DIACRITICS = /[̀-ͯ]/g; // marques diacritiques (é → e, ç → c…)
const NON_SLUG = /[^a-z0-9]+/g;
const EDGE_DASHES = /(^-|-$)+/g;

/** Transforme un texte en slug URL (gère les accents français). */
const slugify = (val: string): string =>
  val
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(DIACRITICS, "")
    .replace(NON_SLUG, "-")
    .replace(EDGE_DASHES, "");

/**
 * Champ `slug` réutilisable, placé dans la barre latérale.
 *
 * - Se génère automatiquement depuis le champ `source` (titre) s'il est laissé
 *   vide — pratique pour les rédacteurs non techniques.
 * - Reste modifiable à la main (on re-slugifie la saisie pour rester propre).
 * - Unique et indexé (recherche par slug côté front).
 */
export const slugField = (source = "title"): Field => ({
  name: "slug",
  type: "text",
  required: true,
  unique: true, // crée déjà un index unique — pas besoin de `index: true`
  admin: {
    position: "sidebar",
    description: "Laisser vide pour générer automatiquement depuis le titre.",
  },
  hooks: {
    beforeValidate: [
      ({ value, data }) => {
        if (typeof value === "string" && value.length > 0) return slugify(value);
        const src = data?.[source];
        return typeof src === "string" ? slugify(src) : value;
      },
    ],
  },
});
