import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";
import { AGENT_ROLES } from "@/modules/ads/collections/AdAgents";
import { PORTRAITS, PORTRAIT_LABELS } from "@/modules/ai-team/lib/portraits";
import { TEAM_DOMAINS, TEAM_LEVELS } from "@/modules/ai-team/lib/team";

/**
 * L'équipe d'agents IA — une fiche par personne : nom, visage, métier, chef.
 *
 * Réservée à la DIRECTION (super-admin ET direction@, voir core/access) :
 * personne d'autre ne la lit ni ne la voit dans le menu.
 *
 * On ne crée ni ne supprime une fiche ici : chacune est attachée à des rôles
 * du moteur d'agents (`engineRoles`), qui sont du code. Le jeu de départ est
 * semé au démarrage dans une base vide (modules/ai-team/lib/seed) ; la
 * direction renomme, change un visage, précise un métier.
 */
export const AiTeamMembers: CollectionConfig = {
  slug: "ai-team-members",
  labels: { singular: "Membre de l'équipe IA", plural: "Équipe IA" },
  admin: {
    useAsTitle: "name",
    defaultColumns: ["name", "jobTitle", "level", "chief"],
    group: "Équipe IA",
    hidden: hideUnlessDirection,
    description: "Les agents IA, leur nom, leur visage et leur chef. La direction ne parle qu'aux chefs ; un sous-agent répond à son chef.",
  },
  access: {
    read: isDirectionAccess,
    update: isDirectionAccess,
    create: () => false,
    delete: () => false,
  },
  defaultSort: "order",
  fields: [
    {
      // La case « en service » de l'organigramme. Coupée, le moteur n'emploie plus
      // cette personne : plus de préparation ni de suivi pour une cheffe (et donc
      // plus de missions pour son équipe), plus de mission confiée à un sous-agent.
      name: "active",
      type: "checkbox",
      label: "En service",
      defaultValue: true,
      admin: { position: "sidebar", description: "Décochée : l'agent est en pause, le moteur ne l'emploie plus." },
    },
    {
      // Le budget IA du mois de l'équipe du chef — modifiable depuis sa carte de
      // l'organigramme, appliqué par le moteur avant chaque appel payant
      // (modules/ads/lib/spend, assertAdsBudget). Vide : seul le plafond global
      // des agents s'applique.
      name: "monthlyAiBudgetEur",
      type: "number",
      label: "Budget IA du mois (€)",
      min: 0,
      admin: {
        position: "sidebar",
        condition: (data) => data?.level === "chef",
        description: "Toute son équipe : passages, missions, conversations. Le plafond global des agents (Publicité › Garde-fous) reste au-dessus.",
      },
    },
    {
      // Plus utilisée : la cible fixée par la direction (essai du 12/11/2026) a laissé place au score de
      // maîtrise (cible 100 pour tous). Colonne gardée — base partagée dev/prod, jamais de suppression.
      name: "targetValue",
      type: "number",
      label: "Cible (ancienne)",
      admin: { hidden: true },
    },
    {
      type: "row",
      fields: [
        { name: "name", type: "text", label: "Prénom", required: true, admin: { width: "34%" } },
        { name: "jobTitle", type: "text", label: "Métier", required: true, admin: { width: "66%" } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "level", type: "select", label: "Niveau", options: [...TEAM_LEVELS], required: true, admin: { width: "34%", readOnly: true } },
        { name: "domain", type: "select", label: "Domaine", options: [...TEAM_DOMAINS], required: true, admin: { width: "33%", readOnly: true } },
        {
          name: "chief",
          type: "relationship",
          relationTo: "ai-team-members",
          label: "Chef",
          admin: { width: "33%", readOnly: true, condition: (data) => data?.level === "sous-agent" },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          name: "portrait",
          type: "select",
          label: "Visage",
          options: PORTRAITS.map((p) => ({ label: PORTRAIT_LABELS[p], value: p })),
          required: true,
          admin: { width: "50%" },
        },
        {
          name: "photo",
          type: "upload",
          relationTo: "media",
          label: "Image personnalisée",
          admin: { width: "50%", description: "Facultatif : remplace le portrait illustré." },
        },
      ],
    },
    { name: "specialty", type: "textarea", label: "Ce qu'il fait", required: true },
    {
      name: "personality",
      type: "textarea",
      label: "Sa façon de parler",
      admin: { description: "Utilisée quand il s'adresse à la direction (chefs) ou dans le fil d'activité." },
    },
    {
      type: "collapsible",
      label: "Lien avec le moteur d'agents",
      admin: { initCollapsed: true },
      fields: [
        { name: "key", type: "text", label: "Identifiant", required: true, unique: true, index: true, admin: { readOnly: true } },
        {
          name: "engineRoles",
          type: "select",
          hasMany: true,
          label: "Rôles du moteur incarnés",
          options: [...AGENT_ROLES],
          // Vide pour un membre dont le travail n'est pas encore branché au moteur (Google, ChatGPT, mesure).
          admin: { readOnly: true },
        },
        { name: "order", type: "number", label: "Ordre d'affichage", admin: { readOnly: true } },
      ],
    },
  ],
};
