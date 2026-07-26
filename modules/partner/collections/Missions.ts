import type { CollectionConfig } from "payload";

import { adminOnly } from "@/core/access";

/**
 * Missions — actions rémunérées en points (CPT `mission` côté WP).
 *
 * - `preuve`  : le partenaire envoie une capture → validation admin → crédit auto.
 * - `manuelle`: suivi lead / code partenaire → points attribués à la main.
 */
export const Missions: CollectionConfig = {
  slug: "missions",
  labels: { singular: "Mission", plural: "Missions" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "type", "points", "order"],
    group: "Missions",
  },
  access: adminOnly,
  fields: [
    { name: "title", type: "text", label: "Titre", required: true },
    { name: "instructions", type: "richText", label: "Instructions" },
    {
      name: "logo",
      type: "upload",
      relationTo: "media",
      label: "Logo",
      admin: { position: "sidebar" },
    },
    {
      name: "points",
      type: "number",
      label: "Points gagnés",
      defaultValue: 0,
      min: 0,
    },
    {
      name: "type",
      type: "select",
      label: "Type de validation",
      defaultValue: "preuve",
      options: [
        { label: "Sur preuve (capture)", value: "preuve" },
        { label: "Manuelle (lead / code)", value: "manuelle" },
      ],
    },
    {
      name: "url",
      type: "text",
      label: "Lien",
      admin: { description: "Optionnel (ex : page d'avis)." },
    },
    {
      name: "order",
      type: "number",
      label: "Ordre",
      defaultValue: 0,
      index: true,
      admin: { position: "sidebar" },
    },
    {
      name: "repeatable",
      type: "checkbox",
      label: "Répétable",
      defaultValue: false,
      admin: {
        position: "sidebar",
        description: "Décoché = validable une seule fois par partenaire.",
      },
    },
  ],
};
