import type {
  CollectionBeforeChangeHook,
  CollectionBeforeDeleteHook,
  CollectionBeforeValidateHook,
  CollectionConfig,
} from "payload";

import { isAdmin, metierScoped } from "@/core/access";
import { clientField, partnerField, setPartnerFromClient } from "@/modules/marketing/collections/clientOwned";
import { trainingRefId } from "@/modules/training/collections/trainingOwned";
import { ACCESS_DELIVERY, TRAINING_STATUSES, isTrainingClosed } from "@/modules/training/lib/training";

/**
 * Le parcours « Formation » d'un client — une ligne par formation.
 *
 * FACULTATIF : ouvert à la main par TIM (encart « Formation » de la fiche, ou
 * case « Formation incluse » du passage « En signature »), quand l'entreprise a
 * une formation, payée ou offerte. Aucun devis détaillé ne permet de le
 * constater : c'est donc le geste d'ouverture qui fait foi.
 *
 * Il ne change PAS le statut de la fiche et coexiste avec la phase de test et la
 * mise en production. Le plan (journées → séances) vit dans `training-days` et
 * `training-sessions`. Voir docs/PLAN-FORMATION.md.
 *
 * Seul TIM écrit (règle du 01/10/2026 : TIM fait le plan et fixe les dates) ; le
 * partenaire lit les formations de ses clients.
 */

const OPEN = "ouvert";

/**
 * Une seule formation OUVERTE par client : deux plans vivants donneraient deux
 * séries de convocations pour les mêmes personnes. Une formation close (terminée
 * ou annulée) ne gêne pas — un client peut en suivre une seconde plus tard.
 */
const oneOpenTrainingPerClient: CollectionBeforeValidateHook = async ({ data, originalDoc, req }) => {
  const status = (data?.status ?? originalDoc?.status ?? OPEN) as string;
  if (status !== OPEN) return data;
  const clientId = trainingRefId(data?.client ?? originalDoc?.client);
  if (clientId == null) return data;
  const existing = await req.payload.find({
    collection: "trainings",
    where: { client: { equals: clientId }, status: { equals: OPEN } },
    limit: 2,
    depth: 0,
    overrideAccess: true,
    req,
  });
  const other = existing.docs.find((d) => String(d.id) !== String(originalDoc?.id ?? ""));
  if (other) {
    throw new Error("Ce client a déjà une formation en cours. Terminez-la ou annulez-la avant d'en ouvrir une autre.");
  }
  return data;
};

/** Qui a ouvert, quand ; date de clôture posée et retirée avec le statut. */
const stampLifecycle: CollectionBeforeChangeHook = ({ data, originalDoc, operation, req }) => {
  const next = { ...data };
  const now = new Date().toISOString();
  if (operation === "create") {
    next.openedAt = now;
    // Sans utilisateur sur la requête (ouverture depuis un hook, hors
    // transaction), l'auteur arrive dans les données.
    if (req.user?.collection === "users") next.openedBy = req.user.id;
  }
  const status = (next.status ?? originalDoc?.status) as string | undefined;
  const wasClosed = isTrainingClosed(originalDoc?.status as string | undefined);
  if (isTrainingClosed(status) && !wasClosed) next.closedAt = now;
  if (!isTrainingClosed(status)) next.closedAt = null;
  return next;
};

/** Supprimer une formation emporte son plan : des journées orphelines n'ont aucun sens. */
const deletePlan: CollectionBeforeDeleteHook = async ({ id, req }) => {
  for (const collection of ["training-sessions", "training-days"] as const) {
    await req.payload.delete({ collection, where: { training: { equals: id } }, overrideAccess: true, req });
  }
};

export const Trainings: CollectionConfig = {
  slug: "trainings",
  labels: { singular: "Formation", plural: "Formations" },
  admin: {
    defaultColumns: ["client", "status", "openedAt"],
    // Gérée depuis la fiche client (encart « Formation »).
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
    beforeValidate: [oneOpenTrainingPerClient],
    beforeChange: [setPartnerFromClient, stampLifecycle],
    beforeDelete: [deletePlan],
  },
  fields: [
    clientField,
    partnerField,
    {
      type: "row",
      fields: [
        {
          name: "status",
          type: "select",
          label: "Statut",
          required: true,
          defaultValue: OPEN,
          options: [...TRAINING_STATUSES],
          admin: { width: "50%" },
        },
        {
          name: "defaultAccessDelivery",
          type: "select",
          label: "Remise des accès",
          required: true,
          defaultValue: "formateur",
          options: [...ACCESS_DELIVERY],
          admin: { width: "50%", description: "Valeur par défaut de chaque séance, modifiable séance par séance." },
        },
      ],
    },
    { name: "notes", type: "textarea", label: "Notes internes" },
    {
      type: "row",
      fields: [
        { name: "openedAt", type: "date", label: "Ouverte le", admin: { width: "33%", readOnly: true } },
        { name: "openedBy", type: "relationship", relationTo: "users", label: "Ouverte par", admin: { width: "33%", readOnly: true } },
        { name: "closedAt", type: "date", label: "Close le", admin: { width: "34%", readOnly: true } },
      ],
    },
  ],
};
