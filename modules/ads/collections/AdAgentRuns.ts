import type { CollectionConfig, Field } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Passages de l'agent de campagne (plan Publicité, §9 quater) — un clic sur
 * « Lancer l'agent », avec son objectif, son budget et son bilan.
 *
 * Écrit par le serveur seul : un passage modifiable à la main ne dirait plus ce
 * que l'agent a fait. Le verrou `leaseUntil` empêche deux exécutions
 * simultanées du même passage (clic, enchaînement, cron) ; un bail expiré veut
 * dire que la fonction est morte, et le cron reprend.
 */
export const RUN_STATUSES = [
  { label: "En cours", value: "en-cours" },
  { label: "En pause (plafond du jour)", value: "en-pause-budget" },
  { label: "À valider", value: "a-valider" },
  { label: "Arrêté", value: "arrete" },
  { label: "Échoué", value: "echoue" },
] as const;

export type RunStatus = (typeof RUN_STATUSES)[number]["value"];

/** Les quatre compteurs de tokens, tels qu'Anthropic les facture. */
export const tokensGroup = (): Field => ({
  name: "tokens",
  type: "group",
  label: "Tokens",
  admin: { readOnly: true },
  fields: [
    {
      type: "row",
      fields: [
        { name: "input", type: "number", label: "Entrée", defaultValue: 0, admin: { width: "25%" } },
        { name: "output", type: "number", label: "Sortie", defaultValue: 0, admin: { width: "25%" } },
        { name: "cacheRead", type: "number", label: "Cache lu", defaultValue: 0, admin: { width: "25%" } },
        { name: "cacheWrite", type: "number", label: "Cache écrit", defaultValue: 0, admin: { width: "25%" } },
      ],
    },
  ],
});

const serverOnly = { read: isAdmin, create: () => false, update: () => false, delete: () => false };

export const AdAgentRuns: CollectionConfig = {
  slug: "ad-agent-runs",
  labels: { singular: "Passage d'agent", plural: "Passages d'agent" },
  admin: {
    useAsTitle: "objective",
    defaultColumns: ["startedAt", "campaign", "objective", "status", "costEur"],
    group: "Publicité",
    description: "Chaque préparation de campagne par l'agent : objectif, budget, coût, bilan. Écrit par le serveur.",
  },
  access: serverOnly,
  defaultSort: "-startedAt",
  fields: [
    { name: "campaign", type: "relationship", relationTo: "ad-campaigns", label: "Campagne", required: true, index: true },
    { name: "objective", type: "textarea", label: "Objectif", required: true },
    {
      type: "row",
      fields: [
        { name: "status", type: "select", label: "État", options: [...RUN_STATUSES], defaultValue: "en-cours", required: true, index: true, admin: { width: "34%" } },
        { name: "budgetEur", type: "number", label: "Budget du passage (€)", required: true, admin: { width: "33%" } },
        { name: "costEur", type: "number", label: "Coût (€)", defaultValue: 0, admin: { width: "33%" } },
      ],
    },
    tokensGroup(),
    {
      type: "row",
      fields: [
        { name: "startedBy", type: "relationship", relationTo: "users", label: "Lancé par", admin: { width: "34%" } },
        { name: "startedAt", type: "date", label: "Début", required: true, index: true, admin: { width: "33%", date: { pickerAppearance: "dayAndTime" } } },
        { name: "finishedAt", type: "date", label: "Fin", admin: { width: "33%", date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
    { name: "limits", type: "json", label: "Bornes au lancement", admin: { description: "Profondeur, simultanés, rejets, budget : la photo de ce qui s'appliquait." } },
    { name: "leaseUntil", type: "date", label: "Verrou jusqu'à", index: true, admin: { condition: () => false } },
    { name: "summary", type: "textarea", label: "Bilan", admin: { description: "Ce que l'orchestrateur a déposé dans « À valider »." } },
    { name: "error", type: "text", label: "Motif d'arrêt ou d'échec" },
  ],
};
