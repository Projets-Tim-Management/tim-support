import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { SUPPRESSION_REASONS } from "@/core/lib/email-suppression";

/**
 * Les adresses auxquelles on n'envoie plus rien de commercial.
 *
 * Une seule liste pour tout le logiciel : une personne qui se désinscrit d'une
 * séquence de relance ne doit pas recevoir le prochain envoi de masse parce
 * qu'il vient d'un autre module.
 *
 * ⚠️ Elle ne bloque QUE le commercial. Un accusé de réception, un e-mail de
 * ticket ou un code de connexion continuent de partir : ils répondent à un geste
 * de la personne, ils ne se refusent pas d'avance.
 *
 * Ajout manuel possible — un prospect qui demande par téléphone à ne plus rien
 * recevoir doit pouvoir être inscrit sans attendre qu'il clique quelque part.
 */
export const EmailSuppressions: CollectionConfig = {
  slug: "email-suppressions",
  labels: { singular: "Adresse désinscrite", plural: "Désinscriptions" },
  admin: {
    useAsTitle: "email",
    defaultColumns: ["email", "reason", "source", "createdAt"],
    group: "Marketing",
    description:
      "Adresses qui ne reçoivent plus d'envoi commercial. Les e-mails de service (tickets, accusés de réception, codes de connexion) continuent de partir.",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  fields: [
    {
      name: "email",
      type: "email",
      label: "Adresse",
      required: true,
      unique: true,
      index: true,
      admin: { description: "Enregistrée en minuscules — la casse ne doit pas créer de doublon." },
    },
    {
      name: "reason",
      type: "select",
      label: "Motif",
      required: true,
      defaultValue: "manuelle",
      options: [...SUPPRESSION_REASONS],
      index: true,
    },
    {
      name: "source",
      type: "text",
      label: "Origine",
      admin: {
        readOnly: true,
        description: "Ce qui a provoqué l'inscription : lien de désinscription, événement Brevo…",
      },
    },
    {
      name: "note",
      type: "textarea",
      label: "Note",
      admin: { description: "Facultatif — le contexte, quand l'ajout est manuel." },
    },
  ],
  hooks: {
    // La casse ne doit jamais créer deux lignes pour la même personne : sans ça,
    // « Jean@X.fr » resterait joignable après une désinscription de « jean@x.fr ».
    beforeChange: [
      ({ data }) =>
        data?.email ? { ...data, email: String(data.email).trim().toLowerCase() } : data,
    ],
  },
};
