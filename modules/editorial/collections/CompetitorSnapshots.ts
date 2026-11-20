import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * LES ANALYSES DE CONCURRENTS (étape 4 du module de note, 19/11/2026) : pour une
 * requête, le top 10 de google.fr à une date (DataForSEO), le texte principal de
 * chaque page, les « Autres questions posées », et le corpus calculé (termes
 * recommandés et fourchettes, longueur et nombre de H2 médians, note de chaque
 * concurrent). Une analyse est réutilisée 7 jours ; une nouvelle version des règles
 * ne relance AUCUN appel : les instantanés sont réutilisés.
 *
 * Écrites seulement par le code ; lisibles des administrateurs.
 */
export const CompetitorSnapshots: CollectionConfig = {
  slug: "competitor-snapshots",
  labels: { singular: "Analyse de concurrents", plural: "Analyses de concurrents" },
  admin: {
    useAsTitle: "keyword",
    defaultColumns: ["keyword", "takenAt", "validPages", "domains", "costUsd"],
    group: "Éditorial",
    hidden: true,
    description: "Le top 10 de Google sur chaque requête suivie, et ce qu'en tire le comparateur.",
  },
  access: { read: isAdmin, create: () => false, update: () => false, delete: isAdmin },
  defaultSort: "-takenAt",
  fields: [
    { name: "keyword", type: "text", label: "Requête", required: true },
    { name: "keywordKey", type: "text", required: true, index: true, admin: { hidden: true } },
    { name: "takenAt", type: "date", label: "Relevé le", required: true, index: true },
    { name: "costUsd", type: "number", label: "Coût ($)" },
    { name: "validPages", type: "number", label: "Pages exploitables" },
    { name: "domains", type: "number", label: "Domaines" },
    { name: "checkUrl", type: "text", label: "Page Google relevée" },
    { name: "serp", type: "json", label: "Résultats (rang, adresse, domaine, titre)" },
    { name: "questions", type: "json", label: "Autres questions posées" },
    { name: "pages", type: "json", label: "Pages (texte principal, titres, motif d'exclusion, note)" },
    { name: "corpus", type: "json", label: "Corpus (termes, fourchettes, médianes)" },
  ],
};
