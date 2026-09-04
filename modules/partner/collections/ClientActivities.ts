import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { metierOwnedAccess } from "@/core/access";
import { enforcePartnerField } from "@/core/hooks/enforcePartner";
import { setPartnerFromClient } from "@/modules/marketing/collections/clientOwned";
import { ACTIVITY_OPTIONS, TASK_KIND_OPTIONS, activityKind } from "@/modules/partner/lib/activity";

/**
 * Historique d'une opportunité : tout ce qui a été fait, dans l'ordre.
 *
 * Une ligne = un fait. Trois familles :
 *  - ce qu'on a FAIT à la main (note, appel, réunion, e-mail envoyé) ;
 *  - ce qu'on doit faire (tâche, avec échéance et rappel) ;
 *  - ce que le système CONSTATE (changement de statut, contrat signé, lead
 *    importé) — écrit par les hooks de la fiche client, jamais à la main.
 *
 * Gérée depuis l'onglet « Historique » de la fiche (chronologie + composeur), et
 * listable globalement pour retrouver ses tâches en cours.
 *
 * Même socle RBAC que les contacts : rattachée à un client, scopée par `partner`
 * (dérivé du client puis verrouillé par `enforcePartnerField`).
 */

/**
 * Auteur = l'utilisateur connecté, posé une seule fois à la création.
 *
 * Jamais réécrit ensuite : une note reste de qui l'a écrite, même si un admin la
 * corrige plus tard. Une entrée de journal n'a pas d'auteur — c'est le système.
 */
const setAuthor: CollectionBeforeChangeHook = ({ data, operation, req }) => {
  // Une entrée de journal n'a pas d'auteur — elle CONSTATE. Y inscrire celui qui
  // a enregistré la fiche attribuerait « Étape : Nouvelle → Gagnée » à la
  // personne qui passait par là.
  if (data.type === "systeme") return data;
  if (operation === "create" && !data.author && req.user?.id) data.author = req.user.id;
  return data;
};

/**
 * Date de l'événement : par défaut maintenant.
 *
 * Champ distinct de `createdAt` parce qu'on consigne souvent APRÈS coup (« appel
 * d'hier soir ») : la chronologie doit suivre le moment du fait, pas celui de la
 * saisie.
 */
const setOccurredAt: CollectionBeforeChangeHook = ({ data, operation }) => {
  if (operation === "create" && !data.occurredAt) data.occurredAt = new Date().toISOString();
  return data;
};

/** Cocher « fait » date l'accomplissement ; décocher l'efface. */
const stampDone: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const done = data?.done ?? originalDoc?.done;
  if (done && !originalDoc?.doneAt) data.doneAt = new Date().toISOString();
  if (!done) data.doneAt = null;
  return data;
};

/** Titre lisible (colonnes + drawer) : « Appel — rappeler lundi ». */
const setDisplayName: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const kind = activityKind(data?.type ?? originalDoc?.type)?.label ?? "Activité";
  const detail = (data?.title ?? originalDoc?.title ?? data?.content ?? originalDoc?.content ?? "")
    .toString()
    .split("\n")[0]
    .slice(0, 60);
  data.displayName = detail ? `${kind} — ${detail}` : kind;
  return data;
};

/** Champ visible uniquement pour les tâches. */
const taskOnly = (data?: { type?: string }) => data?.type === "tache";

export const ClientActivities: CollectionConfig = {
  slug: "client-activities",
  labels: { singular: "Activité", plural: "Historique client" },
  admin: {
    useAsTitle: "displayName",
    defaultColumns: ["displayName", "client", "type", "occurredAt", "dueDate", "done"],
    group: "Partenaires",
    // JAMAIS dans le menu latéral : l'historique se lit et s'écrit depuis
    // l'onglet « Historique » d'une opportunité, où il a son contexte. Une liste
    // globale d'activités détachées de leur fiche ne se lit pas — et les tâches
    // remontent déjà seules, par le récapitulatif du matin.
    hidden: true,
    description:
      "Notes, e-mails, tâches et journal automatique des opportunités.",
  },
  defaultSort: "-occurredAt",
  disableDuplicate: true,
  access: metierOwnedAccess,
  hooks: {
    beforeChange: [
      setPartnerFromClient,
      enforcePartnerField(),
      setAuthor,
      setOccurredAt,
      stampDone,
      setDisplayName,
    ],
  },
  fields: [
    {
      name: "client",
      type: "relationship",
      relationTo: "partner-clients",
      label: "Opportunité",
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      type: "row",
      fields: [
        {
          name: "type",
          type: "select",
          label: "Type",
          required: true,
          defaultValue: "note",
          options: ACTIVITY_OPTIONS,
          admin: { width: "50%" },
        },
        {
          name: "occurredAt",
          type: "date",
          label: "Date",
          index: true,
          admin: {
            width: "50%",
            date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
            description: "Quand le fait a eu lieu (pas quand il a été saisi).",
          },
        },
      ],
    },
    {
      name: "title",
      type: "text",
      label: "Intitulé",
      admin: { description: "Nom de la tâche, objet de l'e-mail, sujet de l'appel." },
    },
    { name: "content", type: "textarea", label: "Détail" },

    // ── Tâche ────────────────────────────────────────────────────────────────
    {
      name: "taskKind",
      type: "select",
      label: "Type de tâche",
      defaultValue: "a-faire",
      options: TASK_KIND_OPTIONS,
      admin: {
        condition: taskOnly,
        description: "Ce qu'il faudra faire : appeler, écrire, se voir…",
      },
    },
    {
      type: "row",
      admin: { condition: taskOnly },
      fields: [
        {
          name: "dueDate",
          type: "date",
          label: "Échéance",
          index: true,
          admin: {
            width: "50%",
            date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
          },
        },
        {
          name: "reminderAt",
          type: "date",
          label: "Rappel",
          index: true,
          admin: {
            width: "50%",
            date: { pickerAppearance: "dayAndTime", displayFormat: "dd/MM/yyyy HH:mm" },
            description: "Un e-mail part à cette heure-là. Vide = pas de rappel.",
          },
        },
      ],
    },
    {
      type: "row",
      admin: { condition: taskOnly },
      fields: [
        {
          name: "highPriority",
          type: "checkbox",
          label: "Priorité haute",
          admin: { width: "50%" },
        },
        { name: "done", type: "checkbox", label: "Terminée", admin: { width: "50%" } },
      ],
    },
    {
      name: "doneAt",
      type: "date",
      label: "Terminée le",
      admin: { readOnly: true, condition: (data) => Boolean(data?.doneAt) },
    },
    /**
     * Rappel déjà parti : sans cette trace, le cron renverrait le même e-mail à
     * chaque passage. Posée par le cron, jamais à la main.
     */
    { name: "reminderSentAt", type: "date", admin: { hidden: true } },

    // ── E-mail : envoyé depuis la fiche, ou capté dans un échange ────────────
    {
      /**
       * Sens du message, du point de vue de la fiche.
       *
       * Absent sur les e-mails partis du drawer : ceux-là sont toujours sortants,
       * et l'écrire aurait été une redite. Il n'apparaît que sur ce qui a été
       * CAPTÉ — où la question se pose vraiment.
       */
      name: "emailDirection",
      type: "select",
      label: "Sens",
      options: [
        { label: "Reçu du prospect", value: "recu" },
        { label: "Envoyé au prospect", value: "envoye" },
      ],
      index: true,
      admin: {
        readOnly: true,
        condition: (data) => Boolean(data?.emailDirection),
      },
    },
    {
      /**
       * `Message-ID` de l'e-mail d'origine — l'identifiant que lui a donné le
       * serveur qui l'a expédié.
       *
       * Conservé pour ne pas écrire deux fois le même échange : un fil où deux
       * partenaires sont en copie nous parvient deux fois, et une reprise du
       * webhook après une erreur le rejouerait.
       */
      name: "sourceMessageId",
      type: "text",
      index: true,
      admin: { hidden: true },
    },
    {
      /**
       * Les NOMS des pièces jointes d'un échange capté, pas les fichiers.
       *
       * Décision assumée : « je vous ai envoyé le devis » se vérifie avec un nom
       * et une date. Stocker les fichiers d'une correspondance entière ferait
       * gonfler le stockage et nous ferait détenir des documents que personne ne
       * nous a confiés.
       */
      name: "attachmentNames",
      type: "text",
      label: "Pièces jointes",
      admin: {
        readOnly: true,
        condition: (data) => Boolean(data?.attachmentNames),
        description: "Noms seulement — les fichiers ne sont pas conservés.",
      },
    },
    {
      name: "recipients",
      type: "text",
      label: "Destinataires",
      admin: {
        readOnly: true,
        condition: (data) => data?.type === "email" && Boolean(data?.recipients),
      },
    },

    {
      // Ce qui est PARTI avec l'e-mail. Conservé sur l'activité et non déduit du
      // message : six mois plus tard, « je vous ai envoyé le devis » se vérifie
      // ici, pas dans une boîte de messagerie.
      name: "attachments",
      type: "upload",
      relationTo: "media",
      hasMany: true,
      label: "Pièces jointes",
      admin: {
        readOnly: true,
        condition: (data) => data?.type === "email" && Boolean(data?.attachments?.length),
      },
    },
    {
      name: "author",
      type: "relationship",
      relationTo: "users",
      label: "Auteur",
      admin: { readOnly: true, position: "sidebar" },
    },
    // Clé de scoping RBAC, dérivée du client.
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      index: true,
      admin: { hidden: true },
    },
    { name: "displayName", type: "text", admin: { hidden: true } },
  ],
};
