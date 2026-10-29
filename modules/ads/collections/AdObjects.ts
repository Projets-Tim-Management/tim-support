import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { validatePlatform } from "@/modules/ads/lib/platforms";

/**
 * Les ensembles et les publicités d'un compte, tels qu'ils sont CHEZ la régie
 * (plan Publicité, §9 nonies, étape 1) — réécrits à chaque synchro.
 *
 * Les chiffres vivent dans `ad-metrics-daily` ; ici, l'ÉTAT : une pub refusée ou
 * en revue, le budget d'un ensemble, ce que la revue reproche. C'est ce que les
 * alertes et les agents de suivi lisent pour agir sur un objet précis — jamais
 * la régie en direct.
 *
 * `reach7d` et `frequency7d` sont la portée et la répétition sur les 7 derniers
 * jours d'un seul tenant : elles ne se recalculent pas en additionnant des jours.
 */

export const OBJECT_LEVELS = [
  { label: "Ensemble de publicités", value: "adset" },
  { label: "Annonce", value: "ad" },
] as const;

export const AdObjects: CollectionConfig = {
  slug: "ad-objects",
  labels: { singular: "Objet chez la régie", plural: "Objets chez la régie" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "level", "effectiveStatus", "dailyBudget", "frequency7d", "syncedAt"],
    group: "Publicité",
    hidden: true,
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  disableDuplicate: true,
  indexes: [{ fields: ["platform", "externalId"], unique: true }],
  fields: [
    { name: "account", type: "relationship", relationTo: "ad-accounts", required: true, index: true },
    { name: "platform", type: "text", required: true, index: true, validate: validatePlatform },
    { name: "level", type: "select", options: [...OBJECT_LEVELS], required: true, index: true },
    { name: "externalId", type: "text", required: true, index: true },
    { name: "name", type: "text" },
    { name: "campaignExternalId", type: "text", index: true },
    { name: "adsetExternalId", type: "text", index: true },
    { name: "status", type: "text", label: "État configuré" },
    { name: "effectiveStatus", type: "text", label: "État de diffusion", index: true },
    { name: "dailyBudget", type: "number", label: "Budget quotidien" },
    { name: "issues", type: "json", label: "Ce que la régie reproche" },
    { name: "reach7d", type: "number", label: "Portée sur 7 jours" },
    { name: "frequency7d", type: "number", label: "Répétition sur 7 jours" },
    { name: "syncedAt", type: "date", label: "Lu le", admin: { date: { pickerAppearance: "dayAndTime" } } },
  ],
};
