import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { tokensGroup } from "@/modules/ads/collections/AdAgentRuns";

/**
 * Agents d'un passage (plan Publicité, §9 quater, point 2) — un nœud de
 * l'arbre : l'orchestrateur, et chaque sous-agent qu'il crée.
 *
 * Le rôle est une liste fermée (un enum : en ajouter un coûte une migration,
 * c'est voulu). Les outils, eux, sont une liste de noms en JSON : le registre
 * des outils vit dans le code, et c'est lui qui refuse un outil non autorisé
 * pour le rôle — le schéma n'a pas à suivre chaque outil ajouté.
 */
export const AGENT_ROLES = [
  { label: "Orchestrateur", value: "orchestrateur" },
  { label: "Stratège", value: "stratege" },
  { label: "Rédacteur", value: "redacteur" },
  { label: "Directeur artistique", value: "directeur-artistique" },
  { label: "Contrôleur", value: "controleur" },
  { label: "Analyste", value: "analyste" },
] as const;

export type AgentRole = (typeof AGENT_ROLES)[number]["value"];

export const AGENT_STATUSES = [
  { label: "En attente", value: "en-attente" },
  { label: "En cours", value: "en-cours" },
  { label: "Terminé", value: "termine" },
  { label: "Échoué", value: "echoue" },
  { label: "Arrêté", value: "arrete" },
] as const;

export type AgentStatus = (typeof AGENT_STATUSES)[number]["value"];

export const AdAgents: CollectionConfig = {
  slug: "ad-agents",
  labels: { singular: "Agent", plural: "Agents" },
  admin: {
    useAsTitle: "mission",
    defaultColumns: ["run", "role", "mission", "status", "spentEur"],
    group: "Publicité",
    hidden: true,
    description: "Les agents d'un passage, du plus haut au plus bas. Écrit par le serveur ; se lit dans la salle de contrôle.",
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "createdAt",
  fields: [
    { name: "run", type: "relationship", relationTo: "ad-agent-runs", label: "Passage", required: true, index: true },
    { name: "parent", type: "relationship", relationTo: "ad-agents", label: "Créé par", index: true },
    {
      type: "row",
      fields: [
        { name: "role", type: "select", label: "Rôle", options: [...AGENT_ROLES], required: true, admin: { width: "34%" } },
        { name: "depth", type: "number", label: "Profondeur", required: true, min: 0, admin: { width: "33%" } },
        { name: "status", type: "select", label: "État", options: [...AGENT_STATUSES], defaultValue: "en-attente", required: true, index: true, admin: { width: "33%" } },
      ],
    },
    { name: "mission", type: "textarea", label: "Mission", required: true },
    { name: "tools", type: "json", label: "Outils autorisés", admin: { description: "Noms d'outils, vérifiés contre le registre du rôle." } },
    {
      type: "row",
      fields: [
        { name: "model", type: "text", label: "Modèle", required: true, admin: { width: "34%" } },
        { name: "budgetEur", type: "number", label: "Budget réservé (€)", required: true, admin: { width: "33%" } },
        { name: "spentEur", type: "number", label: "Dépensé (€)", defaultValue: 0, admin: { width: "33%" } },
      ],
    },
    tokensGroup(),
    { name: "result", type: "json", label: "Résultat", admin: { description: "Ce que l'agent a rendu à son parent." } },
    { name: "error", type: "text", label: "Motif d'échec" },
  ],
};
