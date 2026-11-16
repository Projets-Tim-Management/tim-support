import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";

/**
 * LA PHOTO DU PLAN DE SITE d'un concurrent, chaque semaine (équipe SEO/GEO,
 * étape 3, 12/11/2026 : « qui regarde le site map des concurrents pour voir
 * quelle page sur quelle thématique ils vont ? »). Lue par le code, sans IA :
 * la liste des pages (et leur date de mise à jour quand le site la donne).
 * Deux photos de suite disent ce qui a été ajouté ou retiré.
 *
 * Écrite par le serveur seul, lue par la direction seule.
 */
export const AiTeamCompetitorMaps: CollectionConfig = {
  slug: "ai-team-competitor-maps",
  labels: { singular: "Plan de site d'un concurrent", plural: "Plans de site des concurrents" },
  admin: { useAsTitle: "week", defaultColumns: ["createdAt", "competitor", "week", "status", "count"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: () => false, delete: () => false },
  defaultSort: "-createdAt",
  fields: [
    { name: "competitor", type: "relationship", relationTo: "ad-competitors", label: "Concurrent", required: true, index: true },
    { name: "week", type: "text", label: "Semaine (lundi)", required: true, index: true },
    {
      name: "status",
      type: "select",
      label: "Lecture",
      required: true,
      options: [
        { label: "Lu", value: "lu" },
        { label: "Illisible", value: "illisible" },
      ],
    },
    { name: "count", type: "number", label: "Pages" },
    { name: "urls", type: "json", label: "Pages (adresse, mise à jour)" },
    { name: "added", type: "json", label: "Ajoutées depuis la photo précédente" },
    { name: "removed", type: "json", label: "Retirées depuis la photo précédente" },
    { name: "error", type: "textarea", label: "Pourquoi illisible" },
  ],
};
