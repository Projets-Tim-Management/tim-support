import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { validatePlatform } from "@/modules/ads/lib/platforms";

/**
 * Les chiffres, jour par jour (plan Publicité, §4.6).
 *
 * Une ligne par jour × niveau (campagne, ensemble, annonce) × objet, RÉÉCRITE
 * tant que la régie corrige ses chiffres (fenêtre de 7 jours). Les écrans — et
 * plus tard les agents — lisent CETTE table, jamais la régie en direct : un seul
 * chiffre, le même pour tout le monde.
 *
 * Le jour est un TEXTE « AAAA-MM-JJ » dans le fuseau du compte, pas une date :
 * c'est le jour tel que la régie le compte. Un horodatage le ferait glisser d'un
 * jour selon le fuseau de qui le lit — et la clé d'unicité avec lui.
 *
 * `qualifiedLeads` et `won` sont calculés chez nous (phase 1), à partir des
 * fiches : c'est ce qui distingue un lead pas cher d'un lead qui signe.
 */

export const METRIC_LEVELS = [
  { label: "Campagne", value: "campaign" },
  { label: "Ensemble de publicités", value: "adset" },
  { label: "Annonce", value: "ad" },
] as const;

const count = (name: string, label: string) =>
  ({ name, type: "number", label, defaultValue: 0, min: 0, admin: { width: "25%" } }) as const;

export const AdMetricsDaily: CollectionConfig = {
  slug: "ad-metrics-daily",
  labels: { singular: "Métrique quotidienne", plural: "Métriques quotidiennes" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["day", "level", "name", "spend", "impressions", "clicks", "leads"],
    group: "Publicité",
    // Lue par le tableau de bord, pas parcourue à la main.
    hidden: true,
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  disableDuplicate: true,
  defaultSort: "-day",
  indexes: [{ fields: ["platform", "level", "externalId", "day"], unique: true }],
  fields: [
    {
      name: "day",
      type: "text",
      label: "Jour",
      required: true,
      index: true,
      validate: (v: unknown) => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? true : "Jour attendu au format AAAA-MM-JJ."),
    },
    { name: "account", type: "relationship", relationTo: "ad-accounts", required: true, index: true },
    { name: "platform", type: "text", required: true, index: true, validate: validatePlatform },
    { name: "level", type: "select", options: [...METRIC_LEVELS], required: true, index: true },
    { name: "externalId", type: "text", required: true, index: true },
    { name: "name", type: "text" },
    { name: "campaignExternalId", type: "text", index: true },
    { name: "currency", type: "text" },
    {
      type: "row",
      fields: [
        { name: "spend", type: "number", label: "Dépense", defaultValue: 0, min: 0, admin: { width: "25%" } },
        count("impressions", "Impressions"),
        count("clicks", "Clics"),
        count("leads", "Leads (régie)"),
      ],
    },
    {
      type: "row",
      fields: [count("qualifiedLeads", "Leads qualifiés"), count("won", "Affaires gagnées")],
    },
  ],
};
