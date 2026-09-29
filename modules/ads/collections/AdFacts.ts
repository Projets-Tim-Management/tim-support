import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Faits sourcés (plan Publicité, §9 ter) — les SEULS chiffres qu'une créa a le
 * droit de citer.
 *
 * Un fait, c'est une phrase, sa source et sa date. La génération de textes ne
 * reçoit que les faits choisis dans le brief de la campagne, et le code rejette
 * tout texte qui contient un nombre absent de ces faits (ou de l'offre) : un
 * chiffre inventé par le modèle ne passe pas, même s'il sonne juste.
 *
 * Une collection plutôt qu'une liste dans le kit de marque : le brief s'y relie,
 * et une créa garde la trace du fait qu'elle cite.
 */
export const AdFacts: CollectionConfig = {
  slug: "ad-facts",
  labels: { singular: "Fait sourcé", plural: "Faits sourcés" },
  admin: {
    useAsTitle: "statement",
    defaultColumns: ["statement", "source", "date", "active"],
    group: "Publicité",
    description: "Les chiffres qu'une publicité peut citer, chacun avec sa source. Aucun autre chiffre ne sort.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "-date",
  fields: [
    {
      name: "statement",
      type: "text",
      label: "Le fait",
      required: true,
      admin: { placeholder: "Nos clients gagnent 2 h par semaine sur le pointage", description: "Tel qu'il pourra être écrit dans une publicité." },
    },
    {
      type: "row",
      fields: [
        {
          name: "source",
          type: "text",
          label: "Source",
          required: true,
          admin: { width: "60%", placeholder: "Enquête clients, 42 réponses, mars 2026" },
        },
        {
          name: "date",
          type: "date",
          label: "Date",
          required: true,
          admin: { width: "40%", date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" } },
        },
      ],
    },
    { name: "sourceUrl", type: "text", label: "Lien vers la source", admin: { placeholder: "https://…" } },
    {
      name: "active",
      type: "checkbox",
      label: "Utilisable",
      defaultValue: true,
      index: true,
      admin: { position: "sidebar", description: "Décoché : le fait n'est plus proposé (périmé, contesté)." },
    },
    { name: "notes", type: "textarea", label: "Notes", admin: { position: "sidebar" } },
  ],
};
