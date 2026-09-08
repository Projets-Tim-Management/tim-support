import { makeHierarchyPathHooks } from "@/core/fields/hierarchyPath";

/**
 * Chemin hiérarchique d'une catégorie de feature (« Web › Planning › Congés »).
 *
 * Le calcul lui-même vit dans `core/fields/hierarchyPath` : il est partagé avec
 * les chantiers de développement, qui ont la même arborescence auto-référencée.
 * Ne reste ici que ce qui est PROPRE aux catégories — le classement par
 * plateforme.
 */

/** Rang de plateforme (racine du chemin) → Web d'abord, puis Mobile, puis reste. */
const platformRank = (path: string): string => {
  const root = (path.split("›")[0] || "").trim().toLowerCase();
  if (root === "web") return "1";
  if (root === "mobile") return "2";
  return "3";
};

const hooks = makeHierarchyPathHooks("feature-categories", platformRank);

export const computePathAfterRead = hooks.pathAfterRead;
export const computePathBeforeChange = hooks.pathBeforeChange;

/**
 * Clé de tri stockée : « <rang plateforme> <chemin en minuscules> ».
 * Trié en ascendant → toutes les catégories Web, puis toutes les Mobile, et à
 * l'intérieur de chaque plateforme par ordre alphabétique du chemin.
 */
export const computeSortKeyBeforeChange = hooks.sortKeyBeforeChange;
