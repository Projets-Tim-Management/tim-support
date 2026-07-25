import type { CollectionConfig } from "payload";

import { editorialAccess } from "./access";
import { slugField } from "../fields/slug";

/**
 * Articles du centre d'aide.
 * Équivalent des posts WordPress natifs (WPPost / ArticleFull).
 *
 * `versions.drafts` active brouillon/publication — la lecture publique ne
 * renvoie que les versions publiées.
 */
export const Articles: CollectionConfig = {
  slug: "articles",
  labels: { singular: "Article", plural: "Articles" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "publishedAt", "_status"],
    group: "Éditorial",
  },
  access: editorialAccess,
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", label: "Titre", required: true },
    slugField("title"),
    {
      name: "excerpt",
      type: "textarea",
      label: "Extrait",
      admin: { description: "Résumé court affiché dans les listes." },
    },
    { name: "content", type: "richText", label: "Contenu" },
    {
      name: "categories",
      type: "relationship",
      relationTo: "article-categories",
      hasMany: true,
      label: "Catégories",
      admin: { position: "sidebar" },
    },
    {
      name: "featuredImage",
      type: "upload",
      relationTo: "media",
      label: "Image à la une",
      admin: { position: "sidebar" },
    },
    {
      name: "publishedAt",
      type: "date",
      label: "Date de publication",
      index: true, // trié/filtré sur les listes publiques
      admin: { position: "sidebar" },
    },
    {
      name: "seo",
      type: "group",
      label: "SEO",
      fields: [
        { name: "title", type: "text", label: "Titre SEO" },
        { name: "description", type: "textarea", label: "Description SEO" },
      ],
    },
  ],
};
