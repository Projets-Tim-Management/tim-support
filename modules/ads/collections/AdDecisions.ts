import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Journal des décisions (plan Publicité, §4.4 et §9 quater) — chaque choix d'un
 * agent, avec sa justification.
 *
 * La phase 3c ne crée que les types et états dont elle se sert : répartir le
 * budget, choisir un positionnement, un angle, une audience, rejeter une créa,
 * créer un sous-agent, proposer un concurrent. Les décisions qui toucheraient
 * la régie (budget, pause, activation) et leur exécution arriveront avec la
 * phase 2, et leur migration.
 *
 * `executee` : le code l'a appliquée dans le support. `proposee` : elle attend
 * un humain (tout ce qui toucherait Meta). `bloquee` : un garde-fou l'a refusée,
 * et `guardrail` dit lequel.
 */
export const DECISION_KINDS = [
  { label: "Répartition du budget", value: "repartition-budget" },
  { label: "Positionnement", value: "positionnement" },
  { label: "Angle", value: "angle" },
  { label: "Audience", value: "audience" },
  { label: "Rejet du contrôleur", value: "rejet-controleur" },
  { label: "Création d'un sous-agent", value: "creation-sous-agent" },
  { label: "Concurrent proposé", value: "concurrent" },
] as const;

export type DecisionKind = (typeof DECISION_KINDS)[number]["value"];

export const DECISION_STATUSES = [
  { label: "Proposée", value: "proposee" },
  { label: "Exécutée", value: "executee" },
  { label: "Bloquée", value: "bloquee" },
] as const;

export type DecisionStatus = (typeof DECISION_STATUSES)[number]["value"];

export const AdDecisions: CollectionConfig = {
  slug: "ad-decisions",
  labels: { singular: "Décision", plural: "Décisions" },
  admin: {
    useAsTitle: "rationale",
    defaultColumns: ["createdAt", "campaign", "kind", "status", "rationale"],
    group: "Publicité",
    description: "Ce que les agents ont décidé, et pourquoi. Écrit par le serveur.",
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-createdAt",
  fields: [
    {
      type: "row",
      fields: [
        { name: "campaign", type: "relationship", relationTo: "ad-campaigns", label: "Campagne", required: true, index: true, admin: { width: "50%" } },
        { name: "run", type: "relationship", relationTo: "ad-agent-runs", label: "Passage", index: true, admin: { width: "50%" } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "agent", type: "relationship", relationTo: "ad-agents", label: "Agent", admin: { width: "50%" } },
        { name: "step", type: "relationship", relationTo: "ad-agent-steps", label: "Étape", admin: { width: "50%" } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "kind", type: "select", label: "Type", options: [...DECISION_KINDS], required: true, index: true, admin: { width: "50%" } },
        { name: "status", type: "select", label: "État", options: [...DECISION_STATUSES], required: true, index: true, admin: { width: "50%" } },
      ],
    },
    { name: "rationale", type: "textarea", label: "Pourquoi", required: true },
    { name: "before", type: "json", label: "Avant" },
    { name: "after", type: "json", label: "Décidé", admin: { description: "Les valeurs structurées de la décision (montants, audience, angle…)." } },
    { name: "guardrail", type: "text", label: "Garde-fou déclenché" },
  ],
};
