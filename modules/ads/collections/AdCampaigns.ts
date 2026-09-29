import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { validatePlatform } from "@/modules/ads/lib/platforms";

/**
 * Campagnes (plan Publicité, §4.2) — en phase 0, un MIROIR de la régie.
 *
 * Écrit par la synchro seulement : ni création ni modification depuis le
 * back-office. Un budget modifiable ici sans être envoyé chez la régie ferait
 * croire à une action qui n'a pas lieu. Les champs de pilotage (autonomie,
 * cibles, brief, modèle d'agent) arrivent avec la phase qui s'en sert.
 */

export const OBJECTIVES = [
  { label: "Leads", value: "leads" },
  { label: "Trafic", value: "trafic" },
  { label: "Notoriété", value: "notoriete" },
  { label: "Autre", value: "autre" },
] as const;

export const CAMPAIGN_STATUSES = [
  { label: "Brouillon", value: "brouillon" },
  { label: "Active", value: "active" },
  { label: "En pause", value: "en-pause" },
  { label: "Terminée", value: "terminee" },
] as const;

export const AdCampaigns: CollectionConfig = {
  slug: "ad-campaigns",
  labels: { singular: "Campagne", plural: "Campagnes" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "account", "status", "objective", "dailyBudget", "lastSyncAt"],
    group: "Publicité",
    description: "Les campagnes lues chez les régies, mises à jour chaque nuit. Lecture seule : elles se modifient chez la régie.",
  },
  access: {
    read: isAdmin,
    // Miroir : seule la synchro écrit (overrideAccess).
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  disableDuplicate: true,
  defaultSort: "-lastSyncAt",
  indexes: [{ fields: ["platform", "externalId"], unique: true }],
  fields: [
    { name: "name", type: "text", label: "Nom", required: true },
    {
      type: "row",
      fields: [
        {
          name: "account",
          type: "relationship",
          relationTo: "ad-accounts",
          label: "Compte",
          required: true,
          index: true,
          admin: { width: "50%" },
        },
        { name: "externalId", type: "text", label: "Identifiant chez la régie", index: true, admin: { width: "50%" } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "status", type: "select", label: "État", options: [...CAMPAIGN_STATUSES], defaultValue: "brouillon", index: true, admin: { width: "33%" } },
        { name: "objective", type: "select", label: "Objectif", options: [...OBJECTIVES], admin: { width: "33%" } },
        {
          name: "dailyBudget",
          type: "number",
          label: "Budget quotidien",
          admin: { width: "34%", description: "En devise du compte. Vide : le budget vit au niveau des ensembles de publicités." },
        },
      ],
    },
    {
      // Copie de la régie du compte : une clé d'unicité ne traverse pas une relation.
      name: "platform",
      type: "text",
      label: "Régie",
      required: true,
      index: true,
      validate: validatePlatform,
      admin: { position: "sidebar" },
    },
    {
      name: "externalStatus",
      type: "text",
      label: "État chez la régie",
      admin: { position: "sidebar", description: "Valeur brute, pour comprendre un écart avec l'état normalisé." },
    },
    {
      name: "lastSyncAt",
      type: "date",
      label: "Dernière synchro",
      admin: { position: "sidebar", date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" } },
    },
    // Derniers chiffres consolidés, pour la liste et les cartes du tableau de bord.
    { name: "kpis", type: "json", admin: { hidden: true } },
  ],
};
