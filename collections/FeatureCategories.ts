import type { CollectionConfig } from "payload";

import { anyone, isAdmin } from "./access";
import { slugField } from "../fields/slug";

/**
 * Catégories de features (taxonomie hiérarchique `feature_category`).
 */
export const FeatureCategories: CollectionConfig = {
  slug: "feature-categories",
  labels: { singular: "Catégorie de feature", plural: "Catégories de features" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "parent"],
    group: "Éditorial",
  },
  access: { read: anyone, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    { name: "name", type: "text", label: "Nom", required: true },
    slugField("name"),
    {
      name: "parent",
      type: "relationship",
      relationTo: "feature-categories",
      label: "Catégorie parente",
      admin: { position: "sidebar" },
    },
  ],
};
