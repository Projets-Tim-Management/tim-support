import type { CollectionConfig } from "payload";

import { adminOnly } from "./access";
import { slugField } from "../fields/slug";

/**
 * Récompenses — catalogue de lots échangeables contre des points
 * (CPT `reward` côté WP).
 */
export const Rewards: CollectionConfig = {
  slug: "rewards",
  labels: { singular: "Récompense", plural: "Récompenses" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "cost", "stock"],
    group: "Partenaires",
  },
  access: adminOnly,
  fields: [
    { name: "title", type: "text", label: "Titre", required: true },
    slugField("title"),
    { name: "description", type: "richText", label: "Description" },
    {
      name: "image",
      type: "upload",
      relationTo: "media",
      label: "Visuel",
      admin: { position: "sidebar" },
    },
    {
      name: "cost",
      type: "number",
      label: "Coût (points)",
      required: true,
      min: 0,
    },
    {
      name: "stock",
      type: "number",
      label: "Stock",
      defaultValue: -1,
      admin: {
        position: "sidebar",
        description: "-1 = illimité, 0 = épuisé (masqué du catalogue).",
      },
    },
  ],
};
