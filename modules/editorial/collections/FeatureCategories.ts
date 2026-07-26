import type { CollectionConfig } from "payload";

import { editorialAccess } from "@/core/access";
import { slugField } from "@/core/fields/slug";

/**
 * Catégories de features (taxonomie hiérarchique `feature_category`).
 */
export const FeatureCategories: CollectionConfig = {
  slug: "feature-categories",
  labels: { singular: "Catégorie de feature", plural: "Catégories de features" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "parent"],
    group: "Features",
  },
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
      admin: { position: "sidebar" },
    },
  ],
};
