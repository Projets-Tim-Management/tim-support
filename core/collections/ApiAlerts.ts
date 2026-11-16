import type { CollectionConfig } from "payload";

import { hideUnlessAdmin, isAdmin } from "@/core/access";

/**
 * LES API EN PANNE (13/11/2026) — une ligne par API : la dernière panne, son
 * genre (paiement, accès, échecs répétés), depuis quand, et le message du
 * fournisseur. Écrites par le serveur seul (core/lib/api-health.ts) ; le
 * premier appel réussi passe la ligne « rétablie ». Lues dans Paramètres ›
 * Connexions (bandeau en tête) et ici.
 */
export const ApiAlerts: CollectionConfig = {
  slug: "api-alerts",
  labels: { singular: "API en panne", plural: "API en panne" },
  admin: { useAsTitle: "label", defaultColumns: ["label", "status", "kind", "lastFailedAt", "failures"], group: "Système", hidden: hideUnlessAdmin },
  access: { read: isAdmin, create: () => false, update: () => false, delete: isAdmin },
  defaultSort: "-lastFailedAt",
  fields: [
    { name: "provider", type: "text", label: "API (code)", required: true, unique: true, index: true },
    { name: "label", type: "text", label: "API" },
    {
      name: "status",
      type: "select",
      label: "État",
      index: true,
      options: [
        { label: "En panne", value: "en-panne" },
        { label: "Incidents passagers", value: "en-observation" },
        { label: "Rétablie", value: "retablie" },
      ],
    },
    {
      name: "kind",
      type: "select",
      label: "Cause",
      options: [
        { label: "Paiement insuffisant", value: "paiement" },
        { label: "Clé ou accès refusé", value: "acces" },
        { label: "Échecs répétés", value: "autre" },
        { label: "Incident passager", value: "passager" },
      ],
    },
    { name: "message", type: "textarea", label: "Message du fournisseur" },
    { name: "failures", type: "number", label: "Échecs d'affilée" },
    { name: "firstFailedAt", type: "date", label: "En panne depuis", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "lastFailedAt", type: "date", label: "Dernier échec", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "emailedAt", type: "date", label: "Dernier e-mail", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "resolvedAt", type: "date", label: "Rétablie le", admin: { date: { pickerAppearance: "dayAndTime" } } },
  ],
};
