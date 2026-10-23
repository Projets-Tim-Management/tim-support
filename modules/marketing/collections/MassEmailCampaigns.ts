import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";

/**
 * Une campagne d'e-mail de masse : ce qui est parti, de qui, à qui, quand.
 *
 * C'est la trace sur laquelle se lisent les statistiques. Chaque campagne a son
 * TAG Brevo (`masse-…`), posé sur chacun de ses e-mails : Brevo rend, pour ce
 * tag, les délivrés, ouvertures, clics, rejets et désinscriptions — que l'onglet
 * « Campagnes envoyées » de l'écran E-mail de masse agrège.
 *
 * Hors menu (NAV_HIDDEN) : on la consulte depuis l'écran, pas en naviguant.
 * Écrite par le serveur seul, au moment de l'envoi.
 */
export const MassEmailCampaigns: CollectionConfig = {
  slug: "mass-email-campaigns",
  labels: { singular: "Campagne d'e-mail", plural: "Campagnes d'e-mail" },
  admin: {
    useAsTitle: "subject",
    defaultColumns: ["subject", "sentAt", "fromEmail", "sentCount"],
    group: "Marketing",
  },
  defaultSort: "-sentAt",
  access: {
    read: isAdmin,
    create: () => false,
    update: () => false,
    delete: isAdmin,
  },
  fields: [
    { name: "subject", type: "text", label: "Objet", required: true },
    { name: "sentAt", type: "date", label: "Envoyée le", required: true, index: true },
    {
      // Tag Brevo de chaque e-mail de la campagne : la clé des statistiques.
      name: "tag",
      type: "text",
      label: "Tag Brevo",
      required: true,
      unique: true,
      index: true,
    },
    { name: "fromEmail", type: "text", label: "Expéditeur" },
    { name: "withSignature", type: "checkbox", label: "Avec signature", defaultValue: true },
    { name: "templateLabel", type: "text", label: "Modèle de départ" },
    { name: "sentBy", type: "relationship", relationTo: "users", label: "Envoyée par" },
    { name: "body", type: "textarea", label: "Message" },
    { name: "closing", type: "text", label: "Formule de politesse" },
    { name: "sentCount", type: "number", label: "Envoyés", defaultValue: 0 },
    { name: "suppressedCount", type: "number", label: "Non envoyés (désinscrits)", defaultValue: 0 },
    { name: "failedCount", type: "number", label: "Échecs", defaultValue: 0 },
    {
      // [{ email, status }] — ce que l'envoi a fait pour chaque adresse.
      name: "recipients",
      type: "json",
      label: "Destinataires",
    },
  ],
};
