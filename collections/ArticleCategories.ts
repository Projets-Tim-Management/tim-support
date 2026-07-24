import type { CollectionConfig } from "payload";

import { editorialAccess } from "./access";
import { slugField } from "../fields/slug";

/**
 * Catégories d'articles (hiérarchiques).
 * Équivalent des `WPCategory` du cœur WordPress.
 */
export const ArticleCategories: CollectionConfig = {
  slug: "article-categories",
  labels: { singular: "Catégorie d'article", plural: "Catégories d'articles" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "slug", "parent"],
    group: "Éditorial",
  },
  access: editorialAccess,
  fields: [
    { name: "name", type: "text", label: "Nom", required: true },
    slugField("name"),
    { name: "description", type: "textarea", label: "Description" },
    {
      name: "parent",
      type: "relationship",
      relationTo: "article-categories",
      label: "Catégorie parente",
      admin: { position: "sidebar" },
    },
  ],
};
