import type { CollectionAfterDeleteHook, CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { accessTokenFor, getProvider, targetConnection } from "@/modules/marketing/lib/calendar";
import { APP_V2_HOST_PARTNER_ID } from "@/modules/marketing/lib/app-v2";

/**
 * Rendez-vous pris depuis la page de présentation de la V2 de l'app mobile
 * (/app-mobile-v2) : un tour de l'application avec Charlie, avant la mise en
 * production.
 *
 * Registre TECHNIQUE, hors du menu (NAV_HIDDEN) : le travail commercial se
 * fait sur la fiche prospect et sa tâche datée (voir app-v2-lead). Ce registre
 * garde ce que la fiche ne porte pas — le créneau verrouillé (index unique),
 * l'événement d'agenda à annuler — et la trace brute de ce qui a été déclaré.
 */

/** Titre lisible dans la liste : qui, de quelle société. */
const buildSummary: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const get = (k: string) => String(data?.[k] ?? originalDoc?.[k] ?? "").trim();
  const person = [get("firstName"), get("lastName")].filter(Boolean).join(" ");
  const summary = [get("company"), person].filter(Boolean).join(" — ");
  return { ...data, summary: summary || get("email") || "Rendez-vous" };
};

/**
 * Supprimer le rendez-vous ici le retire aussi de l'agenda — sinon Charlie et
 * le client garderaient une invitation pour une visio que plus rien ne suit.
 * Google prévient lui-même l'invité de l'annulation.
 */
const deleteCalendarEvent: CollectionAfterDeleteHook = async ({ doc, req }) => {
  const eventId = (doc as { eventId?: string | null }).eventId;
  if (!eventId) return;
  try {
    const target = await targetConnection(req.payload, APP_V2_HOST_PARTNER_ID);
    const provider = target ? getProvider(target.connection.provider) : null;
    const token = target && provider ? await accessTokenFor(req.payload, target.connection) : null;
    if (!target || !provider || !token) {
      req.payload.logger.warn(`[app-v2] rendez-vous ${doc.id} supprimé, mais l'événement ${eventId} reste dans l'agenda (agenda inaccessible).`);
      return;
    }
    await provider.deleteEvent(token, target.calendarId, eventId);
  } catch (err) {
    req.payload.logger.error(`[app-v2] suppression de l'événement ${eventId} échouée : ${err}`);
  }
};

export const PresentationBookings: CollectionConfig = {
  slug: "presentation-bookings",
  labels: { singular: "Rendez-vous V2", plural: "Rendez-vous V2" },
  admin: {
    useAsTitle: "summary",
    defaultColumns: ["summary", "at", "client", "email", "createdAt"],
    group: "Marketing",
    description:
      "Tours de l'app mobile V2 réservés depuis la page de présentation (/app-mobile-v2). Supprimer un rendez-vous l'annule aussi dans l'agenda.",
  },
  defaultSort: "at",
  access: {
    read: isAdmin,
    // Réservé par le client depuis la page : le serveur seul crée.
    create: () => false,
    // Le rattachement à la fiche client et les notes se posent à la main.
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [buildSummary],
    afterDelete: [deleteCalendarEvent],
  },
  fields: [
    { name: "summary", type: "text", admin: { hidden: true } },
    {
      name: "at",
      type: "date",
      label: "Rendez-vous",
      required: true,
      // Un créneau, un rendez-vous : c'est la base qui tranche quand deux
      // personnes valident le même créneau à la même seconde.
      unique: true,
      index: true,
      admin: { readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "EEEE d MMMM yyyy 'à' HH:mm" } },
    },
    {
      name: "client",
      type: "relationship",
      relationTo: "partner-clients",
      label: "Fiche client",
      index: true,
      admin: {
        description: "La fiche prospect ou client où le rendez-vous a été posé, avec sa tâche datée.",
      },
    },
    {
      type: "row",
      fields: [
        { name: "firstName", type: "text", label: "Prénom", required: true, admin: { width: "50%", readOnly: true } },
        { name: "lastName", type: "text", label: "Nom", required: true, admin: { width: "50%", readOnly: true } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "email", type: "email", label: "E-mail", required: true, index: true, admin: { width: "50%", readOnly: true } },
        { name: "phone", type: "text", label: "Téléphone", admin: { width: "50%", readOnly: true } },
      ],
    },
    { name: "company", type: "text", label: "Société (déclarée)", required: true, admin: { readOnly: true } },
    { name: "message", type: "textarea", label: "Message du client", admin: { readOnly: true } },
    { name: "notes", type: "textarea", label: "Notes internes" },
    {
      type: "collapsible",
      label: "Agenda",
      admin: { initCollapsed: true },
      fields: [
        { name: "meetingUrl", type: "text", label: "Lien de visio", admin: { readOnly: true } },
        {
          name: "eventId",
          type: "text",
          label: "Identifiant de l'événement",
          admin: {
            readOnly: true,
            description: "Vide : l'événement n'a pas pu être créé — l'invitation est à envoyer à la main.",
          },
        },
      ],
    },
  ],
};
