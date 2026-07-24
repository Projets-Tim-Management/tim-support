import type { CollectionConfig } from "payload";

import { anyone, isAdmin } from "./access";
import { slugField } from "../fields/slug";

/**
 * Parcours d'apprentissage — CPT `parcours` + ACF (défini en code côté WP).
 *
 * Un parcours = une liste ORDONNÉE de features. La relation `hasMany` de
 * Payload préserve l'ordre saisi (comme le repeater ACF `features`).
 */
export const Parcours: CollectionConfig = {
  slug: "parcours",
  labels: { singular: "Parcours", plural: "Parcours" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "slug", "profil", "order", "_status"],
    group: "Éditorial",
  },
  access: { read: anyone, create: isAdmin, update: isAdmin, delete: isAdmin },
  versions: { drafts: true },
  fields: [
    { name: "title", type: "text", label: "Titre", required: true },
    slugField("title"),
    {
      name: "order",
      type: "number",
      label: "Ordre",
      defaultValue: 0,
      admin: {
        position: "sidebar",
        description: "Tri croissant (équivalent menu_order WP).",
      },
    },
    {
      name: "profil",
      type: "select",
      label: "Profil cible",
      options: [
        { label: "Admin", value: "admin" },
        { label: "Conducteur", value: "conducteur" },
        { label: "Chef de chantier", value: "chef-chantier" },
        { label: "Compagnon", value: "compagnon" },
      ],
      admin: { position: "sidebar" },
    },
    { name: "intro", type: "textarea", label: "Introduction" },
    {
      name: "steps",
      type: "relationship",
      relationTo: "features",
      hasMany: true,
      required: true,
      label: "Étapes (features ordonnées)",
      admin: {
        description: "L'ordre des features définit l'ordre des étapes.",
      },
    },
  ],
};
