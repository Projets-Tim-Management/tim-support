import type { CollectionConfig } from "payload";

import { editorialAccess } from "@/core/access";
import { slugField } from "@/core/fields/slug";
import {
  computePathAfterRead,
  computePathBeforeChange,
  computeSortKeyBeforeChange,
} from "./categoryPath";

/**
 * Catégories de features (taxonomie hiérarchique `feature_category`).
 *
 * Titre = `pathTitle` (chemin hiérarchique complet, ex. « Web › Planning ›
 * Congés ») plutôt que le seul `name` : dans le sélecteur de catégories d'une
 * feature, on voit ainsi la plateforme racine (Web / Mobile) et l'arborescence.
 */
export const FeatureCategories: CollectionConfig = {
  slug: "feature-categories",
  labels: { singular: "Catégorie de feature", plural: "Catégories de features" },
  admin: {
    useAsTitle: "pathTitle",
    defaultColumns: ["name", "parent", "slug"],
    group: "Éditorial",
  },
  // Tri par plateforme puis chemin → dans le sélecteur d'une feature et dans la
  // liste : toutes les catégories Web d'abord, puis toutes les Mobile. Lu par le
  // champ relation via `collection.defaultSort` (propriété racine, pas `admin`).
  defaultSort: "sortKey",
  access: editorialAccess,
  fields: [
    { name: "name", type: "text", label: "Nom", required: true },
    slugField("name"),
    { name: "description", type: "textarea", label: "Description" },
    {
      name: "parent",
      type: "relationship",
      relationTo: "feature-categories",
      label: "Catégorie parente",
      admin: {
        position: "sidebar",
        description: "Laisser vide pour une catégorie racine (= plateforme : Web / Mobile).",
      },
    },
    // Chemin hiérarchique calculé (plateforme › … › catégorie). Sert de titre.
    {
      name: "pathTitle",
      type: "text",
      label: "Chemin",
      admin: {
        position: "sidebar",
        readOnly: true,
        description: "Emplacement dans l'arborescence. Calculé automatiquement.",
      },
      hooks: {
        afterRead: [computePathAfterRead],
        beforeChange: [computePathBeforeChange],
      },
    },
    // Clé de tri « <rang plateforme> <chemin> » (Web avant Mobile). Cachée :
    // sert uniquement au tri (admin.defaultSort). Calculée automatiquement.
    {
      name: "sortKey",
      type: "text",
      admin: { hidden: true },
      hooks: {
        beforeChange: [computeSortKeyBeforeChange],
      },
    },
  ],
};
