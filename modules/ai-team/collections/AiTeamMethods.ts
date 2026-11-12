import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";

/**
 * LA MÉTHODE d'un agent de l'équipe IA, une version par veille (B1 de
 * l'apprentissage, 12/11/2026 : « je veux créer les meilleurs agents dans
 * leurs domaines, toujours ramenés à Tim Management »).
 *
 * Chaque semaine, l'agent fait sa veille sur le web (les meilleures pratiques
 * de son domaine, les repères du marché, les nouveautés de sa plateforme) et
 * RÉÉCRIT sa méthode : ses principes, ses repères chiffrés, ce qui marche et ne
 * marche pas chez TIM, ce qu'il propose de tester. La dernière version « faite »
 * est sa méthode du moment ; les précédentes en sont l'historique.
 *
 * La règle qui la garde utile : ce qui vient du web est une IDÉE ou un REPÈRE,
 * jamais une preuve. Seuls les chiffres de TIM font entrer un point dans « ce
 * qui marche chez TIM ».
 *
 * Écrite par le serveur seul, lue par la direction seule.
 */
export const AiTeamMethods: CollectionConfig = {
  slug: "ai-team-methods",
  labels: { singular: "Méthode d'un agent IA", plural: "Méthodes des agents IA" },
  admin: { useAsTitle: "week", defaultColumns: ["createdAt", "member", "week", "status", "costEur"], group: "Équipe IA", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-createdAt",
  fields: [
    { name: "member", type: "relationship", relationTo: "ai-team-members", label: "Agent", required: true, index: true },
    { name: "week", type: "text", label: "Semaine (lundi)", required: true, index: true },
    {
      name: "status",
      type: "select",
      label: "État",
      required: true,
      defaultValue: "en-cours",
      options: [
        { label: "Veille en cours", value: "en-cours" },
        { label: "Faite", value: "faite" },
        { label: "Échec", value: "echec" },
      ],
    },
    { name: "trigger", type: "select", label: "Lancée par", options: [{ label: "Le rythme de la semaine", value: "semaine" }, { label: "La direction", value: "direction" }] },
    { name: "method", type: "textarea", label: "La méthode" },
    { name: "changes", type: "textarea", label: "Ce qui a changé cette semaine" },
    { name: "ideas", type: "json", label: "Idées à tester chez TIM" },
    { name: "sources", type: "json", label: "Sources citées" },
    { name: "benchmark", type: "json", label: "Repère du marché pour son objectif" },
    { name: "searches", type: "number", label: "Recherches web" },
    { name: "costEur", type: "number", label: "Coût (€)" },
    { name: "error", type: "textarea", label: "Erreur" },
  ],
};
