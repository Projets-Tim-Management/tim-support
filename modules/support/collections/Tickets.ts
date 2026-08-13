import type { CollectionConfig, Condition } from "payload";

import { canSupport, isAdmin } from "@/core/access";
import { referenceNumber } from "@/core/fields/referenceNumber";
import { stampResolvedAt } from "@/modules/support/hooks/resolved-at";

/**
 * Le formulaire de CRÉATION et la fiche d'un ticket existant n'affichent pas les
 * mêmes champs : à l'ouverture il faut saisir le sujet et la demande, alors que
 * sur un ticket existant ces deux champs sont rendus par le fil de conversation.
 *
 * `condition` plutôt que `hidden` : un champ masqué par condition CONSERVE sa
 * valeur à l'enregistrement (il n'est ni vidé ni revalidé), il n'est simplement
 * pas rendu — c'est ce qui permet de garder `required` sans bloquer les
 * enregistrements suivants.
 */
const onCreate: Condition = (_data, _siblingData, { operation }) => operation === "create";
const onEdit: Condition = (_data, _siblingData, { operation }) => operation === "update";

/**
 * Tickets de support.
 *
 * Trois origines : le formulaire de contact du front, les e-mails entrants
 * (webhook) et le back-office — admin et support peuvent ouvrir un ticket
 * eux-mêmes, pour tracer une demande reçue par téléphone ou de vive voix.
 *
 * La vue d'édition est présentée comme une page de support : la colonne principale
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
    // Ordre voulu par l'équipe : on trie d'abord par urgence (priorité, statut),
    // puis on lit de quoi il s'agit (sujet) et pour qui (entreprise avant nom —
    // deux demandeurs d'une même société se regroupent à l'œil).
    // « Service » et « Alertes » ne sont pas dans le tableau : le premier est un
    // critère de tri interne, le second reste disponible via le bouton
    // « Colonnes » — les deux champs existent toujours.
    defaultColumns: ["number", "priority", "status", "subject", "company", "name", "createdAt"],
    listSearchableFields: ["subject", "email", "name", "company", "number"],
    group: "Support",
    components: {
      // Vues rapides (Nouveaux / En cours / Résolus / Urgents) au-dessus du tableau.
      beforeListTable: ["/modules/support/admin/TicketListFilters#TicketListFilters"],
    },
  },
  // Création : formulaire de contact (Local API), e-mail entrant, ET back-office
  // pour l'admin comme pour le support — une demande arrivée par téléphone doit
  // pouvoir être tracée. Pas de « Dupliquer » pour autant : un ticket est unique.
  access: {
    read: canSupport,
    create: canSupport,
    update: canSupport,
    delete: isAdmin,
  },
  disableDuplicate: true,
  defaultSort: "-createdAt", // les plus récents en premier
  hooks: { beforeChange: [stampResolvedAt] },
  fields: [
    // ─── Colonne principale : deux onglets sur un ticket existant ────────────
    // « Conversation » (le fil + la réponse) et « E-mails » (ce que Brevo sait
    // des envois : remis, ouvert, cliqué…). Les onglets ne s'affichent pas à la
    // création : il n'y a encore ni fil ni envoi.
    {
      type: "tabs",
      admin: { condition: onEdit },
      tabs: [
        {
          label: "Conversation",
          fields: [
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
          ],
        },
        {
          label: "E-mails",
          fields: [
            {
              name: "emailActivity",
              type: "ui",
              admin: {
                components: {
                  Field: "/modules/support/admin/TicketEmails#TicketEmails",
                },
              },
            },
          ],
        },
      ],
    },
    // ─── Saisis à l'ouverture, puis rendus par le fil de conversation ─────────
    {
      name: "subject",
      type: "text",
      label: "Sujet",
      required: true,
      admin: { condition: onCreate, placeholder: "Objet de la demande" },
    },
    {
      name: "description",
      type: "textarea",
      label: "Demande",
      required: true,
      admin: {
        condition: onCreate,
        placeholder: "Ce que le client demande, dans ses mots si possible.",
      },
    },
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
        // Destinataires en copie de CET envoi, tels que saisis au moment de la
        // réponse (liste séparée par des virgules). Conservés ici plutôt que
        // déduits de Brevo : c'est un fait de notre envoi, il doit rester lisible
        // au-delà des 90 jours d'historique de l'API.
        { name: "cc", type: "text", label: "En copie" },
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
    // Identité du demandeur. `name` (Nom) existait déjà ; prénom et entreprise
    // sont facultatifs — un ticket ne doit jamais être bloqué par ces champs,
    // et les demandes arrivées par e-mail n'en ont pas.
    {
      type: "row",
      admin: { position: "sidebar" },
      fields: [
        { name: "name", type: "text", label: "Nom", admin: { width: "50%" } },
        { name: "firstName", type: "text", label: "Prénom", admin: { width: "50%" } },
      ],
    },
    { name: "company", type: "text", label: "Entreprise", admin: { position: "sidebar" } },
    {
      name: "url",
      type: "text",
      label: "Page concernée",
      admin: {
        position: "sidebar",
        // Même liste que le formulaire public (catégories de features, Web /
        // Mobile) au lieu d'une URL à taper à la main.
        components: { Field: "/modules/support/admin/TicketPageSelect#TicketPageSelect" },
      },
    },
    {
      name: "attachments",
      type: "upload",
      relationTo: "media",
      hasMany: true,
      maxRows: 5,
      label: "Pièces jointes",
      admin: {
        position: "sidebar",
        // Galerie en lecture seule des pièces envoyées par le client : rien à
        // montrer sur un ticket qu'on est en train d'ouvrir.
        condition: onEdit,
        components: {
          Field: "/modules/support/admin/TicketAttachments#TicketAttachments",
        },
      },
    },
    // Parcours marketing à l'origine du ticket, quand il y en a un : le client a
    // répondu à un e-mail de sa phase de test (adresse `run-<id>@…`, voir
    // modules/marketing/lib/reply-routing). Un prospect en essai ne se traite pas
    // comme une demande d'assistance ordinaire — savoir d'où vient le message
    // change qui répond, et à quelle vitesse.
    // Modifiable : le support doit pouvoir rattacher à la main un ticket ouvert
    // par téléphone pendant un test.
    {
      name: "journeyRun",
      type: "relationship",
      relationTo: "journey-runs",
      label: "Phase de test",
      index: true,
      admin: {
        position: "sidebar",
        condition: onEdit,
        description: "Parcours dont ce ticket est issu.",
      },
    },
    {
      name: "resolvedAt",
      type: "date",
      label: "Résolu le",
      index: true, // filtré + trié par le cron de purge
      admin: { position: "sidebar", readOnly: true, condition: onEdit },
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
    // IP + User-Agent côte à côte (technique) — relevés par le formulaire du
    // front, donc sans objet sur un ticket ouvert depuis le back-office.
    {
      type: "row",
      admin: { position: "sidebar", condition: onEdit },
      fields: [
        { name: "ip", type: "text", label: "IP", admin: { readOnly: true } },
        { name: "userAgent", type: "text", label: "User-Agent", admin: { readOnly: true } },
      ],
    },
  ],
};
