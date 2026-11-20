import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";
import { HORIZONS, TEAM_OPTIONS } from "@/modules/ai-team/lib/roadmap-constants";

/**
 * LES OBJECTIFS À HORIZON de la feuille de route (14/11/2026) — court terme
 * (3 mois), moyen terme (6 mois), long terme (12 mois), pour l'équipe SEA
 * (Mark) et l'équipe SEO/GEO (Sergey).
 *
 * Deux sortes (14/11/2026, après relecture de la direction) : CHIFFRÉ — un
 * indicateur, une cible, une échéance — ou JALON — un livrable daté (« chaîne
 * YouTube lancée fin janvier »), coché « atteint » à la main. La direction en
 * fixe elle-même (bouton « + Objectif ») ; les chefs en proposent aussi.
 *
 * Un objectif chiffré suit UN indicateur (lib/roadmap-metrics) : son point de départ
 * (la valeur le jour où il est proposé), sa cible, son échéance. Le chef le
 * PROPOSE dans sa revue, chiffres à l'appui ; la direction l'accepte, le
 * corrige ou le refuse — accepté, il devient la référence, et le chef en fait le
 * point chaque mois.
 *
 * UN SEUL OBJECTIF VIVANT PAR INDICATEUR (16/11/2026 : « inutile de doubler les
 * objectifs ») : le suivant ne se propose qu'une fois le premier atteint ou
 * manqué, revu à la hausse ou à la baisse, et pourquoi. Personne ne coche
 * « atteint » : l'objectif chiffré l'est tout seul, le jalon par son chef.
 */
export const GOAL_STATUSES = [
  { label: "Proposé par un chef", value: "propose" },
  { label: "En cours", value: "valide" },
  { label: "Atteint", value: "atteint" },
  { label: "Manqué", value: "manque" },
  { label: "Refusé ou abandonné", value: "abandonne" },
] as const;

export const AiTeamGoals: CollectionConfig = {
  slug: "ai-team-goals",
  labels: { singular: "Objectif de la feuille de route", plural: "Objectifs de la feuille de route" },
  admin: { useAsTitle: "title", defaultColumns: ["team", "horizon", "title", "status", "dueDate"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: isDirectionAccess, delete: isDirectionAccess },
  defaultSort: "dueDate",
  fields: [
    {
      type: "row",
      fields: [
        {
          name: "team",
          type: "select",
          label: "Équipe",
          required: true,
          index: true,
          options: TEAM_OPTIONS,
          admin: { width: "33%" },
        },
        { name: "horizon", type: "select", label: "Horizon", required: true, options: HORIZONS.map(({ value, label }) => ({ value, label })), admin: { width: "33%" } },
        { name: "status", type: "select", label: "État", required: true, defaultValue: "propose", index: true, options: [...GOAL_STATUSES], admin: { width: "34%" } },
      ],
    },
    { name: "title", type: "text", label: "Objectif", required: true },
    {
      name: "kind",
      type: "select",
      label: "Sorte",
      required: true,
      defaultValue: "chiffre",
      options: [
        { label: "Chiffré (un indicateur, une cible)", value: "chiffre" },
        { label: "Jalon (un livrable daté)", value: "jalon" },
      ],
    },
    // L'indicateur : une clé du catalogue (lib/indicators-meta) — en texte, pour que le catalogue grandisse sans migration.
    { name: "metric", type: "text", label: "Indicateur suivi (objectif chiffré)", admin: { description: "Clé du catalogue des indicateurs : mrr, leads-30j, clics-google, vues-page, manuel…" } },
    { name: "param", type: "text", label: "Paramètre de l'indicateur (la page suivie)" },
    // La courbe propre à l'objectif : le passé (si l'indicateur en a un), le relevé de chaque semaine, les saisies.
    { name: "measures", type: "json", label: "Mesures (date, valeur)" },
    {
      type: "row",
      fields: [
        { name: "baseline", type: "number", label: "Point de départ", admin: { width: "33%" } },
        { name: "target", type: "number", label: "Cible (objectif chiffré)", admin: { width: "33%" } },
        { name: "dueDate", type: "date", label: "Échéance", required: true, admin: { width: "34%", date: { pickerAppearance: "dayOnly" } } },
      ],
    },
    { name: "why", type: "textarea", label: "Pourquoi cette cible (chiffres à l'appui)" },
    { name: "member", type: "relationship", relationTo: "ai-team-members", label: "Proposé par (chef)" },
    { name: "author", type: "relationship", relationTo: "users", label: "Fixé par (direction)" },
    { name: "startDate", type: "date", label: "Point de départ mesuré le" },
    { name: "validatedAt", type: "date", label: "Validé le" },
    // Atteint (16/11/2026) : tout seul, dès que l'indicateur touche la cible (relevé par le support) ; un jalon, par son
    // chef, preuve à l'appui. « Fêté » : la direction a vu le feu d'artifice.
    {
      type: "row",
      fields: [
        { name: "reachedAt", type: "date", label: "Atteint le", admin: { width: "50%", readOnly: true, date: { pickerAppearance: "dayAndTime" } } },
        { name: "celebratedAt", type: "date", label: "Fêté le", admin: { width: "50%", readOnly: true, date: { pickerAppearance: "dayAndTime" } } },
      ],
    },
    { name: "review", type: "textarea", label: "Le point du mois (le chef)" },
    { name: "reviewedAt", type: "date", label: "Point fait le" },
  ],
};
