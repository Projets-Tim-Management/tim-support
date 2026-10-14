import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Le fil d'amélioration d'un élément de motion design (atelier des éléments) :
 * les idées de Charlie, les propositions de l'IA (des réglages et leur
 * explication), et ce qui en a été fait — appliquée, devenue variante,
 * écartée, ou transmise au développement quand elle dépasse les réglages.
 *
 * Écrit seulement par les routes de l'atelier : jamais par le formulaire.
 */

export const NOTE_KINDS = [
  { label: "Idée", value: "idee" },
  { label: "Proposition de l'IA", value: "proposition" },
  { label: "Décision", value: "decision" },
] as const;

export const PROPOSAL_STATUSES = [
  { label: "À décider", value: "a-decider" },
  { label: "Appliquée", value: "appliquee" },
  { label: "Devenue variante", value: "variante" },
  { label: "Écartée", value: "ecartee" },
  { label: "Hors réglages", value: "hors-reglages" },
  { label: "Transmise au développement", value: "developpement" },
] as const;

const locked = { create: () => false, update: () => false };

export const AdElementNotes: CollectionConfig = {
  slug: "ad-element-notes",
  labels: { singular: "Note d'élément", plural: "Notes d'éléments" },
  admin: { useAsTitle: "body", defaultColumns: ["element", "kind", "status", "createdAt"], group: "Publicité", hidden: true },
  access: { read: isAdmin, create: () => false, update: () => false, delete: () => false },
  defaultSort: "createdAt",
  fields: [
    { name: "element", type: "relationship", relationTo: "ad-elements", required: true, index: true, access: locked },
    { name: "kind", type: "select", options: [...NOTE_KINDS], required: true, access: locked },
    { name: "author", type: "relationship", relationTo: "users", access: locked },
    { name: "body", type: "textarea", required: true, access: locked },
    // Une proposition de l'IA : les réglages proposés, et ce qu'elle en dit.
    { name: "proposal", type: "json", access: locked },
    { name: "status", type: "select", options: [...PROPOSAL_STATUSES], index: true, access: locked },
    { name: "variant", type: "relationship", relationTo: "ad-elements", access: locked },
    { name: "development", type: "relationship", relationTo: "developments", access: locked },
    { name: "costEur", type: "number", access: locked },
  ],
};
