import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";
import { REQUEST_OUTCOMES } from "@/modules/ai-team/lib/requests";
import { ACTION_WHO, TEAM_OPTIONS } from "@/modules/ai-team/lib/roadmap-constants";

/**
 * LES ACTIONS DES ÉQUIPES HUMAINES sur la feuille de route (14/11/2026) — ce
 * que la direction, les développeurs, les commerciaux, le marketing ou le
 * support mettent en place, à côté du travail des agents : prévu ou fait, daté,
 * et l'objectif qu'il sert.
 *
 * Elles apparaissent sur la courbe et le calendrier comme les actions des
 * agents ; les chefs les lisent (pour en tenir compte et ne pas doubler le
 * travail) et les jugent deux semaines après qu'elles sont faites.
 */
export const AiTeamActions: CollectionConfig = {
  slug: "ai-team-actions",
  labels: { singular: "Action (feuille de route)", plural: "Actions des équipes (feuille de route)" },
  admin: { useAsTitle: "title", defaultColumns: ["title", "who", "status", "plannedDate", "doneDate"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: isDirectionAccess, update: isDirectionAccess, delete: isDirectionAccess },
  defaultSort: "-updatedAt",
  fields: [
    { name: "title", type: "text", label: "Action", required: true },
    {
      type: "row",
      fields: [
        { name: "who", type: "select", label: "Qui", required: true, defaultValue: "direction", options: [...ACTION_WHO], admin: { width: "34%" } },
        {
          name: "team",
          type: "select",
          label: "Pour",
          required: true,
          defaultValue: "tous",
          index: true,
          options: TEAM_OPTIONS,
          admin: { width: "33%" },
        },
        {
          name: "status",
          type: "select",
          label: "État",
          required: true,
          defaultValue: "prevue",
          index: true,
          options: [
            { label: "Prévue", value: "prevue" },
            { label: "En cours", value: "en-cours" },
            { label: "Faite", value: "faite" },
            { label: "Abandonnée", value: "abandonnee" },
          ],
          admin: { width: "33%" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "plannedDate", type: "date", label: "Prévue pour le", admin: { width: "50%", date: { pickerAppearance: "dayOnly" } } },
        { name: "doneDate", type: "date", label: "Faite le", admin: { width: "50%", date: { pickerAppearance: "dayOnly" } } },
      ],
    },
    { name: "goal", type: "relationship", relationTo: "ai-team-goals", label: "Sert l'objectif" },
    { name: "notes", type: "textarea", label: "Détail" },
    { name: "author", type: "relationship", relationTo: "users", label: "Saisie par" },
    // Le verdict du chef, deux semaines après qu'elle est faite.
    { name: "outcome", type: "select", label: "Ce qu'elle a donné", options: [...REQUEST_OUTCOMES] },
    { name: "verdict", type: "textarea", label: "Ce que les chiffres montrent (le chef)" },
    { name: "verdictAt", type: "date", label: "Jugée le" },
  ],
};
