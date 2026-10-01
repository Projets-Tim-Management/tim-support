import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, CollectionConfig } from "payload";

import { hasAdminRole, isAdmin, metierScoped } from "@/core/access";
import { partnerField } from "@/modules/marketing/collections/clientOwned";
import { deriveOwnerFrom, derivedClientField, trainingRefId } from "@/modules/training/collections/trainingOwned";
import { scheduleDayEmails, type DayEmailRow } from "@/modules/training/lib/email-schedule";
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

/**
 * Le formateur correspond à son type, et son nom est recopié à l'écriture.
 *
 * « Équipe TIM » = un compte admin ; « Partenaire » = un compte de la fiche
 * partenaire du client. Le sélecteur ne propose que ceux-là, on le vérifie
 * ici parce qu'une écriture par l'API ne passe pas par lui.
 *
 * Le nom est copié parce qu'un partenaire ne peut pas lire les comptes de TIM
 * (Users : admin ou soi-même) : sans lui, il ne saurait pas qui vient former
 * son client.
 */
const checkTrainer: CollectionBeforeChangeHook = async ({ data, originalDoc, req }) => {
  if (!data) return data;
  const id = trainingRefId(data.trainer ?? (("trainer" in data) ? null : originalDoc?.trainer));
  if (id == null) return { ...data, trainerName: null };
  const type = (data.trainerType ?? originalDoc?.trainerType ?? "tim") as string;
  // Formateur et type inchangés : on ne revérifie pas. Un compte qui a perdu
  // son rôle depuis ne doit pas empêcher de corriger la date ou l'adresse.
  const unchanged =
    originalDoc != null &&
    String(id) === String(trainingRefId(originalDoc.trainer)) &&
    type === (originalDoc.trainerType ?? "tim");
  if (unchanged) return data;
  const u = (await req.payload.findByID({ collection: "users", id, depth: 0, overrideAccess: true, req })) as {
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
    roles?: string[] | null;
    partner?: unknown;
  };
  if (type === "tim" && !hasAdminRole(u)) {
    throw new Error("Formateur « Équipe TIM » : choisissez un compte TIM.");
  }
  if (type === "partenaire") {
    const partnerId = trainingRefId(data.partner ?? originalDoc?.partner);
    if (partnerId == null || String(trainingRefId(u.partner)) !== String(partnerId)) {
      throw new Error("Formateur « Partenaire » : choisissez un compte du partenaire de ce client.");
    }
  }
  const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || null;
  return { ...data, trainerName: name };
};

/**
 * Les envois de la journée, recalculés quand sa DATE change (ou à la
 * création) : même règle que la phase de test — on ne redate pas à chaque
 * enregistrement, sinon le resserrement « à moins de 7 jours » glisserait
 * avec l'horloge. Les envois partis et les dates réglées à la main restent.
 */
const scheduleEmails: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (!data) return data;
  const date = (data.date ?? (("date" in data) ? null : originalDoc?.date)) as string | null;
  const current = ((data.emails ?? originalDoc?.emails ?? []) as DayEmailRow[]).map((r) => ({ ...r }));
  const dateChanged = String(date ?? "") !== String(originalDoc?.date ?? "");
  if (!dateChanged && current.length) return data;
  // Redatée : le cycle repart (une convocation partie annonçait l'ancienne date).
  return { ...data, emails: scheduleDayEmails(date, current, new Date(), dateChanged && originalDoc != null) };
};

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
    beforeChange: [deriveOwnerFrom("training"), checkTrainer, scheduleEmails],
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
      // L'adresse, choisie dans la Base Adresse Nationale (texte libre accepté :
      // une adresse à l'étranger n'y figure pas).
      name: "location",
      type: "textarea",
      label: "Adresse",
      admin: { condition: (data) => data?.mode === "sur-place" },
    },
    {
      name: "link",
      type: "text",
      label: "Lien de la visio",
      admin: { condition: (data) => data?.mode === "distance" },
    },
    {
      // Sur place : salle, étage, interlocuteur, parking. À distance : code
      // d'accès, numéro à appeler en cas de souci. Repris dans la convocation.
      name: "locationDetails",
      type: "textarea",
      label: "Complément",
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
    { name: "trainerName", type: "text", label: "Nom du formateur", admin: { readOnly: true } },
    {
      // Les envois de la journée (convocation, rappel, brief du formateur…),
      // datés depuis la journée. Gérés depuis l'onglet « E-mails » du plan.
      name: "emails",
      type: "array",
      label: "Envois",
      admin: { readOnly: true },
      fields: [
        { name: "key", type: "text", required: true },
        { name: "scheduledAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
        { name: "overridden", type: "checkbox", defaultValue: false },
        { name: "sentAt", type: "date", admin: { date: { pickerAppearance: "dayAndTime" } } },
        {
          name: "recipients",
          type: "array",
          fields: [
            { name: "email", type: "text", required: true },
            { name: "name", type: "text" },
            { name: "sentAt", type: "date" },
          ],
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
