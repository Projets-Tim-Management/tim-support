import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Les étapes commerciales à envoyer à GA4, une ligne par opportunité et par
 * étape (plan de mesure, phase 2.2 — voir modules/analytics/lib/ga4-mp.ts).
 *
 * À part de l'opportunité, et non sur elle : la fiche a des brouillons, et
 * Payload repart de sa dernière VERSION à chaque enregistrement — un état écrit
 * à côté y serait remis à vide, et l'étape renvoyée (constat de la revue du
 * 16/10/2026). Ici, l'unicité (opportunité, étape) est tenue par la base :
 * une étape ne peut exister, donc partir, qu'une fois.
 *
 * Une ligne naît quand l'opportunité FRANCHIT l'étape (au passage du statut) ;
 * ce que devient la fiche ensuite (perdue, résiliée) n'y change rien.
 */
export const Ga4Sends: CollectionConfig = {
  slug: "ga4-sends",
  labels: { singular: "Envoi GA4", plural: "Envois GA4" },
  admin: {
    useAsTitle: "step",
    defaultColumns: ["step", "reachedAt", "sentAt", "value", "error"],
    group: "Analyses",
    // Lue depuis la fiche de l'opportunité, pas parcourue à la main.
    hidden: true,
  },
  // Écrite par l'envoi seul (SQL) : personne ne crée, ne modifie ni ne supprime une ligne.
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  disableDuplicate: true,
  defaultSort: "reachedAt",
  indexes: [{ fields: ["client", "step"], unique: true }],
  fields: [
    { name: "client", type: "relationship", relationTo: "partner-clients", required: true, index: true, label: "Opportunité" },
    {
      name: "step",
      type: "select",
      required: true,
      label: "Étape",
      options: [
        { label: "Démo programmée (qualify_lead)", value: "qualify" },
        { label: "Signature (close_convert_lead)", value: "close" },
      ],
    },
    { name: "reachedAt", type: "date", required: true, label: "Franchie le", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "sentAt", type: "date", label: "Envoyée le", index: true, admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "value", type: "number", label: "Montant envoyé (€ / mois)" },
    { name: "note", type: "text", label: "Note" },
    { name: "error", type: "text", label: "Dernier incident" },
    // La mécanique d'envoi : réservation (une seule à la fois), essais, prochain passage.
    { name: "claimedAt", type: "date", admin: { hidden: true } },
    { name: "attempts", type: "number", defaultValue: 0, admin: { hidden: true } },
    { name: "nextTryAt", type: "date", index: true, admin: { hidden: true } },
  ],
};
