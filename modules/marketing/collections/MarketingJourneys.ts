import type { CollectionConfig } from "payload";

import { isAdmin, isBackoffice } from "@/core/access";
import {
  DEFAULT_DURATION_WEEKS,
  DEFAULT_SEND_HOUR,
  EMAIL_AUDIENCES,
  JOURNEY_ACTORS,
  JOURNEY_ANCHORS,
  JOURNEY_PHASES,
} from "@/modules/marketing/lib/journey";

/**
 * Parcours marketing — le MODÈLE (pas l'instance).
 *
 * Un parcours décrit une suite d'étapes obligatoires et ordonnées ; chaque
 * client qui le suit obtient un `journey-run` (l'instance) où l'on coche les
 * étapes une à une. Le premier parcours est « Phase de test ».
 *
 * ⚠️ Ne pas confondre avec la collection éditoriale `parcours` (parcours
 * d'apprentissage des utilisateurs de TIM) : rien à voir, d'où le slug distinct.
 *
 * Lecture ouverte à tout le back-office (le partenaire doit voir le libellé et
 * le détail des étapes qu'on lui demande) ; écriture réservée aux admins — le
 * process commercial n'est pas modifiable par un partenaire.
 */
export const MarketingJourneys: CollectionConfig = {
  slug: "marketing-journeys",
  labels: { singular: "Parcours marketing", plural: "Parcours marketing" },
  admin: {
    useAsTitle: "title",
    defaultColumns: ["title", "key", "defaultDurationWeeks", "active"],
    group: "Marketing",
    description:
      "Le modèle : les étapes d'un parcours. Chaque client qui le suit obtient une phase de test dans « Phases de test ».",
  },
  access: {
    read: isBackoffice,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      type: "row",
      fields: [
        { name: "title", type: "text", label: "Titre", required: true, admin: { width: "60%" } },
        {
          name: "key",
          type: "text",
          label: "Clé technique",
          required: true,
          unique: true,
          index: true,
          admin: {
            width: "40%",
            description: "Identifiant stable référencé par le code. À ne pas modifier.",
          },
        },
      ],
    },
    {
      name: "description",
      type: "textarea",
      label: "Description",
      admin: { description: "À quoi sert ce parcours, en une phrase." },
    },
    {
      type: "row",
      fields: [
        {
          name: "defaultDurationWeeks",
          type: "number",
          label: "Durée par défaut (semaines)",
          defaultValue: DEFAULT_DURATION_WEEKS,
          min: 1,
          admin: {
            width: "50%",
            description: "Lundi → lundi. La durée reste modifiable sur chaque phase de test.",
          },
        },
        {
          name: "mondayOnly",
          type: "checkbox",
          label: "Démarrage le lundi uniquement",
          defaultValue: true,
          admin: {
            width: "50%",
            description: "Interdit toute autre date de démarrage.",
          },
        },
      ],
    },
    {
      /**
       * Les étapes. Semées au premier démarrage depuis PHASE_DE_TEST_STEPS, puis
       * éditables ici : libellés, détails et échéances se changent sans
       * déploiement. Seule la `key` doit rester figée (le code s'y réfère).
       */
      name: "steps",
      type: "array",
      label: "Étapes",
      labels: { singular: "Étape", plural: "Étapes" },
      minRows: 1,
      admin: {
        description:
          "Ordre = ordre d'exécution. Toutes les étapes sont obligatoires : le parcours avance dans cet ordre.",
        initCollapsed: true,
        components: {
          RowLabel: "/modules/marketing/admin/JourneyStepRowLabel#JourneyStepRowLabel",
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
                width: "40%",
                description: "Identifiant stable. À ne pas modifier une fois des phases lancées.",
              },
            },
            { name: "label", type: "text", label: "Intitulé", required: true, admin: { width: "60%" } },
          ],
        },
        {
          type: "row",
          fields: [
            {
              name: "actor",
              type: "select",
              label: "Qui agit",
              required: true,
              defaultValue: "partenaire",
              options: [...JOURNEY_ACTORS],
              admin: { width: "50%" },
            },
            {
              name: "phase",
              type: "select",
              label: "Bloc",
              required: true,
              defaultValue: "avant-test",
              options: [...JOURNEY_PHASES],
              admin: { width: "50%" },
            },
          ],
        },
        { name: "detail", type: "textarea", label: "Détail" },
        {
          /**
           * Étapes que le système sait constater lui-même (lancement du parcours,
           * ouverture de l'espace client, réservation du créneau, transmission du
           * dossier, provisionnement, signature). Elles se cochent seules après un
           * délai de grâce, et ne proposent AUCUN bouton de validation : le geste
           * qui les réalise se fait ailleurs.
           *
           * Les étapes purement humaines restent décochées : les valider d'office
           * inventerait des faits dont dépendent ensuite relances et alertes.
           */
          name: "autoValidate",
          type: "checkbox",
          label: "Se valide automatiquement",
          admin: {
            description:
              "Sans effet si aucun fait observable n'est associé à cette étape. Les étapes que le logiciel sait constater (voir SYSTEM_STEPS) se valident seules de toute façon : cette règle vit dans le code, pas dans cette case.",
          },
        },
        {
          type: "row",
          fields: [
            {
              name: "anchor",
              type: "select",
              label: "Échéance",
              defaultValue: "aucun",
              options: [...JOURNEY_ANCHORS],
              admin: { width: "50%" },
            },
            {
              name: "offsetDays",
              type: "number",
              label: "Décalage (jours)",
              defaultValue: 0,
              admin: {
                width: "50%",
                // Le décalage a du sens dès qu'il y a une date de référence — le
                // démarrage, la fin, ou désormais le créneau de prise en main.
                condition: (_, sibling) =>
                  ["debut", "fin", "session"].includes(String(sibling?.anchor ?? "")),
                description: "Négatif = avant l'ancrage. Ex. -7 = une semaine avant.",
              },
            },
          ],
        },
      ],
    },
    {
      /**
       * Les envois automatiques du parcours. Séparés des étapes : un e-mail n'est
       * pas une action à cocher, et plusieurs partent sans étape correspondante
       * (code de connexion, récap du partenaire). Les regrouper ici permet aussi
       * de montrer, au démarrage, tout ce qui partira sans intervention.
       */
      name: "emails",
      type: "array",
      label: "Envois automatiques",
      labels: { singular: "Envoi", plural: "Envois" },
      admin: {
        description:
          "Objets et libellés modifiables sans déploiement. Un envoi sans échéance est déclenché par un événement (connexion, transmission du dossier…).",
        initCollapsed: true,
        components: {
          RowLabel: "/modules/marketing/admin/JourneyEmailRowLabel#JourneyEmailRowLabel",
        },
      },
      fields: [
        {
          type: "row",
          fields: [
            { name: "key", type: "text", label: "Clé", required: true, admin: { width: "35%" } },
            { name: "subject", type: "text", label: "Objet", required: true, admin: { width: "65%" } },
          ],
        },
        {
          type: "row",
          fields: [
            {
              name: "audience",
              type: "select",
              label: "Destinataire",
              defaultValue: "client",
              options: [...EMAIL_AUDIENCES],
              admin: { width: "34%" },
            },
            {
              name: "anchor",
              type: "select",
              label: "Échéance",
              defaultValue: "aucun",
              options: [...JOURNEY_ANCHORS],
              admin: { width: "33%" },
            },
            {
              name: "offsetDays",
              type: "number",
              label: "Décalage (jours)",
              defaultValue: 0,
              admin: {
                width: "33%",
                // Le décalage a du sens dès qu'il y a une date de référence — le
                // démarrage, la fin, ou désormais le créneau de prise en main.
                condition: (_, sibling) =>
                  ["debut", "fin", "session"].includes(String(sibling?.anchor ?? "")),
              },
            },
            {
              name: "sendHour",
              type: "text",
              label: "Heure d'envoi",
              defaultValue: DEFAULT_SEND_HOUR,
              validate: (value: unknown) =>
                !value || /^([01]\d|2[0-3]):[0-5]\d$/.test(String(value))
                  ? true
                  : "Heure attendue au format HH:mm (ex. 08:00).",
              admin: {
                width: "34%",
                placeholder: DEFAULT_SEND_HOUR,
                description: "Heure de Paris. Une date sans heure partirait à minuit.",
                condition: (_, sibling) => sibling?.anchor && sibling.anchor !== "aucun",
              },
            },
          ],
        },
        {
          name: "stepKey",
          type: "text",
          label: "Rattaché à l'étape",
          admin: {
            description:
              "Clé de l'étape sur laquelle afficher l'envoi. Obligatoire pour un envoi sans échéance ; sinon, il se rattache tout seul à l'étape correspondant à sa date.",
          },
        },
        {
          name: "trigger",
          type: "text",
          label: "Déclencheur",
          admin: {
            condition: (_, sibling) => !sibling?.anchor || sibling?.anchor === "aucun",
            description: "Le fait qui provoque l'envoi, quand il n'est pas daté.",
          },
        },
        { name: "detail", type: "textarea", label: "Ce que fait l'e-mail" },
      ],
    },
    {
      name: "active",
      type: "checkbox",
      label: "Actif",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Décoché = ne peut plus être lancé sur de nouveaux clients.",
      },
    },
    // Version du contenu livré avec le code (voir seedJourneys) : permet
    // d'ajouter des éléments à un parcours déjà créé sans écraser les réglages.
    { name: "seedVersion", type: "number", admin: { hidden: true } },
  ],
};
