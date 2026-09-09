import { APIError } from "payload";
import type { CollectionBeforeValidateHook, CollectionConfig } from "payload";

import { isAdmin, isBackoffice } from "@/core/access";
import { isKnownSlot } from "@/modules/marketing/lib/email-slots";
import { unknownJourneyVars } from "@/modules/marketing/lib/journey-vars";
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
/**
 * Refuse une reprise de texte qui partirait cassée chez un client.
 *
 * Deux fautes, et toutes deux invisibles jusqu'à ce que le message soit
 * distribué : une variable mal tapée (`{{prenoom}}`) s'affiche telle quelle dans
 * la boîte du destinataire, et un bloc qui n'existe pas sur ce message ne
 * remplace rien — on croit avoir réécrit un texte qui continue de partir tel
 * qu'il était.
 *
 * L'enregistrement est le seul moment où la correction ne coûte rien.
 */
const refuseTextesInvalides: CollectionBeforeValidateHook = ({ data }) => {
  const rows = (data?.emailTexts ?? []) as Array<{
    key?: string | null;
    slot?: string | null;
    value?: string | null;
  }>;

  for (const row of rows) {
    const value = row?.value?.trim();
    if (!value) continue;

    const key = row.key ?? "";
    const slot = row.slot ?? "";
    if (!isKnownSlot(key, slot)) {
      // `APIError` et non `Error` : c'est un message à LIRE et à corriger. Une
      // erreur nue remonte en 500 « quelque chose s'est mal passé », et la
      // personne ne sait pas ce qu'on lui reproche.
      throw new APIError(
        `Le bloc « ${slot} » n'existe pas sur le message « ${key} » : le texte ne remplacerait rien.`,
        400,
      );
    }

    const inconnues = unknownJourneyVars(value);
    if (inconnues.length > 0) {
      throw new APIError(
        `Variable inconnue dans « ${key} / ${slot} » : ` +
          inconnues.map((v) => `{{${v}}}`).join(", ") +
          ". Elle partirait telle quelle chez le client.",
        400,
      );
    }
  }

  return data;
};

export const MarketingJourneys: CollectionConfig = {
  slug: "marketing-journeys",
  /**
   * Même nom que ses instances (« Parcours de test »), et c'est l'EMPLACEMENT
   * qui les distingue : sous « Paramètres », ce sont les modèles ; en tête de
   * Marketing, ceux qui tournent. Deux noms différents pour un même objet
   * obligeaient à savoir lequel désignait quoi.
   */
  labels: { singular: "Parcours de test", plural: "Parcours de test" },
  hooks: { beforeValidate: [refuseTextesInvalides] },
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
      /**
       * Deux onglets, et la coupure n'est pas cosmétique : on ne règle pas un
       * calendrier et on ne relit pas une phrase dans le même état d'esprit.
       * Mélangés, les textes se perdaient au milieu des dates et des clés.
       */
      type: "tabs",
      tabs: [
        {
          label: "Parcours",
          description: "Les étapes, et quand chaque message part.",
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
              "Quand chaque message part, à qui, et sous quelle étape il s'affiche. Le TEXTE des messages, objet compris, se règle dans l'onglet « Textes des e-mails ». Un envoi sans échéance est déclenché par un événement (connexion, transmission du dossier…).",
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
                {
                  /**
                   * ÉTIQUETTE de back-office, pas l'objet du message.
                   *
                   * C'est elle qu'on lit sur la ligne repliée et dans l'onglet
                   * « E-mails » d'un parcours. L'objet que reçoit le
                   * destinataire, lui, se règle dans « Textes des e-mails » —
                   * avec ses variables, parce que trois objets calculent quelque
                   * chose : le code de connexion, le nom du client, la date de
                   * fin. Les figer ferait perdre ce qui les rend utiles.
                   *
                   * Avoir confondu les deux est ce qui faisait croire qu'éditer
                   * ce champ changeait ce que recevait le client.
                   */
                  name: "subject",
                  type: "text",
                  label: "Intitulé",
                  required: true,
                  admin: {
                    width: "65%",
                    description:
                      "Le nom de ce message dans le back-office. L'objet reçu par le destinataire se règle dans l'onglet « Textes des e-mails ».",
                  },
                },
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
          ],
        },
        {
          label: "Textes des e-mails",
          description:
            "Le texte de chaque message. Un champ laissé vide garde le texte livré avec le logiciel — c'est ce qui permet de revenir en arrière en effaçant.",
          fields: [
            {
              /**
               * Les reprises, à plat : une ligne par bloc réécrit.
               *
               * À plat plutôt qu'imbriqué sous chaque envoi, parce que les blocs
               * ne sont pas les mêmes d'un message à l'autre : un champ par bloc
               * de chaque message ferait une cinquantaine de colonnes dont
               * quarante vides. Ici, seul ce qui est réécrit existe.
               *
               * L'écran, lui, ne montre pas ce tableau : il liste les messages et
               * leurs blocs, avec le texte d'origine en filigrane.
               */
              name: "emailTexts",
              type: "array",
              label: false,
              admin: {
                components: {
                  Field: "/modules/marketing/admin/EmailTextsEditor#EmailTextsEditor",
                },
              },
              fields: [
                { name: "key", type: "text", required: true },
                { name: "slot", type: "text", required: true },
                { name: "value", type: "textarea" },
              ],
            },
          ],
        },
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
