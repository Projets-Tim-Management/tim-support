import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { CONVERSION_EVENTS } from "@/modules/ads/lib/conversions";

/**
 * Ce qui a été renvoyé à Meta, lead par lead (plan Publicité, §9 nonies,
 * étape 6 — API Conversions). Une ligne par soumission et par événement : c'est
 * elle qui empêche de renvoyer deux fois la même étape, et qui dit ce que Meta
 * a répondu. Écrite par le serveur seul.
 */
export const AdConversions: CollectionConfig = {
  slug: "ad-conversions",
  labels: { singular: "Conversion renvoyée", plural: "Conversions renvoyées" },
  admin: {
    useAsTitle: "eventId",
    defaultColumns: ["sentAt", "event", "submission", "status"],
    group: "Publicité",
    hidden: true,
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-sentAt",
  indexes: [{ fields: ["submission", "event"], unique: true }],
  fields: [
    { name: "submission", type: "relationship", relationTo: "form-submissions", required: true, index: true },
    { name: "event", type: "select", options: [...CONVERSION_EVENTS], required: true, index: true },
    { name: "eventId", type: "text", required: true },
    { name: "pixelId", type: "text" },
    {
      name: "status",
      type: "select",
      options: [
        { label: "Envoyé", value: "envoye" },
        { label: "Non envoyé", value: "ignore" },
        { label: "Échec", value: "echec" },
      ],
      required: true,
    },
    { name: "detail", type: "text", label: "Raison ou réponse de Meta" },
    { name: "sentAt", type: "date", required: true, index: true, admin: { date: { pickerAppearance: "dayAndTime" } } },
  ],
};
