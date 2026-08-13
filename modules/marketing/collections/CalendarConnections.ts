import type { CollectionConfig, Field } from "payload";

import { isAdmin, metierScoped } from "@/core/access";

/**
 * Agendas connectés d'un partenaire (Google ou Microsoft).
 *
 * Une connexion = un compte. Un partenaire peut en avoir plusieurs (pro, perso) :
 * tous comptent pour les CONFLITS, un seul reçoit les événements créés.
 *
 * ⚠️ Les jetons sont chiffrés en base (voir core/lib/secrets) ET rendus
 * illisibles par l'API : un jeton de rafraîchissement vaut un accès permanent à
 * l'agenda de quelqu'un, il n'a aucune raison de transiter par une réponse JSON,
 * même pour un admin.
 */

/** Champ secret : écrit par les routes OAuth, jamais lu ni écrit via l'API. */
const secret = (name: string): Field =>
  ({
    name,
    type: "text",
    access: { read: () => false, create: () => false, update: () => false },
    admin: { hidden: true },
  }) as Field;

export const CalendarConnections: CollectionConfig = {
  slug: "calendar-connections",
  labels: { singular: "Agenda connecté", plural: "Agendas connectés" },
  admin: {
    useAsTitle: "accountEmail",
    defaultColumns: ["accountEmail", "provider", "partner", "updatedAt"],
    // Gérés depuis l'onglet « Agenda & rendez-vous » de la fiche partenaire.
    hidden: true,
  },
  disableDuplicate: true,
  access: {
    // Le partenaire voit SES connexions ; la création passe par le flux OAuth
    // (route serveur, en overrideAccess), jamais par un POST direct.
    read: metierScoped(),
    create: isAdmin,
    update: isAdmin,
    delete: metierScoped(),
  },
  fields: [
    {
      name: "partner",
      type: "relationship",
      relationTo: "partners",
      required: true,
      index: true,
      admin: { readOnly: true },
    },
    {
      name: "provider",
      type: "select",
      label: "Fournisseur",
      required: true,
      options: [
        { label: "Google Calendar", value: "google" },
        { label: "Microsoft 365", value: "microsoft" },
      ],
      admin: { readOnly: true },
    },
    {
      name: "accountEmail",
      type: "text",
      label: "Compte",
      admin: { readOnly: true },
    },
    {
      /**
       * Agendas retenus pour le calcul des conflits. Vide = aucun conflit lu :
       * on préfère ne rien filtrer plutôt que filtrer sur une liste devinée.
       */
      name: "calendars",
      type: "array",
      label: "Agendas",
      fields: [
        { name: "calendarId", type: "text", required: true, admin: { readOnly: true } },
        { name: "name", type: "text", admin: { readOnly: true } },
        {
          name: "busy",
          type: "checkbox",
          label: "Compte pour mes indisponibilités",
          defaultValue: true,
        },
        {
          name: "target",
          type: "checkbox",
          label: "Reçoit les rendez-vous",
          defaultValue: false,
        },
      ],
    },
    {
      name: "status",
      type: "select",
      label: "État",
      defaultValue: "ok",
      options: [
        { label: "Connecté", value: "ok" },
        { label: "À reconnecter", value: "expired" },
      ],
      admin: { readOnly: true },
    },

    // ─── Jetons (chiffrés, non lisibles par l'API) ───────────────────────────
    secret("accessToken"),
    secret("refreshToken"),
    { name: "expiresAt", type: "date", admin: { hidden: true } },
  ],
};
