import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { ALERT_KINDS } from "@/modules/ads/lib/alerts";

/**
 * Les urgences des campagnes en ligne (plan Publicité, §9 quinquies §4 et
 * §9 nonies, étape 2) — détectées par le code à chaque synchro, closes seules
 * quand elles ne se constatent plus.
 *
 * Une seule alerte ouverte par campagne, type et objet. `decision` est la pause
 * qu'elle a déclenchée (exécutée, proposée ou bloquée, selon l'autonomie) ;
 * `notifiedAt`, l'e-mail d'urgence parti aux admins.
 */
export const ALERT_STAGES = [
  { label: "À confirmer", value: "a-confirmer" },
  { label: "Confirmée", value: "confirmee" },
] as const;

export const AdAlerts: CollectionConfig = {
  slug: "ad-alerts",
  labels: { singular: "Alerte", plural: "Alertes" },
  admin: {
    useAsTitle: "detail",
    defaultColumns: ["detectedAt", "campaign", "kind", "detail", "resolvedAt"],
    group: "Publicité",
    hidden: true,
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-detectedAt",
  fields: [
    { name: "campaign", type: "relationship", relationTo: "ad-campaigns", label: "Campagne", required: true, index: true },
    { name: "kind", type: "select", label: "Type", options: [...ALERT_KINDS], required: true, index: true },
    { name: "level", type: "text", label: "Niveau de l'objet" },
    { name: "objectExternalId", type: "text", label: "Objet chez Meta", index: true },
    { name: "objectName", type: "text", label: "Nom de l'objet" },
    { name: "detail", type: "textarea", label: "Constat", required: true },
    { name: "stage", type: "select", label: "Étape", options: [...ALERT_STAGES], defaultValue: "confirmee" },
    { name: "detectedAt", type: "date", label: "Détectée le", required: true, index: true, admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "confirmedAt", type: "date", label: "Confirmée le", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "resolvedAt", type: "date", label: "Close le", index: true, admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "notifiedAt", type: "date", label: "E-mail envoyé le", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "decision", type: "relationship", relationTo: "ad-decisions", label: "Décision déclenchée" },
  ],
};
