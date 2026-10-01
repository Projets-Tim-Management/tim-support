import type { CollectionBeforeChangeHook, CollectionConfig, Validate } from "payload";

import { isAdmin, metierScoped } from "@/core/access";
import { partnerField } from "@/modules/marketing/collections/clientOwned";
import { deriveOwnerFrom, derivedClientField, trainingRefId } from "@/modules/training/collections/trainingOwned";
import { ACCESS_DELIVERY, SESSION_STATUSES, TRAINING_PROFILE_OPTIONS } from "@/modules/training/lib/training";

/**
 * Une séance dans une journée de formation : des horaires, un groupe de profils
 * (« Admin + Conducteurs », « Chefs de chantier »…), les personnes attendues.
 *
 * Les participants sont des UTILISATEURS TIM du client (`client-contacts` : ce
 * sont eux qui portent un profil de licence et un mot de passe), pas des
 * salariés — on forme ceux qui auront un compte.
 *
 * La séance se valide par l'ÉMARGEMENT (les présents cochés) : le clic est le
 * geste, pas une déclaration (voir la règle « validation = geste réel »).
 */

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

const validateTime: Validate = (value) =>
  value == null || value === "" || HHMM.test(String(value)) ? true : "Heure au format HH:MM (ex. 09:00).";

/**
 * Participants et présents appartiennent au client de la séance. Le sélecteur
 * le filtre déjà ; on le vérifie ici parce qu'une écriture par l'API ne passe
 * pas par le sélecteur — et qu'un présent d'un autre client recevrait ses
 * identifiants et son récapitulatif.
 */
const sameClientPeople: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  const clientId = trainingRefId(data?.client ?? originalDoc?.client);
  const ids = new Set<string>();
  for (const field of ["participants", "attendance"] as const) {
    for (const ref of (data?.[field] ?? []) as unknown[]) {
      const id = trainingRefId(ref);
      if (id != null) ids.add(String(id));
    }
  }
  if (!ids.size) return data;
  if (clientId == null) throw new Error("Séance sans client : impossible de vérifier ses participants.");
  const found = await req.payload.find({
    collection: "client-contacts",
    where: { and: [{ id: { in: [...ids] } }, { client: { equals: clientId } }] },
    limit: ids.size,
    depth: 0,
    overrideAccess: true,
    req,
  });
  if (found.docs.length !== ids.size) {
    throw new Error("Un participant de cette séance n'appartient pas à ce client.");
  }
  return data;
};

/** Un présent est forcément un participant : on émarge parmi les personnes attendues. */
const attendanceWithinParticipants: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const participants = new Set(
    ((data?.participants ?? originalDoc?.participants ?? []) as unknown[]).map((r) => String(trainingRefId(r))),
  );
  const attendance = (data?.attendance ?? []) as unknown[];
  if (attendance.some((r) => !participants.has(String(trainingRefId(r))))) {
    throw new Error("Un présent coché ne fait pas partie des participants de la séance.");
  }
  return data;
};

export const TrainingSessions: CollectionConfig = {
  slug: "training-sessions",
  labels: { singular: "Séance de formation", plural: "Séances de formation" },
  admin: {
    defaultColumns: ["order", "profiles", "startTime", "status"],
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
    beforeChange: [deriveOwnerFrom("day"), sameClientPeople, attendanceWithinParticipants],
  },
  fields: [
    {
      name: "day",
      type: "relationship",
      relationTo: "training-days",
      label: "Journée",
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "training",
      type: "relationship",
      relationTo: "trainings",
      label: "Formation",
      index: true,
      admin: { readOnly: true },
    },
    derivedClientField,
    partnerField,
    {
      type: "row",
      fields: [
        { name: "order", type: "number", label: "Rang", defaultValue: 1, min: 1, admin: { width: "20%" } },
        { name: "startTime", type: "text", label: "Début", validate: validateTime, admin: { width: "20%", placeholder: "09:00" } },
        { name: "endTime", type: "text", label: "Fin", validate: validateTime, admin: { width: "20%", placeholder: "12:00" } },
        {
          name: "status",
          type: "select",
          label: "Statut",
          required: true,
          defaultValue: "planifiee",
          options: [...SESSION_STATUSES],
          admin: { width: "40%" },
        },
      ],
    },
    {
      name: "profiles",
      type: "select",
      label: "Profils formés",
      hasMany: true,
      required: true,
      options: TRAINING_PROFILE_OPTIONS,
    },
    {
      name: "participants",
      type: "relationship",
      relationTo: "client-contacts",
      hasMany: true,
      label: "Participants",
      filterOptions: ({ data }) => {
        const clientId = trainingRefId(data?.client);
        return clientId != null ? { client: { equals: clientId } } : false;
      },
    },
    {
      // Vide = la valeur par défaut de la formation.
      name: "accessDelivery",
      type: "select",
      label: "Remise des accès",
      options: [...ACCESS_DELIVERY],
      admin: { description: "Laisser vide pour reprendre le réglage de la formation." },
    },
    {
      name: "attendance",
      type: "relationship",
      relationTo: "client-contacts",
      hasMany: true,
      label: "Présents",
      admin: { readOnly: true },
    },
    {
      type: "row",
      fields: [
        { name: "attendanceAt", type: "date", label: "Émargée le", admin: { width: "33%", readOnly: true } },
        { name: "attendanceBy", type: "relationship", relationTo: "users", label: "Émargée par", admin: { width: "33%", readOnly: true } },
        { name: "accessDeliveredAt", type: "date", label: "Accès remis le", admin: { width: "34%", readOnly: true } },
      ],
    },
  ],
};
