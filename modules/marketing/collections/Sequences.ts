import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { LOSS_REASON_OPTIONS } from "@/modules/partner/lib/lossReason";
import { BESOIN_OPTIONS, DELAY_UNITS, MESSAGE_STYLES } from "@/modules/marketing/lib/sequences";

/**
 * Les séquences de relance — le MODÈLE.
 *
 * Une séquence porte ses messages, dans l'ordre, avec le délai qui les sépare.
 * Tout est ici : les motifs de perte qui l'ouvrent, le rythme, les textes, les
 * images. Créer une séquence ou changer un délai ne demande donc pas de
 * déploiement — même principe que les parcours marketing, et pour la même
 * raison : ce sont des décisions commerciales, pas des décisions techniques.
 *
 * ⚠️ Ne pas confondre avec « Séquences de relance » (`sequence-runs`), qui sont
 * les INSTANCES : un prospect enrôlé, son calendrier, ce qui est parti.
 */
export const Sequences: CollectionConfig = {
  slug: "sequences",
  labels: { singular: "Séquence", plural: "Séquences" },
  admin: {
    useAsTitle: "label",
    defaultColumns: ["label", "key", "active"],
    group: "Marketing",
    description:
      "Le modèle : quels motifs de perte ouvrent quelle séquence, et les messages qui partent ensuite.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      type: "row",
      fields: [
        { name: "label", type: "text", label: "Nom", required: true, admin: { width: "60%" } },
        {
          name: "key",
          type: "text",
          label: "Clé technique",
          required: true,
          unique: true,
          index: true,
          admin: {
            width: "40%",
            description: "Citée par les séquences déjà en cours. À ne pas modifier.",
          },
        },
      ],
    },
    {
      name: "description",
      type: "textarea",
      label: "Description",
      admin: { description: "À quoi sert cette séquence, en une phrase." },
    },
    {
      /**
       * Ce qui déclenche la séquence. Une opportunité passée en « Perdue » ouvre
       * la séquence ACTIVE dont la liste contient son motif.
       *
       * Un motif ne doit figurer que dans une seule séquence : s'il apparaît
       * dans deux, la première trouvée gagne, et le choix devient un hasard.
       */
      name: "lossReasons",
      type: "select",
      hasMany: true,
      label: "Motifs de perte qui l'ouvrent",
      options: [...LOSS_REASON_OPTIONS],
      admin: {
        description:
          "Un motif ne doit apparaître que dans une seule séquence. Sans motif ici, la séquence ne s'ouvre jamais toute seule.",
      },
    },
    {
      name: "messages",
      type: "array",
      label: "Messages",
      labels: { singular: "Message", plural: "Messages" },
      admin: {
        description:
          "L'ordre de cette liste est l'ordre d'envoi par défaut. Le délai de chaque message se compte depuis le précédent — et pour le premier, depuis la perte.",
        initCollapsed: true,
        components: {
          RowLabel: "/modules/marketing/admin/SequenceThemeRowLabel#SequenceThemeRowLabel",
        },
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "key",
              type: "text",
              label: "Clé",
              required: true,
              admin: {
                width: "34%",
                description: "Identifiant stable. À ne pas modifier une fois des séquences lancées.",
              },
            },
            {
              name: "delayValue",
              type: "number",
              label: "Délai",
              required: true,
              min: 0,
              defaultValue: 2,
              admin: { width: "33%", description: "Depuis le message précédent." },
            },
            {
              name: "delayUnit",
              type: "select",
              label: "Unité",
              required: true,
              defaultValue: "mois",
              options: [...DELAY_UNITS],
              admin: { width: "33%" },
            },
          ],
        },
        {
          /**
           * Marketing ou sobre. Ce n'est pas qu'une question d'esthétique : une
           * relance personnelle perd tout son sens dans un habillage de
           * campagne, et une présentation produit tombe à plat sans visuel.
           */
          name: "style",
          type: "select",
          label: "Style",
          required: true,
          defaultValue: "marketing",
          options: [...MESSAGE_STYLES],
          admin: {
            description:
              "« Sobre » ne garde que le texte et la signature du partenaire : ni logo, ni bandeau, ni bouton, ni pied de page. La désinscription passe par l'en-tête que la messagerie affiche elle-même, et une réponse arrête la séquence.",
          },
        },
        {
          /**
           * Besoin coché au formulaire qui fait remonter ce message en tête.
           * Vide = le message garde sa place dans l'ordre.
           */
          name: "besoin",
          type: "select",
          label: "Remonte si le prospect a coché",
          options: [...BESOIN_OPTIONS],
          admin: {
            description:
              "Facultatif. C'est ce qui fait qu'un prospect venu pour le pointage lit d'abord le message sur le pointage.",
          },
        },
        {
          type: "row",
          fields: [
            {
              name: "title",
              type: "text",
              label: "Titre",
              required: true,
              admin: {
                width: "50%",
                description: "Affiché en tête des messages marketing. Sert de repère dans la liste.",
              },
            },
            { name: "subject", type: "text", label: "Objet de l'e-mail", required: true, admin: { width: "50%" } },
          ],
        },
        {
          name: "image",
          type: "upload",
          relationTo: "media",
          label: "Image du hero",
          admin: {
            // Un message sobre n'a pas de hero : lui proposer une image ferait
            // croire qu'elle partira.
            condition: (_, sibling) => sibling?.style !== "standard",
            description:
              "Affichée à droite du titre. Une capture large (environ 2 pour 1) passe mieux qu'une capture haute ; au-delà de 1,5 Mo elle mettra trop longtemps à s'afficher sur un téléphone.",
          },
        },
        {
          name: "paragraphs",
          type: "array",
          label: "Paragraphes",
          minRows: 1,
          labels: { singular: "Paragraphe", plural: "Paragraphes" },
          admin: {
            description:
              "Trois ou quatre paragraphes courts. Pas de liste à puces : c'est ce qui fait « documentation » plutôt que message écrit par quelqu'un.",
          },
          fields: [{ name: "text", type: "textarea", label: "Texte", required: true }],
        },
        { name: "payoff", type: "textarea", label: "La phrase qui reste", required: true },
        {
          /**
           * Le bouton n'existe que dans le style marketing.
           *
           * Un message sobre n'en porte aucun — pas même un lien seul sur sa
           * ligne, qui se lit comme un bouton et trahit l'envoi automatique.
           * L'action qu'on y attend est la réponse, et elle arrête la séquence.
           *
           * Facultatifs et non « requis » : un champ obligatoire masqué bloque
           * l'enregistrement sans dire pourquoi. C'est `buildSequenceEmail` qui
           * refuse un message marketing sans bouton.
           */
          type: "row",
          admin: { condition: (_, sibling) => sibling?.style !== "standard" },
          fields: [
            {
              name: "cta",
              type: "text",
              label: "Texte du bouton",
              admin: {
                width: "50%",
                description: "Un bénéfice, pas une fonctionnalité. Obligatoire pour un message marketing.",
              },
            },
            { name: "url", type: "text", label: "Lien du bouton", admin: { width: "50%" } },
          ],
        },
        {
          /**
           * Le rendu du message, tel qu'il partira.
           *
           * Écrire un e-mail sans le voir revient à écrire à l'aveugle : la
           * longueur des paragraphes, l'image, la signature ne se jugent qu'une
           * fois assemblés. L'aperçu est régénéré par le CODE D'ENVOI, à partir
           * de ce qui est enregistré — il ne peut donc pas embellir la réalité.
           */
          name: "preview",
          type: "ui",
          admin: {
            components: {
              Field: "/modules/marketing/admin/SequenceMessagePreview#SequenceMessagePreview",
            },
          },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          /**
           * Expéditeur. Une relance personnelle part de l'adresse d'une
           * personne ; une campagne part de l'adresse de la maison.
           *
           * ⚠️ Doit être un expéditeur VÉRIFIÉ chez Brevo, sinon l'envoi est
           * refusé — et l'échec n'apparaît que dans le journal.
           */
          name: "fromEmail",
          type: "email",
          label: "Expéditeur",
          admin: {
            width: "50%",
            placeholder: "info@tim-management.fr",
            description: "Doit être un expéditeur vérifié chez Brevo. Vide = l'adresse par défaut.",
          },
        },
        {
          name: "signature",
          type: "text",
          label: "Formule de politesse",
          admin: {
            width: "50%",
            placeholder: "Bien cordialement,",
            description:
              "La ligne qui clôt le message, avant la signature. La signature elle-même vient de la fiche du partenaire de l'opportunité — elle n'est pas à saisir ici.",
          },
        },
      ],
    },
    {
      /**
       * Ce qu'une réponse du prospect provoque.
       *
       * Ce n'est pas la même chose selon la séquence, et c'est pour ça que le
       * réglage est ici plutôt que dans le code : une relance personnelle qui
       * demande « votre projet est-il toujours d'actualité ? » a obtenu ce
       * qu'elle voulait dès la première réponse — continuer serait absurde. Une
       * campagne, elle, n'attend pas de réponse : quelqu'un qui écrit « merci,
       * pas pour l'instant » n'a pas demandé à ne plus rien recevoir.
       *
       * Dans les DEUX cas la réponse est inscrite sur la fiche de
       * l'opportunité : ce qui change, c'est la suite des envois.
       */
      name: "stopOnReply",
      type: "checkbox",
      label: "Une réponse arrête la séquence",
      defaultValue: true,
      admin: {
        description:
          "À cocher pour une relance qui attend une réponse. À décocher pour une campagne : une réponse y est inscrite sur la fiche, mais n'interrompt pas les envois.",
      },
    },
    {
      /**
       * Enchaînement à la FIN — quand tous les messages sont partis.
       *
       * Uniquement à la fin normale : une séquence arrêtée parce que la personne
       * a répondu, s'est désinscrite ou est ressortie de « Perdue » n'enchaîne
       * sur rien. Ce serait exactement le contraire de ce qu'on vient de
       * constater.
       */
      name: "nextSequence",
      type: "relationship",
      relationTo: "sequences",
      label: "Enchaîner ensuite sur",
      admin: {
        description:
          "Ouverte automatiquement quand tous les messages de celle-ci sont partis. Vide = la relance s'arrête là.",
      },
      filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
    },
    {
      name: "active",
      type: "checkbox",
      label: "Active",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description:
          "Décochée = plus aucun enrôlement. Les séquences déjà en cours continuent — les interrompre se fait une par une.",
      },
    },
    { name: "seedVersion", type: "number", admin: { hidden: true } },
  ],
};
