import type { CollectionConfig } from "payload";

import { hideUnlessDirection, isDirectionAccess } from "@/core/access";

/**
 * LE CARNET D'UN CHEF de l'équipe IA (14/11/2026) — ce qu'il retient, comme
 * une vraie personne : ses décisions, ses consignes à son équipe, ses
 * convictions tirées des chiffres, les points à suivre, et les idées de la
 * direction avec ce qu'il en a fait (retenue, à tester, écartée — ou imposée
 * par la direction, son désaccord noté).
 *
 * Écrit par le chef lui-même (conversation, revue du lundi, objectifs de la
 * semaine), relu à chacun de ses échanges et de ses revues ; il le fait évoluer
 * quand les chiffres changent, et chaque changement garde sa raison
 * (`history`). Une consigne active est jointe aux missions de l'agent visé.
 * La direction le lit sur la fiche du chef, et peut corriger ou retirer.
 */
export const NOTE_KINDS = [
  { label: "Décision", value: "decision" },
  { label: "Consigne à l'équipe", value: "consigne" },
  { label: "Conviction", value: "conviction" },
  { label: "À suivre", value: "suivi" },
  { label: "Idée de la direction", value: "idee" },
] as const;

export const IDEA_VERDICTS = [
  { label: "Retenue", value: "retenue" },
  { label: "À tester", value: "a-tester" },
  { label: "Écartée", value: "ecartee" },
  { label: "Imposée par la direction", value: "imposee" },
] as const;

export const NOTE_STATUSES = [
  { label: "En cours", value: "active" },
  { label: "Terminée", value: "terminee" },
  { label: "Abandonnée", value: "abandonnee" },
] as const;

export const AiTeamNotes: CollectionConfig = {
  slug: "ai-team-notes",
  labels: { singular: "Note du carnet (équipe IA)", plural: "Carnets des chefs (équipe IA)" },
  admin: { useAsTitle: "text", defaultColumns: ["member", "kind", "text", "status", "updatedAt"], group: "Agent", hidden: hideUnlessDirection },
  access: { read: isDirectionAccess, create: () => false, update: isDirectionAccess, delete: isDirectionAccess },
  defaultSort: "-updatedAt",
  fields: [
    { name: "member", type: "relationship", relationTo: "ai-team-members", label: "Chef", required: true, index: true },
    { name: "kind", type: "select", label: "Sorte", required: true, options: [...NOTE_KINDS] },
    { name: "text", type: "textarea", label: "Note", required: true },
    { name: "reason", type: "textarea", label: "Pourquoi" },
    { name: "target", type: "relationship", relationTo: "ai-team-members", label: "Consigne pour", index: true },
    { name: "verdict", type: "select", label: "Ce qu'il a fait de l'idée", options: [...IDEA_VERDICTS] },
    { name: "disagreement", type: "textarea", label: "Son désaccord, et ce qu'il surveillera" },
    { name: "dueAt", type: "date", label: "À revoir le" },
    { name: "status", type: "select", label: "État", required: true, defaultValue: "active", index: true, options: [...NOTE_STATUSES] },
    {
      name: "origin",
      type: "select",
      label: "Née de",
      options: [
        { label: "La conversation", value: "conversation" },
        { label: "La revue de la semaine", value: "revue" },
      ],
    },
    { name: "sourceMessage", type: "relationship", relationTo: "ai-team-messages", label: "Message d'origine" },
    {
      name: "history",
      type: "array",
      label: "Son histoire",
      fields: [
        { name: "at", type: "date", label: "Le" },
        { name: "change", type: "text", label: "Changement" },
        { name: "reason", type: "textarea", label: "Pourquoi" },
      ],
    },
  ],
};
