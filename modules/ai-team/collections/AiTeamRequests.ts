import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";
import { REQUEST_CHANNELS, REQUEST_KINDS, REQUEST_ORIGINS, REQUEST_OUTCOMES, REQUEST_STATUSES } from "@/modules/ai-team/lib/requests";

/**
 * Les demandes des chefs de l'équipe IA à la direction (modules/ai-team/lib/requests) :
 * « à faire » (un lien, des étapes, « C'est fait ») ou « question » (une
 * réponse texte).
 *
 * Écrites par le serveur seul : un chef les crée par l'outil « demander à la
 * direction », la direction les clôt depuis Équipe IA (route
 * /api/admin/ai-team/requests/[id]). Lues par la direction seule. Hors menu.
 */
export const AiTeamRequests: CollectionConfig = {
  slug: "ai-team-requests",
  labels: { singular: "Demande à la direction", plural: "Demandes à la direction" },
  admin: { useAsTitle: "title", defaultColumns: ["createdAt", "member", "kind", "title", "status"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-createdAt",
  fields: [
    { name: "member", type: "relationship", relationTo: "ai-team-members", label: "Chef", required: true, index: true },
    {
      type: "row",
      fields: [
        { name: "kind", type: "select", label: "Forme", options: [...REQUEST_KINDS], required: true, admin: { width: "50%" } },
        { name: "status", type: "select", label: "État", options: [...REQUEST_STATUSES], defaultValue: "ouverte", required: true, index: true, admin: { width: "50%" } },
      ],
    },
    { name: "title", type: "text", label: "Titre", required: true },
    { name: "why", type: "textarea", label: "Pourquoi", required: true },
    { name: "url", type: "text", label: "Lien" },
    { name: "steps", type: "json", label: "Étapes" },
    { name: "question", type: "textarea", label: "Question" },
    { name: "answer", type: "textarea", label: "Réponse ou mot de la direction" },
    { name: "closedAt", type: "date", label: "Close le", admin: { date: { pickerAppearance: "dayAndTime" } } },
    { name: "run", type: "relationship", relationTo: "ad-agent-runs", label: "Passage" },
    { name: "campaign", type: "relationship", relationTo: "ad-campaigns", label: "Campagne" },
    // Le suivi d'une recommandation (B2 de l'apprentissage) : d'où elle vient, sur quel canal, les chiffres
    // au moment où elle a été faite, et ce qu'elle a donné — le verdict que Margaux rend quelques semaines après.
    {
      type: "row",
      fields: [
        { name: "origin", type: "select", label: "Origine", options: [...REQUEST_ORIGINS], admin: { width: "50%" } },
        { name: "channel", type: "select", label: "Canal", options: [...REQUEST_CHANNELS], admin: { width: "50%" } },
      ],
    },
    { name: "baseline", type: "json", label: "Chiffres au moment de la recommandation" },
    { name: "proposedBy", type: "text", label: "Idée de (agent)", admin: { description: "La clé de l'agent dont l'idée est testée (son score d'apprentissage)." } },
    {
      type: "row",
      fields: [
        { name: "outcome", type: "select", label: "Ce qu'elle a donné", options: [...REQUEST_OUTCOMES], admin: { width: "50%" } },
        { name: "verdictAt", type: "date", label: "Jugée le", admin: { width: "50%", date: { pickerAppearance: "dayOnly" } } },
      ],
    },
    { name: "verdict", type: "textarea", label: "Le verdict et la leçon" },
  ],
};
