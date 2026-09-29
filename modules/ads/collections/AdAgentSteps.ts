import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { tokensGroup } from "@/modules/ads/collections/AdAgentRuns";

/**
 * Étapes d'un agent (plan Publicité, §9 quater, point 5) — un appel au modèle,
 * ou un outil. C'est la mémoire durable du passage : la conversation d'un agent
 * se reconstruit à partir de ses étapes après une coupure, et le fil
 * d'activité de la salle de contrôle, c'est leur `line`.
 *
 * La clé d'idempotence rend une étape reprise inoffensive : un outil déjà
 * exécuté (une créa déjà écrite) ne s'exécute pas une seconde fois.
 */
export const STEP_KINDS = [
  { label: "Appel au modèle", value: "modele" },
  { label: "Outil", value: "outil" },
] as const;

export const STEP_STATUSES = [
  { label: "En cours", value: "en-cours" },
  { label: "Fait", value: "fait" },
  { label: "Échoué", value: "echoue" },
] as const;

export const AdAgentSteps: CollectionConfig = {
  slug: "ad-agent-steps",
  labels: { singular: "Étape d'agent", plural: "Étapes d'agent" },
  admin: {
    useAsTitle: "line",
    defaultColumns: ["createdAt", "agent", "kind", "tool", "line", "status"],
    group: "Publicité",
    hidden: true,
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "createdAt",
  indexes: [{ fields: ["agent", "seq"], unique: true }],
  fields: [
    { name: "run", type: "relationship", relationTo: "ad-agent-runs", label: "Passage", required: true, index: true },
    { name: "agent", type: "relationship", relationTo: "ad-agents", label: "Agent", required: true, index: true },
    {
      type: "row",
      fields: [
        { name: "seq", type: "number", label: "Rang", required: true, min: 0, admin: { width: "25%" } },
        { name: "kind", type: "select", label: "Nature", options: [...STEP_KINDS], required: true, admin: { width: "25%" } },
        { name: "tool", type: "text", label: "Outil", admin: { width: "25%" } },
        { name: "status", type: "select", label: "État", options: [...STEP_STATUSES], defaultValue: "en-cours", required: true, admin: { width: "25%" } },
      ],
    },
    { name: "line", type: "text", label: "Dans le fil d'activité", required: true },
    { name: "input", type: "json", label: "Entrée" },
    { name: "output", type: "json", label: "Sortie", admin: { description: "Pour un appel au modèle : les blocs de la réponse, réflexion comprise, pour reprendre la conversation." } },
    tokensGroup(),
    { name: "costEur", type: "number", label: "Coût (€)", defaultValue: 0 },
    { name: "idempotencyKey", type: "text", label: "Clé d'idempotence", required: true, unique: true, admin: { condition: () => false } },
    {
      type: "row",
      fields: [
        { name: "startedAt", type: "date", label: "Début", admin: { width: "50%", date: { pickerAppearance: "dayAndTime" } } },
        { name: "finishedAt", type: "date", label: "Fin", admin: { width: "50%", date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
  ],
};
