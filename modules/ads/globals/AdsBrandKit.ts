import type { GlobalConfig } from "payload";

import { isAdmin } from "@/core/access";
import { TONES } from "@/modules/ads/lib/dimensions";

/**
 * Publicité › Paramètres › Kit de marque (plan Publicité, §9 ter) — ce que
 * chaque génération lit.
 *
 * Il ne REDEMANDE pas ce qui existe déjà : les couleurs de TIM et son logo
 * principal sont dans Système › Apparence (ceux du contrat PDF), et c'est là
 * qu'ils se changent — une charte, une seule source. Le kit n'ajoute que ce qui
 * est propre à la publicité. Les captures, photos et polices sont des médias
 * publicitaires (`ad-media`), les chiffres des faits sourcés (`ad-facts`).
 */
export const AdsBrandKit: GlobalConfig = {
  slug: "ads-brand-kit",
  label: "Kit de marque",
  admin: {
    group: "Publicité",
    description:
      "Le ton, les interdits et les polices des publicités. Couleurs et logo principal : Système › Apparence. Captures, photos et polices : Médias publicitaires. Chiffres : Faits sourcés.",
  },
  access: { read: isAdmin, update: isAdmin },
  fields: [
    {
      type: "collapsible",
      label: "Ton",
      fields: [
        {
          name: "defaultTone",
          type: "select",
          label: "Adresse par défaut",
          options: [...TONES],
          defaultValue: "vous",
          required: true,
          admin: {
            description: "Vouvoiement par défaut. Le tutoiement ne sort qu'en variante étiquetée « test de ton », validée comme toute créa.",
          },
        },
        { name: "voice", type: "textarea", label: "Le ton, en quelques phrases", admin: { placeholder: "Direct, concret, sans jargon…" } },
        {
          type: "row",
          fields: [
            { name: "goodExamples", type: "textarea", label: "Des phrases justes", admin: { width: "50%" } },
            { name: "badExamples", type: "textarea", label: "Des phrases à éviter", admin: { width: "50%" } },
          ],
        },
      ],
    },
    {
      name: "forbidden",
      type: "array",
      label: "Mentions interdites",
      labels: { singular: "Mention", plural: "Mentions" },
      admin: {
        description: "Refusées en code dans tout texte généré, sans tenir compte des majuscules ni des accents.",
        initCollapsed: false,
      },
      fields: [
        {
          type: "row",
          fields: [
            { name: "term", type: "text", label: "Mot ou expression", required: true, admin: { width: "40%" } },
            { name: "reason", type: "text", label: "Pourquoi", admin: { width: "60%" } },
          ],
        },
      ],
    },
    {
      type: "collapsible",
      label: "Visuels",
      fields: [
        {
          name: "logoOnDark",
          type: "upload",
          relationTo: "ad-media",
          label: "Logo pour fond sombre",
          filterOptions: { kind: { equals: "logo" } },
          admin: { description: "Blanc ou monochrome. Le logo couleur est celui de Système › Apparence." },
        },
        {
          name: "fonts",
          type: "array",
          label: "Polices",
          labels: { singular: "Police", plural: "Polices" },
          admin: { description: "Sans police déposée, les gabarits utilisent Lato (celle du contrat)." },
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "role",
                  type: "select",
                  label: "Rôle",
                  required: true,
                  options: [
                    { label: "Titres", value: "titre" },
                    { label: "Texte", value: "texte" },
                  ],
                  admin: { width: "25%" },
                },
                { name: "weight", type: "number", label: "Graisse", defaultValue: 400, min: 100, max: 900, admin: { width: "20%" } },
                {
                  name: "file",
                  type: "upload",
                  relationTo: "ad-media",
                  label: "Fichier",
                  required: true,
                  filterOptions: { kind: { equals: "police" } },
                  admin: { width: "55%" },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      type: "collapsible",
      label: "Mentions légales",
      fields: [
        { name: "advertiser", type: "text", label: "Annonceur", admin: { placeholder: "LC DEV — TIM Management" } },
        { name: "legalNotice", type: "textarea", label: "Mentions obligatoires", admin: { description: "Ajoutées au fichier de textes téléchargé avec chaque créa." } },
      ],
    },
  ],
};
