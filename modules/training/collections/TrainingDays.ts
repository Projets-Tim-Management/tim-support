import type { CollectionBeforeDeleteHook, CollectionConfig } from "payload";

import { isAdmin, metierScoped } from "@/core/access";
import { partnerField } from "@/modules/marketing/collections/clientOwned";
import { deriveOwnerFrom, derivedClientField } from "@/modules/training/collections/trainingOwned";
import { TRAINER_TYPES, TRAINING_MODES } from "@/modules/training/lib/training";

/**
 * Une journée de formation : un jour, un mode (sur place ou à distance), un lieu
 * ou un lien, un formateur. Elle contient une ou plusieurs séances
 * (`training-sessions`) — un formateur qui se déplace forme souvent l'admin et
 * les conducteurs le matin, les chefs de chantier l'après-midi.
 *
 * Le formateur se choisit à la JOURNÉE : c'est lui qui se déplace ou anime la
 * visio. TIM fixe les dates (pas de réservation par le client).
 */

/** Supprimer une journée emporte ses séances. */
const deleteSessions: CollectionBeforeDeleteHook = async ({ id, req }) => {
  await req.payload.delete({ collection: "training-sessions", where: { day: { equals: id } }, overrideAccess: true, req });
};

export const TrainingDays: CollectionConfig = {
  slug: "training-days",
  labels: { singular: "Journée de formation", plural: "Journées de formation" },
  admin: {
    defaultColumns: ["date", "mode", "trainerType", "client"],
    hidden: true,
  },
  disableDuplicate: true,
  access: {
    read: metierScoped(),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [deriveOwnerFrom("training")],
    beforeDelete: [deleteSessions],
  },
  fields: [
    {
      name: "training",
      type: "relationship",
      relationTo: "trainings",
      label: "Formation",
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    derivedClientField,
    partnerField,
    {
      type: "row",
      fields: [
        {
          // Facultative à la création : on bâtit souvent le plan avant de caler
          // les dates. L'étape « Dates fixées » attend que toutes le soient.
          name: "date",
          type: "date",
          label: "Date",
          index: true,
          admin: { width: "50%", date: { pickerAppearance: "dayOnly", displayFormat: "dd/MM/yyyy" } },
        },
        {
          name: "mode",
          type: "select",
          label: "Mode",
          required: true,
          defaultValue: "sur-place",
          options: [...TRAINING_MODES],
          admin: { width: "50%" },
        },
      ],
    },
    {
      name: "location",
      type: "textarea",
      label: "Lieu et consignes",
      admin: { condition: (data) => data?.mode === "sur-place" },
    },
    {
      name: "link",
      type: "text",
      label: "Lien de la visio",
      admin: { condition: (data) => data?.mode === "distance" },
    },
    {
      type: "row",
      fields: [
        {
          name: "trainerType",
          type: "select",
          label: "Formateur",
          required: true,
          defaultValue: "tim",
          options: [...TRAINER_TYPES],
          admin: { width: "50%" },
        },
        {
          name: "trainer",
          type: "relationship",
          relationTo: "users",
          label: "Qui forme",
          index: true,
          admin: { width: "50%" },
        },
      ],
    },
    {
      // Liste de contrôle logistique (salle, vidéoprojecteur, lien testé…),
      // remplie à l'étape « Agenda et e-mails ».
      name: "checklist",
      type: "json",
      admin: { hidden: true },
    },
  ],
};
