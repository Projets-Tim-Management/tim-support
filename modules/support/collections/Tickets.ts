import type { CollectionConfig } from "payload";

import { adminOnly } from "@/core/access";
import { referenceNumber } from "@/core/fields/referenceNumber";
import { stampResolvedAt } from "@/modules/support/hooks/resolved-at";

/**
 * Tickets de support.
 *
 * Créés par le front (formulaire de contact) via le serveur Next. La vue
 * d'édition est présentée comme une page de support : la colonne principale
 * affiche le fil de conversation (composant TicketConversation) + la zone de
 * réponse (TicketReply) + les notes internes ; la barre latérale regroupe le
 * contexte (statut, priorité, demandeur…). Les champs bruts subject/description/
 * messages restent en base mais sont masqués (rendus par la vue conversation).
 * Les notes internes ne partent jamais dans les e-mails.
 */
export const Tickets: CollectionConfig = {
  slug: "tickets",
  labels: { singular: "Ticket", plural: "Tickets" },
  admin: {
    useAsTitle: "subject",
    defaultColumns: ["number", "alerts", "subject", "name", "status", "priority", "service", "createdAt"],
    listSearchableFields: ["subject", "email", "name", "number"],
    group: "Support",
    components: {
      // Vues rapides (Nouveaux / En cours / Résolus / Urgents) au-dessus du tableau.
      beforeListTable: ["/modules/support/admin/TicketListFilters#TicketListFilters"],
    },
  },
  // Les tickets ne se créent QUE via le formulaire de contact (Local API, qui
  // outrepasse l'accès). Dans l'admin : pas de bouton « Créer », pas de
  // « Dupliquer » — on ne fait que consulter/traiter les tickets existants.
  access: { ...adminOnly, create: () => false },
  disableDuplicate: true,
  defaultSort: "-createdAt", // les plus récents en premier
  hooks: { beforeChange: [stampResolvedAt] },
  fields: [
    // ─── Colonne principale : conversation, réponse, notes ───────────────────
    {
      name: "conversationView",
      type: "ui",
      admin: {
        components: {
          Field: "/modules/support/admin/TicketConversation#TicketConversation",
        },
      },
    },
    {
      name: "replyBox",
      type: "ui",
      admin: {
        components: {
          Field: "/modules/support/admin/TicketReply#TicketReply",
        },
      },
    },
    // ─── Champs affichés dans le fil (masqués du formulaire) ──────────────────
    { name: "subject", type: "text", label: "Sujet", required: true, admin: { hidden: true } },
    { name: "description", type: "textarea", label: "Description", required: true, admin: { hidden: true } },
    {
      name: "messages",
      type: "array",
      label: "Conversation",
      labels: { singular: "Message", plural: "Messages" },
      admin: { hidden: true },
      fields: [
        {
          name: "author",
          type: "select",
          label: "Auteur",
          defaultValue: "client",
          options: [
            { label: "Client", value: "client" },
            { label: "Support", value: "support" },
          ],
        },
        { name: "body", type: "textarea", label: "Message" },
        { name: "sentAt", type: "date", label: "Reçu le" },
        {
          name: "attachments",
          type: "upload",
          relationTo: "media",
          hasMany: true,
          label: "Pièces jointes",
          admin: { components: { Field: "/admin/fields/DirectUpload#default" } },
        },
      ],
    },

    // ─── Barre latérale : contexte ────────────────────────────────────────────
    // Numéro masqué ici (déjà affiché dans l'en-tête du fil) — valeur toujours
    // générée automatiquement par le hook du champ.
    { ...referenceNumber, admin: { ...referenceNumber.admin, hidden: true } },
    // Statut + priorité côte à côte (gain de place).
    {
      type: "row",
      admin: { position: "sidebar" },
      fields: [
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
          admin: {
            components: {
              Field: "/modules/support/admin/ColoredSelectField#ColoredSelectField",
              Cell: "/modules/support/admin/ColoredCell#ColoredCell",
            },
          },
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
          index: true, // filtré (vue « Urgents ») + compté + colonne
          admin: {
            components: {
              Field: "/modules/support/admin/ColoredSelectField#ColoredSelectField",
              Cell: "/modules/support/admin/ColoredCell#ColoredCell",
            },
          },
        },
      ],
    },
    // Type + service côte à côte.
    {
      type: "row",
      admin: { position: "sidebar" },
      fields: [
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
          admin: {
            components: {
              Field: "/modules/support/admin/ColoredSelectField#ColoredSelectField",
              Cell: "/modules/support/admin/ColoredCell#ColoredCell",
            },
          },
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
          admin: {
            components: {
              Field: "/modules/support/admin/ColoredSelectField#ColoredSelectField",
              Cell: "/modules/support/admin/ColoredCell#ColoredCell",
            },
          },
        },
      ],
    },
    {
      name: "internalNotes",
      type: "textarea",
      label: "🔒 Notes internes (privé)",
      admin: {
        position: "sidebar",
        className: "ticket-notes",
        description: "Visible uniquement en interne — jamais inclus dans les e-mails.",
      },
    },
    { name: "email", type: "email", label: "Email", required: true, admin: { position: "sidebar" } },
    { name: "name", type: "text", label: "Nom", admin: { position: "sidebar" } },
    { name: "url", type: "text", label: "Page concernée", admin: { position: "sidebar" } },
    {
      name: "attachments",
      type: "upload",
      relationTo: "media",
      hasMany: true,
      maxRows: 5,
      label: "Pièces jointes",
      admin: {
        position: "sidebar",
        components: {
          Field: "/modules/support/admin/TicketAttachments#TicketAttachments",
        },
      },
    },
    {
      name: "resolvedAt",
      type: "date",
      label: "Résolu le",
      index: true, // filtré + trié par le cron de purge
      admin: { position: "sidebar", readOnly: true },
    },
    // Drapeau « à traiter » : true à la création et à chaque réponse client,
    // false quand le support répond ou résout. Alimente les notifications du
    // dashboard (composant TicketNotifications). Interne — masqué du formulaire.
    {
      name: "needsAttention",
      type: "checkbox",
      label: "En attente de réponse",
      defaultValue: true,
      index: true,
      admin: { hidden: true },
    },
    // Drapeau « réponse client non traitée » : true UNIQUEMENT quand le client
    // répond à un ticket existant (webhook inbound), false quand le support
    // répond / résout. Distinct de needsAttention (qui couvre aussi les nouveaux
    // tickets). Alimente les puces « réponse client » (menu, tableau, page notifs).
    {
      name: "unreadClientReply",
      type: "checkbox",
      label: "Réponse client non traitée",
      defaultValue: false,
      index: true,
      admin: { hidden: true },
    },
    // Colonne « Alertes » du tableau : puces Nouveau / Réponse client (lecture
    // seule, rendue à partir de la ligne). Pas un vrai champ stocké.
    {
      name: "alerts",
      type: "ui",
      label: "Alertes",
      admin: {
        components: {
          Cell: "/modules/support/admin/TicketAlertCell#TicketAlertCell",
        },
      },
    },
    // IP + User-Agent côte à côte (technique).
    {
      type: "row",
      admin: { position: "sidebar" },
      fields: [
        { name: "ip", type: "text", label: "IP", admin: { readOnly: true } },
        { name: "userAgent", type: "text", label: "User-Agent", admin: { readOnly: true } },
      ],
    },
  ],
};
