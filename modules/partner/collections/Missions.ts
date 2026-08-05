import type { CollectionConfig } from "payload";

import { canReadCatalog, catalogAccess } from "@/core/access";

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
    group: "Partenaires",
    components: {
      // Catalogue pour le partenaire-utilisateur (l'admin garde le tableau).
      beforeListTable: ["/modules/partner/admin/MissionsCatalog#default"],
    },
  },
  // Catalogue : lecture admins + partenaires-utilisateurs, écriture admins.
  access: catalogAccess(canReadCatalog),
  fields: [
    { name: "title", type: "text", label: "Titre", required: true },
    { name: "instructions", type: "richText", label: "Instructions" },
    /**
     * Étapes de réalisation — guident le partenaire pas à pas dans le drawer
     * « Réaliser » (1, 2, 3… puis l'envoi de la preuve). Facultatives : sans
     * étape, le drawer s'ouvre directement sur l'envoi de la preuve.
     */
    {
      name: "steps",
      type: "array",
      label: "Étapes de réalisation",
      labels: { singular: "Étape", plural: "Étapes" },
      fields: [
        { name: "title", type: "text", label: "Intitulé", required: true },
        { name: "detail", type: "textarea", label: "Détail" },
        { name: "url", type: "text", label: "Lien" },
      ],
    },
    {
      name: "proofHint",
      type: "textarea",
      label: "Preuve attendue",
      admin: { placeholder: "Ex. : capture de votre avis publié, visible avec la date." },
    },
    {
      name: "logo",
      type: "upload",
      relationTo: "media",
      label: "Logo",
      admin: { position: "sidebar", components: { Field: "/admin/fields/DirectUpload#default" } },
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
