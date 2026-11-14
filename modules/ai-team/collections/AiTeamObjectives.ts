import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";
import { REQUEST_OUTCOMES } from "@/modules/ai-team/lib/requests";

export const OBJECTIVE_STATUSES = [
  { label: "À faire", value: "a-faire" },
  { label: "Fait", value: "fait" },
  // Pas fini à la revue suivante : Serge le reprend s'il reste parmi les plus importants.
  { label: "Reporté", value: "reporte" },
  { label: "Abandonné", value: "abandonne" },
] as const;
export type ObjectiveStatus = (typeof OBJECTIVE_STATUSES)[number]["value"];

export const OBJECTIVE_EVIDENCE = [
  { label: "Prouvé", value: "prouve" },
  { label: "Corrélé", value: "correle" },
  { label: "Spéculatif", value: "speculatif" },
] as const;

/**
 * LES OBJECTIFS DE LA SEMAINE d'un chef de l'équipe IA pour la direction
 * (équipe SEO/GEO, étape 1, 12/11/2026 : « je veux des objectifs à me faire
 * faire : on a analysé que telle page se positionne mal à cause de ça, par
 * rapport au numéro 1 qui fait ça ; il faut donc avant la fin de semaine faire
 * ça — et je coche au fur et à mesure ; on peut même planifier mes créneaux »).
 *
 * Fixés chaque lundi par Serge, dans le temps dont dispose la direction,
 * classés par importance. Chaque étape se coche ; un prompt prêt l'accompagne
 * quand il y a quelque chose à écrire. Le créneau posé dans l'agenda de la
 * direction est gardé (pour le déplacer ou l'annuler).
 *
 * Écrits par le serveur seul (revue du lundi, route de la case à cocher) ; lus
 * par la direction seule.
 */
export const AiTeamObjectives: CollectionConfig = {
  slug: "ai-team-objectives",
  labels: { singular: "Objectif de la semaine", plural: "Objectifs de la semaine" },
  admin: { useAsTitle: "title", defaultColumns: ["week", "rank", "title", "status", "dueDate"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-week",
  fields: [
    { name: "member", type: "relationship", relationTo: "ai-team-members", label: "Fixé par", required: true, index: true },
    {
      type: "row",
      fields: [
        // Le premier jour du plan (cinq jours ouvrés) — le lundi pour la revue du lundi.
        { name: "week", type: "text", label: "Plan à partir du", required: true, index: true, admin: { width: "34%" } },
        { name: "rank", type: "number", label: "Ordre d'importance", required: true, admin: { width: "33%" } },
        { name: "status", type: "select", label: "État", options: [...OBJECTIVE_STATUSES], defaultValue: "a-faire", required: true, index: true, admin: { width: "33%" } },
      ],
    },
    { name: "title", type: "text", label: "Objectif", required: true },
    { name: "page", type: "text", label: "Page ou canal concerné" },
    { name: "diagnosis", type: "textarea", label: "Ce qu'on a vu (chiffres à l'appui)" },
    { name: "benchmark", type: "textarea", label: "Ce que fait le mieux classé" },
    { name: "why", type: "textarea", label: "Pourquoi maintenant, ce qu'on y gagne" },
    { name: "measure", type: "text", label: "Ce qu'on mesurera" },
    { name: "evidence", type: "select", label: "Niveau de preuve", options: [...OBJECTIVE_EVIDENCE] },
    // Ce que l'objectif a donné (14/11/2026) : Serge le juge deux semaines après qu'il est fait, chiffres à l'appui —
    // et l'agent dont il reprend l'action en gagne des points de maîtrise (preuves, apprentissage).
    { name: "proposedBy", type: "text", label: "Action proposée par (agent)", index: true },
    { name: "outcome", type: "select", label: "Résultat", options: [...REQUEST_OUTCOMES] },
    { name: "verdict", type: "textarea", label: "Ce que les chiffres montrent" },
    { name: "verdictAt", type: "date", label: "Jugé le" },
    {
      type: "row",
      fields: [
        { name: "dueDate", type: "date", label: "À faire avant", admin: { width: "34%", date: { pickerAppearance: "dayOnly" } } },
        { name: "minutes", type: "number", label: "Durée prévue (min)", admin: { width: "33%" } },
        { name: "closedAt", type: "date", label: "Fait / abandonné le", admin: { width: "33%", date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
    {
      name: "steps",
      type: "array",
      label: "Étapes à cocher",
      fields: [
        { name: "text", type: "textarea", label: "Étape", required: true },
        { name: "minutes", type: "number", label: "Minutes" },
        { name: "prompt", type: "textarea", label: "Prompt prêt (à coller dans ChatGPT ou Claude)" },
        { name: "done", type: "checkbox", label: "Fait", defaultValue: false },
        { name: "doneAt", type: "date", label: "Cochée le" },
      ],
    },
    {
      // Les créneaux posés dans l'agenda de la direction (un objectif long peut en avoir plusieurs).
      name: "slots",
      type: "json",
      label: "Créneaux dans l'agenda",
      admin: { description: "[{ start, end, eventId, link }] — posés à la revue du lundi." },
    },
  ],
};
