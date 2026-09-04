import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { CHANNELS, CHOICE_TYPES, FIELD_TYPES } from "@/modules/forms/lib/form-schema";

/**
 * Définitions des formulaires du site vitrine.
 *
 * Le site ne code plus ses formulaires : il lit `GET /api/forms/<formId>` et rend
 * ce qu'il reçoit. Modifier un libellé, ajouter un champ ou rendre une question
 * facultative se fait donc ICI, sans déploiement ni des deux côtés — c'est la
 * seule façon de ne pas régresser par rapport à Brevo, où ces gestes étaient à la
 * portée du marketing.
 *
 * Réservé aux admins : un formulaire est servi publiquement sur tim-management.co,
 * ce n'est pas un réglage de partenaire.
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
      /**
       * Les champs. L'ORDRE de cette liste est l'ordre d'affichage sur le site :
       * la vitrine rend ce qu'elle reçoit, sans le réordonner.
       */
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
           * Les choix d'une liste. `value` est l'identifiant posté et stocké ;
           * `label` est ce que voit le visiteur.
           *
           * Les deux sont séparés pour une raison précise : les formulaires Brevo
           * postaient des CODES NUMÉRIQUES (`COLLABORATEURS=3` pour « 26 - 50 »),
           * si bien qu'une soumission ne se lisait pas sans table de correspondance.
           * Ici la valeur reste stable et parlante, et le libellé se corrige sans
           * toucher aux soumissions passées.
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
