import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";

/**
 * LES RÉPONSES DES IA lues par Georges (Visibilité IA, équipe SEO/GEO, étape
 * 5, 12/11/2026) : une ligne par question, par IA et par tirage, chaque mois —
 * TIM nommé ou non, cité en source ou non, son rang, les marques nommées, les
 * sources, et le début de la réponse (pour vérifier).
 *
 * Écrites par le serveur seul, lues par la direction seule.
 */
export const AiTeamAiAnswers: CollectionConfig = {
  slug: "ai-team-ai-answers",
  labels: { singular: "Réponse d'IA (équipe IA)", plural: "Réponses des IA (équipe IA)" },
  admin: { useAsTitle: "question", defaultColumns: ["createdAt", "period", "engine", "question", "mentioned", "cited"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-createdAt",
  fields: [
    { name: "member", type: "relationship", relationTo: "ai-team-members", label: "Mesuré par", required: true },
    { name: "period", type: "text", label: "Mois (AAAA-MM)", required: true, index: true },
    {
      name: "engine",
      type: "select",
      label: "IA",
      required: true,
      options: [
        { label: "ChatGPT", value: "chatgpt" },
        { label: "Perplexity", value: "perplexity" },
        { label: "Gemini", value: "gemini" },
        { label: "Claude", value: "claude" },
      ],
    },
    { name: "question", type: "text", label: "Question (identifiant du panel)", required: true },
    { name: "draw", type: "number", label: "Tirage", required: true },
    {
      name: "status",
      type: "select",
      label: "État",
      required: true,
      options: [
        { label: "Lue", value: "fait" },
        { label: "Échec", value: "echec" },
      ],
    },
    { name: "mentioned", type: "checkbox", label: "TIM nommé" },
    { name: "cited", type: "checkbox", label: "TIM cité en source" },
    { name: "position", type: "number", label: "Rang de TIM parmi les marques nommées" },
    { name: "brands", type: "json", label: "Marques nommées (dans l'ordre)" },
    { name: "sources", type: "json", label: "Sources" },
    { name: "model", type: "text", label: "Modèle" },
    { name: "searches", type: "number", label: "Recherches" },
    { name: "excerpt", type: "textarea", label: "Début de la réponse" },
    { name: "costEur", type: "number", label: "Coût (€)" },
    { name: "error", type: "textarea", label: "Erreur" },
  ],
};
