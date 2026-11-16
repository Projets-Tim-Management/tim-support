import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";

/**
 * LES AUDITS de l'analyste de l'équipe SEO/GEO (étape 2, 12/11/2026) : chaque
 * mois, et à la demande, l'audit du site vitrine — technique, contenu,
 * conversion — à partir de l'entonnoir de bout en bout et de PageSpeed, et la
 * lecture des pages qui comptent. Au plus 10 constats, classés par impact ;
 * Serge en tire les objectifs de la direction.
 *
 * Écrits par le serveur seul, lus par la direction seule.
 */
export const AiTeamAudits: CollectionConfig = {
  slug: "ai-team-audits",
  labels: { singular: "Audit (équipe IA)", plural: "Audits (équipe IA)" },
  admin: { useAsTitle: "period", defaultColumns: ["createdAt", "member", "period", "status", "costEur"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-createdAt",
  fields: [
    { name: "member", type: "relationship", relationTo: "ai-team-members", label: "Fait par", required: true, index: true },
    // L'audit du site (Ana, mensuel) ou le rapport de concurrence (Guy, hebdomadaire).
    {
      name: "kind",
      type: "select",
      label: "Nature",
      defaultValue: "site",
      index: true,
      options: [
        { label: "Audit du site", value: "site" },
        { label: "Concurrence", value: "concurrence" },
        { label: "Plan de contenu", value: "contenu" },
        { label: "Visibilité IA", value: "ia" },
        { label: "Contrôle technique", value: "technique" },
        { label: "Autorité", value: "autorite" },
        { label: "Réseaux & vidéo", value: "reseaux" },
        { label: "Pipeline & relances", value: "pipeline" },
        { label: "Conversion du site", value: "conversion" },
        { label: "Suivi des essais", value: "essais" },
        { label: "Santé des clients", value: "sante" },
      ],
    },
    { name: "period", type: "text", label: "Période (mois AAAA-MM, ou lundi de la semaine)", required: true, index: true },
    {
      name: "status",
      type: "select",
      label: "État",
      required: true,
      defaultValue: "en-cours",
      options: [
        { label: "En cours", value: "en-cours" },
        { label: "Fait", value: "fait" },
        { label: "Échec", value: "echec" },
      ],
    },
    { name: "summary", type: "textarea", label: "Synthèse" },
    { name: "findings", type: "json", label: "Constats" },
    { name: "funnel", type: "json", label: "Entonnoir au moment de l'audit" },
    // La mesure de visibilité dans les IA au moment du rapport de Georges.
    { name: "measure", type: "json", label: "Mesure au moment du rapport" },
    { name: "searches", type: "number", label: "Recherches web" },
    { name: "costEur", type: "number", label: "Coût (€)" },
    { name: "error", type: "textarea", label: "Erreur" },
  ],
};
