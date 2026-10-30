import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Les factures Axonaut, de janvier 2025 à septembre 2026 : le passé de la
 * facturation, avant que Pennylane ne facture seul (octobre 2026). Lues dans
 * « Analyses → Facturation » pour tracer le CA mois par mois et client par
 * client sur toute la période.
 *
 * Une archive : écrite par l'import seul (scripts/import-axonaut.ts, depuis
 * les PDF d'Axonaut), jamais à la main. Un numéro n'existe qu'une fois ;
 * réimporter le même dossier remet les mêmes lignes.
 */
export const AxonautInvoices: CollectionConfig = {
  slug: "axonaut-invoices",
  labels: { singular: "Facture Axonaut", plural: "Factures Axonaut" },
  admin: {
    useAsTitle: "number",
    defaultColumns: ["number", "date", "clientName", "client", "totalHT", "recurringHT", "servicesHT"],
    group: "Analyses",
    description: "Historique d'avant Pennylane (janvier 2025 à septembre 2026), importé des PDF d'Axonaut. Lecture seule.",
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  disableDuplicate: true,
  defaultSort: "-date",
  fields: [
    { name: "number", type: "text", required: true, unique: true, label: "Numéro" },
    {
      name: "kind",
      type: "select",
      required: true,
      label: "Type",
      options: [
        { label: "Facture", value: "facture" },
        { label: "Avoir", value: "avoir" },
      ],
    },
    { name: "date", type: "date", required: true, index: true, label: "Date" },
    { name: "month", type: "text", required: true, index: true, label: "Mois (AAAA-MM)" },
    { name: "client", type: "relationship", relationTo: "partner-clients", index: true, label: "Fiche client" },
    { name: "clientName", type: "text", required: true, label: "Client (sur la facture)" },
    { name: "siren", type: "text", label: "SIREN" },
    { name: "totalHT", type: "number", required: true, label: "Total HT" },
    { name: "totalTTC", type: "number", required: true, label: "Total TTC" },
    { name: "recurringHT", type: "number", required: true, label: "Dont licences (récurrent) HT" },
    { name: "servicesHT", type: "number", required: true, label: "Dont prestations HT" },
    { name: "creditFor", type: "text", label: "Avoir sur la facture" },
    { name: "note", type: "text", label: "Correction" },
    { name: "lines", type: "json", label: "Lignes" },
    { name: "sourceFile", type: "text", label: "Fichier" },
  ],
};
