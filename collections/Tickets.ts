import type { CollectionConfig } from "payload";

import { adminOnly } from "./access";
import { referenceNumber } from "../fields/referenceNumber";

/**
 * Tickets de support (CPT `support_ticket` côté WP).
 *
 * Créés par le front (formulaire de contact) via le serveur Next. Le poids de
 * priorité (tri) et la purge automatique des pièces jointes seront rebranchés
 * en Phase 5. Les notes internes ne partent jamais dans les e-mails.
 */
export const Tickets: CollectionConfig = {
  slug: "tickets",
  labels: { singular: "Ticket", plural: "Tickets" },
  admin: {
    useAsTitle: "subject",
    defaultColumns: ["number", "subject", "type", "status", "priority"],
    group: "Support",
  },
  access: adminOnly,
  fields: [
    referenceNumber,
    { name: "subject", type: "text", label: "Sujet", required: true },
    { name: "description", type: "textarea", label: "Description", required: true },
    {
      name: "type",
      type: "select",
      label: "Type",
      defaultValue: "assistance",
      options: [
        { label: "Assistance", value: "assistance" },
        { label: "Suggestion", value: "suggestion" },
        { label: "Autre", value: "autre" },
      ],
    },
    { name: "email", type: "email", label: "Email", required: true },
    { name: "name", type: "text", label: "Nom" },
    {
      name: "url",
      type: "text",
      label: "Page concernée",
      admin: { position: "sidebar" },
    },
    {
      name: "service",
      type: "select",
      label: "Service",
      options: [
        { label: "Technique", value: "technique" },
        { label: "Facturation", value: "facturation" },
        { label: "Support", value: "support" },
        { label: "Commercial", value: "commercial" },
        { label: "Autre", value: "autre" },
      ],
      admin: { position: "sidebar" },
    },
    {
      name: "status",
      type: "select",
      label: "Statut",
      defaultValue: "new",
      options: [
        { label: "Nouveau", value: "new" },
        { label: "Pris en compte", value: "acknowledged" },
        { label: "En cours", value: "in_progress" },
        { label: "En attente", value: "on_hold" },
        { label: "Résolu", value: "resolved" },
      ],
      index: true,
    },
    {
      name: "priority",
      type: "select",
      label: "Priorité",
      defaultValue: "normal",
      options: [
        { label: "Urgente", value: "urgent" },
        { label: "Haute", value: "high" },
        { label: "Normale", value: "normal" },
        { label: "Basse", value: "low" },
      ],
      index: true,
    },
    {
      name: "attachments",
      type: "upload",
      relationTo: "media",
      hasMany: true,
      maxRows: 5,
      label: "Pièces jointes",
    },
    {
      name: "resolvedAt",
      type: "date",
      label: "Résolu le",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "ip",
      type: "text",
      label: "IP",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "userAgent",
      type: "text",
      label: "User-Agent",
      admin: { position: "sidebar", readOnly: true },
    },
    {
      name: "internalNotes",
      type: "textarea",
      label: "Notes internes",
      admin: { description: "Jamais inclus dans les e-mails." },
    },
  ],
};
