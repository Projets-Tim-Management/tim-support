import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { CHANNELS, CHOICE_TYPES, FIELD_TYPES } from "@/modules/forms/lib/form-schema";

/**
 * Définitions des formulaires du site vitrine.
 *
 * Le site lit `GET /api/forms/<formId>` et rend ce qu'il reçoit : modifier un
 * libellé ou ajouter un champ se fait ICI, sans déploiement — comme du temps de
 * Brevo, où ces gestes étaient à la portée du marketing.
 *
 * Réservé aux admins : c'est un formulaire public, pas un réglage de partenaire.
 */
export const Forms: CollectionConfig = {
  slug: "forms",
  labels: { singular: "Formulaire", plural: "Formulaires" },
  admin: {
    useAsTitle: "label",
    defaultColumns: ["label", "formId", "defaultChannel", "active"],
    group: "Marketing",
    description:
      "Les formulaires servis au site vitrine. Ce qui est saisi ici s'affiche sur le site, sans déploiement.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      type: "row",
      fields: [
        { name: "label", type: "text", label: "Nom", required: true, admin: { width: "60%" } },
        {
          name: "formId",
          type: "text",
          label: "Identifiant",
          required: true,
          unique: true,
          index: true,
          admin: {
            width: "40%",
            description:
              "Cité par le site vitrine et porté par chaque soumission. À ne pas modifier une fois en service.",
          },
        },
      ],
    },
    {
      name: "defaultChannel",
      type: "select",
      label: "Canal par défaut",
      required: true,
      defaultValue: "seo",
      options: [...CHANNELS],
      admin: {
        description:
          "Canal retenu quand la visite ne porte aucune trace de campagne. Un gclid ou un utm_medium=cpc réellement présent prime toujours sur cette valeur.",
      },
    },
    {
      name: "fields",
      type: "array",
      label: "Champs",
      labels: { singular: "Champ", plural: "Champs" },
      minRows: 1,
      admin: {
        description: "L'ordre de cette liste est l'ordre d'affichage sur le site.",
        initCollapsed: true,
        components: {
          RowLabel: "/modules/forms/admin/FormFieldRowLabel#FormFieldRowLabel",
        },
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "name",
              type: "text",
              label: "Nom technique",
              required: true,
              admin: {
                width: "35%",
                description:
                  "Identifiant du champ. Il voyage dans les soumissions déjà enregistrées : le renommer rend l'historique illisible.",
              },
            },
            {
              name: "type",
              type: "select",
              label: "Type",
              required: true,
              defaultValue: "text",
              options: [...FIELD_TYPES],
              admin: { width: "30%" },
            },
            {
              name: "required",
              type: "checkbox",
              label: "Obligatoire",
              defaultValue: true,
              admin: { width: "35%" },
            },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "label", type: "text", label: "Libellé", required: true, admin: { width: "60%" } },
            {
              name: "placeholder",
              type: "text",
              label: "Exemple",
              admin: {
                width: "40%",
                // Un exemple dans une liste déroulante n'a nulle part où s'afficher.
                condition: (_, sibling) => !CHOICE_TYPES.includes(sibling?.type),
              },
            },
          ],
        },
        {
          name: "helpText",
          type: "text",
          label: "Texte d'aide",
          admin: { description: "Affiché sous le champ. Facultatif." },
        },
        {
          type: "row",
          fields: [
            {
              name: "maxLength",
              type: "number",
              label: "Longueur maximale",
              min: 1,
              admin: {
                width: "50%",
                condition: (_, sibling) => ["text", "email"].includes(String(sibling?.type ?? "")),
              },
            },
            {
              name: "countryCode",
              type: "checkbox",
              label: "Sélecteur d'indicatif pays",
              admin: {
                width: "50%",
                condition: (_, sibling) => sibling?.type === "tel",
              },
            },
          ],
        },
        {
          /**
           * `value` est stocké, `label` est affiché. Les séparer évite l'écueil de
           * Brevo, qui postait des codes numériques (`COLLABORATEURS=3` pour
           * « 26 - 50 ») : une soumission ne se lisait pas sans table de
           * correspondance.
           */
          name: "options",
          type: "array",
          label: "Choix",
          labels: { singular: "Choix", plural: "Choix" },
          admin: {
            condition: (_, sibling) => CHOICE_TYPES.includes(sibling?.type),
            description: "L'ordre de cette liste est l'ordre d'affichage.",
            components: {
              RowLabel: "/modules/forms/admin/FormOptionRowLabel#FormOptionRowLabel",
            },
          },
          fields: [
            {
              type: "row",
              fields: [
                {
                  name: "value",
                  type: "text",
                  label: "Valeur",
                  required: true,
                  admin: { width: "40%", description: "Stockée. À ne pas modifier." },
                },
                {
                  name: "label",
                  type: "text",
                  label: "Libellé affiché",
                  required: true,
                  admin: { width: "60%" },
                },
              ],
            },
          ],
        },
      ],
    },
    {
      name: "successText",
      type: "textarea",
      label: "Message de succès",
      required: true,
      admin: { description: "Affiché à la place du formulaire une fois la demande envoyée." },
    },
    {
      name: "errorText",
      type: "textarea",
      label: "Message d'échec",
      required: true,
      admin: {
        description:
          "Doit dire que l'envoi a ÉCHOUÉ. Celui de Brevo se terminait par la phrase de succès : un visiteur en échec croyait avoir réussi.",
      },
    },
    {
      /**
       * L'APPEL À L'ACTION de l'écran de succès — le plus souvent : réserver un
       * créneau de présentation.
       *
       * Le moment qui suit l'envoi est celui où l'intention est la plus forte de
       * tout le parcours : la personne vient de donner son nom, son téléphone et
       * ses besoins. On lui proposait « on vous recontacte sous 24 h » et on la
       * laissait partir — alors que le rendez-vous est déjà proposé, mais dans
       * l'accusé de réception, qui arrive quand l'élan est retombé.
       *
       * Réglé ICI et pas en dur sur la vitrine : l'adresse de prise de rendez-vous
       * change avec le compte, et elle est déjà surchargeable de notre côté pour
       * l'accusé de réception (LEAD_CALENDLY_URL). Une troisième copie du même
       * lien aurait divergé au premier changement.
       */
      name: "successCtaLabel",
      type: "text",
      label: "Bouton après l'envoi",
      admin: {
        description:
          "Libellé du bouton affiché sur l'écran de confirmation, ex. « Réserver un créneau ». Vide = aucun bouton.",
      },
    },
    {
      name: "successCtaUrl",
      type: "text",
      label: "Adresse du bouton",
      /**
       * `http(s)` uniquement, et vérifié à l'enregistrement.
       *
       * Cette adresse est posée telle quelle dans un `href` par la vitrine : un
       * `javascript:` saisi ici s'exécuterait chez chaque visiteur qui envoie le
       * formulaire. Le refus au moment de la saisie est le seul endroit où la
       * correction ne coûte rien.
       */
      validate: (value: unknown) =>
        !value || /^https?:\/\/\S+$/i.test(String(value).trim())
          ? true
          : "Adresse attendue en http:// ou https://.",
      admin: {
        description:
          "Où mène le bouton, ex. la page Calendly. Les deux champs vont ensemble : l'un sans l'autre n'affiche rien.",
        condition: (_, sibling) => Boolean(sibling?.successCtaLabel),
      },
    },
    {
      name: "legalNotice",
      type: "textarea",
      label: "Mention d'information",
      admin: {
        description:
          "Mention RGPD affichée près du bouton d'envoi, avec le lien vers la politique de confidentialité. Vide = rien ne s'affiche.",
      },
    },
    {
      name: "active",
      type: "checkbox",
      label: "Actif",
      defaultValue: true,
      admin: {
        position: "sidebar",
        description: "Décoché = le site vitrine ne peut plus le servir ni recevoir ses envois.",
      },
    },
    // Version du contenu livré avec le code (voir seedForms) : permet de compléter
    // une définition déjà créée sans écraser ce que l'équipe y a réglé.
    { name: "seedVersion", type: "number", admin: { hidden: true } },
  ],
};
