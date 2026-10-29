import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Les récapitulatifs du lundi envoyés aux admins (plan Publicité, §9 nonies,
 * étape 7 — décision du 29/10/2026 : urgences + récapitulatif du lundi). La
 * semaine est UNIQUE : la ligne se pose avant l'envoi, deux crons qui se
 * chevauchent n'envoient donc jamais deux fois.
 */
export const AdRecaps: CollectionConfig = {
  slug: "ad-recaps",
  labels: { singular: "Récapitulatif du lundi", plural: "Récapitulatifs du lundi" },
  admin: { useAsTitle: "week", defaultColumns: ["week", "sentAt", "status"], group: "Publicité", hidden: true },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-week",
  fields: [
    { name: "week", type: "text", label: "Semaine (lundi)", required: true, unique: true, index: true },
    {
      name: "status",
      type: "select",
      options: [
        { label: "Envoyé", value: "envoye" },
        { label: "Rien à dire", value: "vide" },
        { label: "Échec", value: "echec" },
      ],
      required: true,
    },
    { name: "text", type: "textarea", label: "Contenu" },
    { name: "sentAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
  ],
};
