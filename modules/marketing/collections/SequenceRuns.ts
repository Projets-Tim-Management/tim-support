import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Séquences de relance en cours — une par prospect enrôlé.
 *
 * Ouverte automatiquement quand une opportunité passe en « Perdue », et fermée
 * dès que la personne répond, se désinscrit, ressort de « Perdue », ou qu'on
 * l'arrête à la main.
 *
 * Le calendrier est posé À L'ENRÔLEMENT, pas recalculé à chaque envoi : on peut
 * ainsi montrer ce qui partira et quand, et décaler un message sans toucher au
 * reste.
 */

/** Titre lisible : une liste d'identifiants ne dit pas de qui il s'agit. */
const buildSummary: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const email = data?.email ?? originalDoc?.email ?? "";
  const seq = data?.sequenceLabel ?? originalDoc?.sequenceLabel ?? "Séquence";
  return { ...data, summary: [seq, email].filter(Boolean).join(" — ") || "Séquence" };
};

/**
 * Une séquence arrêtée doit dire POURQUOI.
 *
 * Sans motif, on ne sait plus si la personne a répondu, s'est désinscrite, ou si
 * quelqu'un a interrompu la séquence après un appel — trois situations qui
 * n'appellent pas du tout le même geste commercial ensuite.
 */
const requireStopReason: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const status = data?.status ?? originalDoc?.status;
  if (status !== "arretee") return data;
  if (data?.stopReason ?? originalDoc?.stopReason) return data;
  // Une interruption depuis l'écran est manuelle par défaut : c'est le seul
  // motif qu'un humain puisse produire en changeant le statut à la main.
  return { ...data, stopReason: "manuelle" };
};

export const SequenceRuns: CollectionConfig = {
  slug: "sequence-runs",
  labels: { singular: "Séquence", plural: "Séquences de relance" },
  admin: {
    useAsTitle: "summary",
    defaultColumns: ["summary", "status", "client", "startedAt"],
    group: "Marketing",
    description:
      "Les relances après une affaire perdue. Passer le statut à « Arrêtée » interrompt les envois à venir.",
  },
  access: { read: isAdmin, create: () => false, update: isAdmin, delete: isAdmin },
  hooks: { beforeChange: [buildSummary, requireStopReason] },
  fields: [
    { name: "summary", type: "text", admin: { hidden: true } },
    // Nom lisible de la séquence au moment de l'enrôlement, pour le titre.
    { name: "sequenceLabel", type: "text", admin: { hidden: true } },
    {
      type: "row",
      fields: [
        {
          name: "client",
          type: "relationship",
          relationTo: "partner-clients",
          label: "Opportunité",
          required: true,
          index: true,
          admin: { width: "50%", readOnly: true },
        },
        {
          /**
           * Copie de l'adresse au moment de l'enrôlement. La fiche peut changer
           * d'e-mail ; la séquence doit continuer d'écrire à la personne qu'elle
           * a enrôlée, pas à une autre.
           */
          name: "email",
          type: "email",
          label: "Destinataire",
          required: true,
          index: true,
          admin: { width: "50%", readOnly: true },
        },
      ],
    },
    {
      type: "row",
      fields: [
        {
          // Clé de la séquence, copiée à l'enrôlement : le modèle peut être
          // renommé ou supprimé, la séquence en cours doit rester lisible.
          name: "sequence",
          type: "text",
          label: "Séquence",
          required: true,
          index: true,
          admin: { width: "34%", readOnly: true },
        },
        {
          name: "status",
          type: "select",
          label: "État",
          required: true,
          defaultValue: "en-cours",
          options: [
            { label: "En cours", value: "en-cours" },
            { label: "Terminée", value: "terminee" },
            { label: "Arrêtée", value: "arretee" },
          ],
          index: true,
          admin: {
            width: "33%",
            description: "« Arrêtée » interrompt tous les envois restants.",
          },
        },
        {
          name: "stopReason",
          type: "select",
          label: "Motif d'arrêt",
          options: [
            { label: "Le prospect a répondu", value: "reponse" },
            { label: "Arrêtée à la main", value: "manuelle" },
            { label: "Désinscription", value: "desinscription" },
            { label: "Sortie de « Perdue »", value: "statut-change" },
          ],
          admin: {
            width: "33%",
            condition: (data) => data?.status === "arretee",
          },
        },
      ],
    },
    {
      name: "stopNote",
      type: "textarea",
      label: "Précision",
      admin: {
        condition: (data) => data?.status === "arretee",
        description: "Facultatif — ce que le motif ne dit pas.",
      },
    },
    {
      name: "startedAt",
      type: "date",
      label: "Enrôlé le",
      admin: { readOnly: true, date: { displayFormat: "dd/MM/yyyy" } },
    },
    {
      name: "messages",
      type: "array",
      label: "Messages",
      admin: {
        description:
          "Daté à l'enrôlement. Une date modifiée décale ce message seul, pas la suite.",
        initCollapsed: true,
        components: {
          RowLabel: "/modules/marketing/admin/SequenceMessageRowLabel#SequenceMessageRowLabel",
        },
      },
      fields: [
        {
          type: "row",
          fields: [
            {
              name: "key",
              type: "text",
              label: "Message",
              required: true,
              admin: { width: "50%", readOnly: true },
            },
            {
              name: "scheduledAt",
              type: "date",
              label: "Prévu le",
              required: true,
              admin: { width: "50%", date: { displayFormat: "dd/MM/yyyy" } },
            },
          ],
        },
        {
          type: "row",
          fields: [
            {
              name: "sentAt",
              type: "date",
              label: "Envoyé le",
              admin: {
                width: "50%",
                readOnly: true,
                date: { displayFormat: "dd/MM/yyyy HH:mm" },
              },
            },
            {
              name: "skipped",
              type: "select",
              label: "Non envoyé",
              options: [
                { label: "Adresse désinscrite", value: "desinscrit" },
                { label: "Échec d'envoi", value: "echec" },
              ],
              admin: { width: "50%", readOnly: true },
            },
          ],
        },
      ],
    },
  ],
};
