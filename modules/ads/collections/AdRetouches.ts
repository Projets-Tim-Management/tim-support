import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Retouches de créas (plan Publicité, étape « retouche ciblée », 14/10/2026) :
 * ce que Charlie demande de changer sur UNE créa, et ce que l'IA en a fait.
 *
 * C'est à la fois la file de travail (le cron prend la plus ancienne en
 * attente) et l'historique des consignes de la créa : chaque retouche tient
 * compte de toutes les précédentes, garde la version d'avant et celle d'après.
 *
 * Écrite seulement par la route « Demander la retouche » et le traitement :
 * jamais par le formulaire ni l'API.
 */

export const RETOUCH_STATUSES = [
  { label: "En file", value: "en-attente" },
  { label: "En cours", value: "en-cours" },
  { label: "Faite", value: "faite" },
  { label: "Échec", value: "echec" },
] as const;

const locked = { create: () => false, update: () => false };

export const AdRetouches: CollectionConfig = {
  slug: "ad-retouches",
  labels: { singular: "Retouche", plural: "Retouches" },
  admin: {
    useAsTitle: "instruction",
    defaultColumns: ["instruction", "creative", "status", "author", "createdAt"],
    group: "Publicité",
    description: "Les consignes données sur une créa précise et ce que l'IA en a fait. Se demandent depuis la carte de la créa, dans « À valider ».",
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-createdAt",
  fields: [
    { name: "creative", type: "relationship", relationTo: "ad-creatives", label: "Créa", required: true, index: true, access: locked },
    { name: "instruction", type: "textarea", label: "Consigne", required: true, maxLength: 1000, access: locked },
    { name: "author", type: "relationship", relationTo: "users", label: "Demandée par", access: locked },
    { name: "generalize", type: "checkbox", label: "Valable aussi pour les prochaines créas", defaultValue: false, access: locked },
    { name: "instructionDoc", type: "relationship", relationTo: "ad-instructions", label: "Consigne générale créée", access: locked },
    {
      type: "row",
      fields: [
        { name: "status", type: "select", label: "État", options: [...RETOUCH_STATUSES], defaultValue: "en-attente", required: true, index: true, access: locked, admin: { width: "30%" } },
        { name: "costEur", type: "number", label: "Coût IA (€)", access: locked, admin: { width: "20%" } },
        { name: "doneAt", type: "date", label: "Faite le", access: locked, admin: { width: "50%", date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
    { name: "summary", type: "textarea", label: "Ce qui a changé", access: locked },
    { name: "error", type: "text", label: "Motif de l'échec", access: locked },
    // Les deux versions de la créa : textes, accroche, visuels, vidéo (partition, style, musique, fichiers).
    { name: "before", type: "json", label: "Version d'avant", access: locked, admin: { hidden: true } },
    { name: "after", type: "json", label: "Version d'après", access: locked, admin: { hidden: true } },
    { name: "attempts", type: "number", defaultValue: 0, access: locked, admin: { hidden: true } },
    { name: "leaseUntil", type: "date", index: true, access: locked, admin: { hidden: true } },
  ],
};
