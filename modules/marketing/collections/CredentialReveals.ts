import type { CollectionConfig } from "payload";

import { isAdmin, canSupport } from "@/core/access";

/**
 * Demandes d'affichage des mots de passe d'accès, et leur trace.
 *
 * Deux rôles en un seul objet, et c'est délibéré :
 *  - le mécanisme : un code à usage unique, envoyé à l'adresse du demandeur, qui
 *    conditionne l'affichage en clair dans le back-office ;
 *  - le JOURNAL : qui a demandé à voir les accès de quel client, et quand.
 *
 * Le second compte autant que le premier. Un code sans trace protège d'un accès
 * distrait, pas d'un accès malveillant : c'est de savoir que la consultation
 * laisse une trace nominative que vient l'essentiel de la dissuasion.
 *
 * Rien n'est modifiable à la main : les lignes sont écrites par les routes.
 */
export const CredentialReveals: CollectionConfig = {
  slug: "credential-reveals",
  labels: { singular: "Consultation d'accès", plural: "Consultations d'accès" },
  admin: {
    useAsTitle: "id",
    defaultColumns: ["user", "client", "usedAt", "createdAt"],
    group: "Marketing",
    description:
      "Journal des consultations de mots de passe. Lecture seule : chaque ligne est une demande d'affichage.",
  },
  disableDuplicate: true,
  access: {
    // Le journal se lit — c'est son intérêt — mais ne s'écrit ni ne s'efface.
    read: canSupport,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  fields: [
    {
      name: "user",
      type: "relationship",
      relationTo: "users",
      label: "Demandeur",
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "partner-clients",
      label: "Client",
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      // Empreinte seule : le code en clair ne quitte jamais l'e-mail envoyé.
      name: "codeHash",
      type: "text",
      required: true,
      admin: { hidden: true },
    },
    {
      name: "expiresAt",
      type: "date",
      label: "Expire le",
      required: true,
      admin: { readOnly: true, date: { pickerAppearance: "dayAndTime" } },
    },
    {
      name: "attempts",
      type: "number",
      label: "Essais",
      defaultValue: 0,
      admin: { readOnly: true },
    },
    {
      name: "usedAt",
      type: "date",
      label: "Consulté le",
      admin: {
        readOnly: true,
        date: { pickerAppearance: "dayAndTime" },
        description: "Vide = code demandé mais jamais confirmé.",
      },
    },
  ],
};
