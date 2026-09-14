import type { CollectionConfig, Condition } from "payload";

import { adminOnlyField, adminOnlyFieldRead, canSupport, hasAdminRole, isAdmin } from "@/core/access";
import { documentsField } from "@/core/fields/documents";
import { referenceNumber } from "@/core/fields/referenceNumber";
import { stampDocuments } from "@/core/hooks/documents";
import { TICKET_RETENTION_DAYS } from "@/modules/support/lib/retention";
import { guardAttentionFlags, keepMessages } from "@/modules/support/hooks/keep-messages";
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
 * Onglet du suivi interne des développements : sur un ticket existant, et pour
 * un admin seulement. Le support travaille la demande du client, pas le
 * pilotage produit — lui montrer un onglet vide n'aurait rien apporté.
 * La vraie barrière reste l'access control (la collection `developments` et le
 * champ ci-dessous refusent les autres rôles).
 */
const onEditAsAdmin: Condition = (_data, _siblingData, { operation, user }) =>
  operation === "update" && hasAdminRole(user);

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
  // `keepMessages` en premier : aucun enregistrement — quel qu'en soit le
  // chemin — ne doit faire disparaître un message du fil (voir le hook).
  hooks: { beforeChange: [keepMessages, guardAttentionFlags, stampResolvedAt, stampDocuments] },
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
          /**
           * Pièces INTERNES de la demande : un export de configuration, une
           * capture, un compte rendu d'appel. Distinctes des pièces jointes du
           * fil, qui sont ce que le client a envoyé ou reçu — celles-ci sont ce
           * que le support dépose pour lui-même.
           *
           * Le ticket n'est lisible que par l'équipe (canSupport) : ces
           * documents ne sortent ni dans l'espace client, ni dans les e-mails.
           */
          label: "Documents",
          fields: [
            documentsField({
              description:
                `Pièces internes rattachées à cette demande. Le client ne les voit pas — elles ne partent dans aucun e-mail. ` +
                `Comme les pièces jointes du fil, elles sont supprimées ${TICKET_RETENTION_DAYS} jours après la résolution du ticket.`,
            }),
          ],
        },
        {
          /**
           * Ce que la demande est devenue côté produit. Le lien est stocké sur
           * le DÉVELOPPEMENT (champ `tickets`), pas ici : une seule source de
           * vérité, et un dev né de trois tickets les porte tous les trois.
           */
          label: "Développement",
          admin: { condition: onEditAsAdmin },
          fields: [
            /**
             * Le même tiroir que sur une opportunité : on écrit le développement
             * sans quitter le ticket, et le ticket lui reste attaché. Le
             * formulaire arrive rempli de ce que le ticket dit déjà — on relit
             * avant de créer, une demande d'assistance n'étant pas toujours un
             * développement.
             */
            {
              name: "createDevelopment",
              type: "ui",
              admin: {
                components: {
                  Field: "/modules/dev/admin/CreateDevelopment#NeedFromTicket",
                },
              },
            },
            {
              name: "developments",
              type: "join",
              collection: "developments",
              on: "tickets",
              label: false,
              access: { read: adminOnlyFieldRead },
              admin: {
                // Pas de « Créer » ici : la création passe par le menu ⋮, qui
                // reprend le sujet, la demande et l'urgence du ticket. Un
                // formulaire vide ferait tout ressaisir.
                allowCreate: false,
                defaultColumns: ["number", "title", "type", "status", "priority"],
                description:
                  "Les développements ouverts à partir de ce ticket. Pour en ouvrir un : menu ⋮ → « Créer un développement ».",
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
    /**
     * L'entreprise TELLE QUE LE DEMANDEUR L'A ÉCRITE, depuis le formulaire du
     * site ou son e-mail. On n'y touche pas : c'est une trace de ce qui est
     * arrivé, et deux orthographes du même client en disent parfois long sur
     * qui écrit.
     */
    { name: "company", type: "text", label: "Entreprise (saisie)", admin: { position: "sidebar" } },
    /**
     * Et l'entreprise DE NOTRE CÔTÉ : le rattachement, à la main, à l'une de nos
     * opportunités.
     *
     * Deux champs et non un seul, parce qu'ils ne disent pas la même chose. Le
     * texte libre est ce que le client a tapé ; le rattachement est ce que nous
     * en avons conclu — et il ouvre ce que le texte ne permet pas : retrouver
     * tous les tickets d'un client, et savoir de quel contrat il relève.
     *
     * Réservé à l'admin : les opportunités ne sont pas dans le périmètre du
     * support (voir docs/RBAC-PLAN.md), et le champ resterait vide pour lui.
     */
    {
      name: "client",
      type: "relationship",
      relationTo: "partner-clients",
      label: "Entreprise cliente",
      index: true,
      access: { read: adminOnlyFieldRead, update: adminOnlyField },
      admin: {
        position: "sidebar",
        condition: (_data, _siblingData, { user }) => hasAdminRole(user),
        allowCreate: false,
        description: "Rattachement à une opportunité. Facultatif — laissez vide si le demandeur n'est pas encore client.",
      },
    },
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
