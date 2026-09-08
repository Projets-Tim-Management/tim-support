import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { documentsField } from "@/core/fields/documents";
import { referenceNumber } from "@/core/fields/referenceNumber";
import {
  DEFAULT_DEV_PRIORITY,
  DEFAULT_DEV_TYPE,
  DEV_PRIORITY_OPTIONS,
  DEV_TYPE_OPTIONS,
} from "@/modules/dev/lib/devMeta";
import { assigneeField } from "@/modules/dev/fields/assignee";
import { computeChecklistProgress, stampChecklistComments } from "@/modules/dev/hooks/checklist";
import { stampDocuments } from "@/core/hooks/documents";
import { applyStatusEffects, setDefaultStatus, setDemandCount } from "@/modules/dev/hooks/stamps";

/**
 * Développements — tout ce qui se développe, sur un seul tableau.
 *
 * Une nouvelle fonctionnalité, une évolution, un bug, un dépannage, un travail
 * technique ou une simple étude : même collection, distingués par le champ
 * `type`. Les séparer en collections aurait produit trois tableaux à consulter
 * là où la question est toujours la même — qu'est-ce qui est en cours, et pour qui.
 *
 * TROIS AXES, jamais mélangés :
 *  - `type`     : ce que c'est ;
 *  - `status`   : où on en est — une colonne du Kanban, éditable en Paramètres
 *                 (collection `dev-statuses`), rangée sous l'une des 5 phases ;
 *  - `priority` : dans quel ordre.
 * D'où le fait qu'« urgent » soit une priorité et non un statut : déclarer une
 * demande urgente ne doit pas effacer l'information de son avancement.
 *
 * Accès : ADMIN SEUL (collection et champs de liaison posés sur les tickets et
 * les opportunités). C'est un outil de pilotage interne — ce qu'un client doit
 * savoir de l'avancement lui est dit dans son ticket, pas ici.
 */
export const Developments: CollectionConfig = {
  slug: "developments",
  labels: { singular: "Développement", plural: "Développements" },
  admin: {
    useAsTitle: "title",
    // On lit d'abord l'urgence et la nature, puis de quoi il s'agit, puis
    // combien de clients l'attendent — l'ordre dans lequel on arbitre.
    defaultColumns: ["number", "priority", "type", "title", "demandCount", "checklistProgress", "status"],
    listSearchableFields: ["title", "number"],
    group: "Développements",
    components: {
      // Bascule Kanban / Tableau, et vues rapides par phase (slot au-dessus du
      // tableau natif) — voir DevViewSwitcher.
      beforeListTable: ["/modules/dev/admin/DevViewSwitcher#DevViewSwitcher"],
    },
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  // Ordre du FLUX (à trier → … → hors flux) : la liste raconte alors le pipeline
  // de haut en bas, ce que l'ordre alphabétique des valeurs d'enum ne ferait pas.
  defaultSort: "statusRank",
  hooks: {
    // Le statut de départ se pose AVANT la validation : une création par API
    // (ouverture depuis un ticket) n'a pas à connaître la colonne d'entrée.
    beforeValidate: [setDefaultStatus],
    beforeChange: [
      stampDocuments,
      applyStatusEffects,
      setDemandCount,
      stampChecklistComments,
      computeChecklistProgress,
    ],
  },
  fields: [
    {
      name: "title",
      type: "text",
      label: "Titre",
      required: true,
      admin: { placeholder: "Le besoin en une ligne — ex. Export comptable au format Sage" },
    },

    /**
     * LE CORPS : la demande en un paragraphe, puis ce qu'on en fait, point par
     * point. Pas d'onglets — la fiche se lit de haut en bas, et rien de ce qui
     * sert à travailler n'est caché derrière un clic.
     */
    /**
     * Une zone de texte simple, comme partout ailleurs dans le back-office
     * (demande d'un ticket, notes internes, description d'une feature).
     *
     * L'éditeur riche a été essayé puis retiré : il s'affiche à nu, sans cadre,
     * et une demande de client n'a pas besoin de titres ni de listes à puces —
     * elle a besoin d'être lisible et de se coller-coller sans perdre sa forme.
     */
    {
      name: "description",
      type: "textarea",
      label: "Description",
      admin: {
        // Le placeholder dit déjà ce qu'on attend : la ligne d'aide sous le
        // champ ne faisait que répéter, et éloignait la checklist du texte
        // auquel elle répond.
        placeholder: "Ce que le client demande, dans ses mots si possible.",
        className: "dev-desc",
        // Écrit en texte brut, AFFICHÉ mis en forme : on colle ici des
        // spécifications qui contiennent des listes, du `code`, du **gras**.
        // La donnée reste le texte exact — voir MarkdownField.
        components: { Field: "/modules/dev/admin/MarkdownField#MarkdownField" },
      },
    },

    // Avancement lu dans l'état du formulaire : la barre bouge au clic,
    // sans attendre l'enregistrement.
    {
      name: "checklistBar",
      type: "ui",
      admin: {
        components: { Field: "/modules/dev/admin/ChecklistProgress#ChecklistProgress" },
      },
    },
    {
      name: "checklist",
      type: "array",
      label: false,
      labels: { singular: "Point", plural: "Points" },
      admin: {
        /**
         * REPLIÉS par défaut. Ce n'était pas tenable tant que le titre se
         * saisissait à l'intérieur — ajouter un point obligeait alors à le
         * déplier. Depuis que le titre s'écrit dans la barre, on n'ouvre un
         * point que pour ce qui s'y trouve vraiment : une description, une
         * discussion, une personne. Une checklist de dix points tient donc en
         * dix lignes.
         */
        initCollapsed: true,
        className: "dev-checklist",
        components: { RowLabel: "/modules/dev/admin/ChecklistRowLabel#ChecklistRowLabel" },
      },
      fields: [
        /**
         * `done` est piloté depuis la BARRE du point (composant
         * ChecklistRowLabel), pour qu'on puisse valider une tâche sans la
         * déplier. Le champ reste déclaré et rendu — masqué en CSS — parce que
         * c'est ce qui garantit sa présence dans l'état du formulaire : c'est
         * cette valeur-là que la case de la barre écrit.
         */
        { name: "done", type: "checkbox", label: "Fait", admin: { className: "dev-done" } },
        /**
         * Saisi dans la BARRE du point (composant ChecklistRowLabel), à côté de
         * la case : c'est là qu'on le lit, autant l'y écrire. Le champ reste
         * déclaré et rendu — masqué en CSS — parce que c'est ce qui garantit sa
         * présence dans l'état du formulaire, et donc son enregistrement.
         */
        {
          name: "title",
          type: "text",
          label: "Titre",
          required: true,
          admin: { className: "dev-done" },
        },
        /**
         * Assigner un POINT, et pas seulement le développement entier : une
         * tâche se répartit souvent à deux ou trois, et le nom de la personne
         * se lit ensuite dans la barre du point, sans déplier.
         */
        assigneeField({
          label: "Assigné à (facultatif)",
          hasMany: true,
          description: "",
          // Une rangée de visages : on voit l'équipe entière et on assigne d'un
          // clic, au lieu d'ouvrir un menu pour lire des noms.
          picker: true,
        }),
        {
          name: "description",
          type: "textarea",
          label: "Description (facultatif)",
          admin: {
            className: "dev-md--sm",
            placeholder:
              "Ce qu'il faut faire, ou vérifier pour considérer le point acquis. Un titre suffit souvent.",
            components: { Field: "/modules/dev/admin/MarkdownField#MarkdownField" },
          },
        },
        /**
         * La discussion du point, sous sa description.
         *
         * Un fil PAR POINT et non un fil général : une question se pose
         * toujours sur quelque chose de précis, et dans un fil global il
         * faut tout relire pour retrouver ce qui a été décidé — donc on
         * décide deux fois.
         *
         * Auteur et date sont posés à l'écriture et jamais réécrits
         * (hooks/checklist.ts) : un commentaire reste de qui l'a écrit,
         * même si quelqu'un d'autre réenregistre la fiche plus tard.
         */
        {
          name: "comments",
          type: "array",
          label: "Commentaires",
          labels: { singular: "Commentaire", plural: "Commentaires" },
          admin: {
            className: "dev-comments",
            // Rendu comme une DISCUSSION (les messages, puis un champ et un
            // bouton) plutôt qu'en tableau de lignes repliables : on vient dire
            // une phrase, pas remplir un formulaire. La donnée reste ce tableau
            // — rien à migrer, et l'API reste lisible par d'autres écrans.
            components: { Field: "/modules/dev/admin/Discussion#Discussion" },
          },
          fields: [
            /**
             * Pas de `required` : ce champ n'est rendu par aucun écran (la
             * discussion l'écrit elle-même). Le déclarer obligatoire faisait
             * qu'une ligne vide — quelle qu'en soit l'origine — refusait
             * l'enregistrement de toute la fiche en pointant « Commentaires »,
             * sans qu'on puisse la corriger nulle part. Les lignes sans texte
             * sont désormais retirées avant l'écriture (hooks/checklist.ts).
             */
            { name: "body", type: "textarea", label: false },
            /**
             * La personne dont on attend une réponse.
             *
             * C'est ce qui distingue une question d'un simple commentaire : tant
             * qu'elle n'a pas repris la parole dans le fil, la question compte
             * comme en attente — sur la barre du point, et sur SON tableau de
             * bord. Aucun drapeau « résolu » n'est stocké : l'état se déduit du
             * fil (voir lib/discussion.ts), donc il ne peut pas mentir.
             */
            assigneeField({ name: "askedTo", label: "Réponse attendue de" }),
            {
              type: "row",
              fields: [
                {
                  name: "author",
                  type: "relationship",
                  relationTo: "users",
                  label: "Par",
                  admin: { width: "50%", readOnly: true },
                },
                {
                  name: "at",
                  type: "date",
                  label: "Le",
                  admin: {
                    width: "50%",
                    readOnly: true,
                    date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
                  },
                },
              ],
            },
          ],
        },
      ],
    },

    /**
     * Referme le point qu'on vient d'ajouter : Payload ouvre toujours une ligne
     * neuve, quel que soit `initCollapsed` (voir ChecklistAutoCollapse). Ne rend
     * rien — c'est un comportement, pas un champ.
     */
    {
      name: "checklistAutoCollapse",
      type: "ui",
      admin: {
        components: { Field: "/modules/dev/admin/ChecklistAutoCollapse#ChecklistAutoCollapse" },
      },
    },

    /**
     * Ce qui vit AILLEURS : maquette Figma, page Notion, dépôt, document
     * partagé. Distinct des documents, qui sont des fichiers déposés ici —
     * un lien pointe vers quelque chose qu'on ne possède pas, et qui bouge
     * sans nous.
     */
    {
      name: "links",
      type: "array",
      label: "Liens",
      labels: { singular: "Lien", plural: "Liens" },
      admin: {
        // Rendus en pastilles cliquables : un lien existe pour être ouvert, et
        // l'interface de tableau le range dans un champ de saisie.
        components: { Field: "/modules/dev/admin/DevLinks#DevLinks" },
      },
      fields: [
        {
          name: "url",
          type: "text",
          label: "Adresse",
          required: true,
          validate: (value: unknown) =>
            typeof value === "string" && /^https?:\/\/.+\..+/i.test(value.trim())
              ? true
              : "Adresse invalide : elle doit commencer par http:// ou https://.",
        },
        { name: "label", type: "text", label: "Intitulé" },
      ],
    },

    /**
     * Les pièces du développement : maquette, export de configuration, cahier
     * des charges, capture d'un bug. En bas du corps — après la checklist,
     * parce qu'on les dépose et qu'on les consulte, on n'y travaille pas.
     */
    documentsField({
      label: "Documents",
      description:
        "Maquettes, spécifications, exports, captures. Internes à TIM : le client ne les voit pas, elles ne partent dans aucun e-mail.",
    }),

    // ─── Barre latérale ──────────────────────────────────────────────────────
    /**
     * Ce qu'on regarde et ce qu'on change tous les jours reste visible ; le
     * contexte descend dans un bloc replié.
     *
     * Une barre latérale de quatorze champs empilés oblige à faire défiler la
     * page pour trouver le statut, qui est la première chose qu'on vient voir.
     * Les lignes d'aide ont été raccourcies pour la même raison : en barre
     * latérale, une phrase d'explication coûte autant de hauteur qu'un champ.
     */
    // Le numéro sans sa ligne d'aide : « attribué automatiquement » se comprend
    // à voir un champ en lecture seule déjà rempli.
    { ...referenceNumber, admin: { ...referenceNumber.admin, description: "" } },
    /**
     * Le statut occupe toute la largeur, seul : c'est LA question à laquelle la
     * fiche répond. Son aide (« Bug : reproduire et diagnostiquer ») s'affiche
     * juste dessous — avec une vingtaine de colonnes, le libellé seul ne suffit
     * pas toujours. Les statuts sont du contenu (collection `dev-statuses`) :
     * cette liste se règle dans « Paramètres › Statuts ».
     */
    {
      name: "status",
      type: "relationship",
      relationTo: "dev-statuses",
      label: "Statut",
      index: true,
      admin: {
        position: "sidebar",
        // Sélecteur en pastille colorée, groupé par phase, avec l'aide du
        // statut choisi sous le champ — voir DevStatusField. Le sélecteur de
        // relation natif aurait rendu une liste plate de 18 noms.
        components: {
          Field: "/modules/dev/admin/DevStatusField#DevStatusField",
          Cell: "/modules/dev/admin/DevStatusCell#DevStatusCell",
        },
      },
    },
    {
      type: "row",
      admin: { position: "sidebar" },
      fields: [
        {
          name: "type",
          type: "select",
          label: "Type",
          defaultValue: DEFAULT_DEV_TYPE,
          options: DEV_TYPE_OPTIONS,
          index: true,
          admin: {
            components: {
              Field: "/modules/dev/admin/DevSelectField#DevSelectField",
              Cell: "/modules/dev/admin/DevCell#DevCell",
            },
          },
        },
        {
          name: "priority",
          type: "select",
          label: "Priorité",
          defaultValue: DEFAULT_DEV_PRIORITY,
          options: DEV_PRIORITY_OPTIONS,
          index: true,
          admin: {
            components: {
              Field: "/modules/dev/admin/DevSelectField#DevSelectField",
              Cell: "/modules/dev/admin/DevCell#DevCell",
            },
          },
        },
      ],
    },
    /**
     * Web, Mobile, ou les deux — c'est une qualification du développement, au
     * même titre que son type : elle se choisit en même temps, donc elle se lit
     * au même endroit. Elle était descendue dans le bloc replié, où il fallait
     * la déplier pour dire une chose qu'on sait dès la première minute.
     */
    {
      name: "platforms",
      type: "relationship",
      relationTo: "platforms",
      hasMany: true,
      label: "Plateformes",
      admin: {
        position: "sidebar",
        // Mêmes badges bleus que sur une fiche feature : c'est la même notion.
        className: "feature-platforms",
      },
    },
    assigneeField({
      label: "Assigné à",
      hasMany: true,
      position: "sidebar",
      description: "",
    }),
    /**
     * QUI l'attend. Le champ le plus important de la fiche : c'est lui
     * qui alimente `demandCount`, et donc l'arbitrage. Une demande
     * portée par quatre clients ne se traite pas comme une idée isolée.
     */
    {
      name: "opportunities",
      type: "relationship",
      relationTo: "partner-clients",
      hasMany: true,
      label: "Demandé par",
      index: true,
      admin: {
        position: "sidebar",
      },
    },
    /**
     * D'OÙ ça vient. Un même développement peut naître de plusieurs
     * tickets — c'est même le signe qu'il faut le faire.
     */
    {
      name: "tickets",
      type: "relationship",
      relationTo: "tickets",
      hasMany: true,
      label: "Tickets à l'origine",
      index: true,
      admin: {
        position: "sidebar",
      },
    },
    {
      name: "dueDate",
      type: "date",
      label: "Échéance promise",
      index: true,
      admin: {
        position: "sidebar",
        date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
        description: "Seulement si une date a été ANNONCÉE à quelqu'un.",
      },
    },

    /**
     * Le reste : vrai, utile, mais consulté une fois sur dix. Replié par défaut,
     * il libère la moitié de la colonne sans rien rendre inaccessible.
     */
    {
      type: "collapsible",
      label: "Contexte & suivi",
      admin: { position: "sidebar", initCollapsed: true },
      fields: [
      /**
       * Dénormalisé depuis `opportunities` pour être TRIABLE côté base : « les
       * plus demandés d'abord » est la première question qu'on pose au tableau.
       */
      {
        name: "demandCount",
        type: "number",
        label: "Clients demandeurs",
        defaultValue: 0,
        index: true,
        admin: {
          readOnly: true,
        },
      },
      /**
       * Avancement de la checklist (« 3/7 ») — calculé, jamais saisi.
       *
       * En lecture seule plutôt que caché : un champ `hidden` disparaît de TOUTE
       * l'interface, y compris du sélecteur de colonnes de la liste — or c'est
       * aussi là qu'il sert.
       */
      {
        name: "checklistProgress",
        type: "text",
        label: "Checklist",
        admin: {
          readOnly: true,
          components: { Cell: "/modules/dev/admin/ChecklistCell#ChecklistCell" },
        },
      },
      // Jalons posés automatiquement par les hooks (voir hooks/stamps.ts).
      {
        type: "row",
          fields: [
          {
            name: "startedAt",
            type: "date",
            label: "Démarré le",
            admin: {
              width: "50%",
              readOnly: true,
              date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
            },
          },
          {
            name: "deliveredAt",
            type: "date",
            label: "Livré le",
            index: true,
            admin: {
              width: "50%",
              readOnly: true,
              date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" },
            },
          },
        ],
      },
      {
        name: "internalNotes",
        type: "textarea",
        label: "🔒 Notes internes",
        admin: {
          description: "Jamais communiqué au client.",
        },
      },
      /**
       * Le pont vers le site support. Un développement livré mais non
       * documenté est un développement que le client ne trouvera pas —
       * d'où le statut « À documenter », et d'où ce lien.
       */
      {
        name: "feature",
        type: "relationship",
        relationTo: "features",
        label: "Fiche de documentation",
        admin: {
          description:
            "La fiche du site support, une fois le développement livré.",
        },
      },
      ],
    },
    /**
     * ORDRE D'IMPORTANCE dans la colonne du Kanban : 1 en haut.
     *
     * C'est l'arbitrage qui ne se déduit d'aucun champ — ni la priorité, ni le
     * nombre de demandeurs ne disent lequel de deux développements « hauts »
     * passe d'abord. Il se pose à la main, en glissant les cartes, et se lit
     * dans l'ordre des colonnes.
     *
     * Caché du formulaire : il n'a de sens que sur le tableau, où on le donne
     * d'un geste. Une fiche sans rang (nouvelle, ou jamais classée) tombe en
     * bas de sa colonne — Postgres range les valeurs nulles en dernier.
     */
    {
      name: "rank",
      type: "number",
      label: "Rang",
      index: true,
      admin: { hidden: true },
    },
    // Rang de tri du statut (ordre du flux). Caché : il ne sert qu'au classement.
    {
      name: "statusRank",
      type: "number",
      index: true,
      admin: { hidden: true },
    },
  ],
};
