import type { CollectionBeforeChangeHook, CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { BOOKING_STATUSES, LOCATION_KINDS, PROBLEM_KINDS } from "@/modules/booking/lib/constants";
import { HEARD_FROM } from "@/modules/booking/lib/heard-from";

/**
 * LES RENDEZ-VOUS pris sur une page publique (/rdv/<type>) — un par réservation, déplacé sur place, annulé sans être
 * effacé. Écrits par le serveur (routes publiques) ; l'équipe y lit le détail, les réponses, la source du lead, et
 * SURTOUT les problèmes : un agenda illisible ou un e-mail qui n'est pas parti n'empêche jamais une réservation — le
 * rendez-vous et le prospect sont enregistrés, et le problème s'affiche ici pour qu'on appelle le prospect.
 *
 * `slotKey` (« membre|début ») est unique : deux réservations du même membre au même instant sont impossibles, même
 * à la même seconde. Il se vide à l'annulation, pour libérer le créneau.
 */
/**
 * La clé du créneau suit l'état (relecture du 16/11/2026) : un rendez-vous annulé depuis le back-office libère son
 * créneau comme une annulation du prospect — sinon le créneau, de nouveau proposé, serait refusé à chaque réservation
 * par l'index unique. Remis « confirmé », il le reprend.
 */
const slotKeyFollowsStatus: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const status = data?.status ?? originalDoc?.status;
  const host = data?.host ?? originalDoc?.host;
  const start = data?.start ?? originalDoc?.start;
  const hostId = host && typeof host === "object" ? (host as { id?: unknown }).id : host;
  return { ...data, slotKey: status === "confirme" && hostId && start ? `${hostId}|${new Date(String(start)).toISOString()}` : null };
};

export const Bookings: CollectionConfig = {
  slug: "bookings",
  labels: { singular: "Rendez-vous", plural: "Rendez-vous" },
  admin: {
    useAsTitle: "summary",
    group: "Marketing",
    defaultColumns: ["start", "summary", "type", "host", "status", "hasProblem"],
    description: "Les rendez-vous réservés sur les pages publiques. ⚠️ : un problème à traiter (appelez le prospect).",
  },
  access: { read: isAdmin, create: () => false, update: isAdmin, delete: isAdmin },
  hooks: { beforeChange: [slotKeyFollowsStatus] },
  defaultSort: "-start",
  fields: [
    { name: "summary", type: "text", admin: { hidden: true } },
    {
      type: "row",
      fields: [
        { name: "start", type: "date", label: "Début", required: true, index: true, admin: { width: "34%", readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "EEE d MMM yyyy, HH:mm" } } },
        { name: "end", type: "date", label: "Fin", required: true, admin: { width: "33%", readOnly: true, date: { pickerAppearance: "dayAndTime", displayFormat: "HH:mm" } } },
        { name: "status", type: "select", label: "État", required: true, defaultValue: "confirme", index: true, options: [...BOOKING_STATUSES], admin: { width: "33%" } },
      ],
    },
    {
      type: "row",
      fields: [
        { name: "type", type: "relationship", relationTo: "booking-types", label: "Type", required: true, index: true, admin: { width: "50%", readOnly: true } },
        { name: "host", type: "relationship", relationTo: "users", label: "Reçu par", required: true, index: true, admin: { width: "50%", readOnly: true } },
      ],
    },
    { name: "slotKey", type: "text", unique: true, index: true, admin: { hidden: true } },
    {
      name: "hasProblem",
      type: "checkbox",
      label: "⚠️ Problème",
      index: true,
      admin: { position: "sidebar", description: "Cochée par le serveur quand quelque chose a raté. Décochez une fois le prospect rappelé." },
    },
    {
      name: "problems",
      type: "array",
      label: "Problèmes",
      admin: { readOnly: true, condition: (d) => Array.isArray(d?.problems) && d.problems.length > 0 },
      fields: [
        {
          type: "row",
          fields: [
            { name: "kind", type: "select", label: "Quoi", options: [...PROBLEM_KINDS], admin: { width: "40%" } },
            { name: "at", type: "date", label: "Le", admin: { width: "20%", date: { pickerAppearance: "dayAndTime" } } },
            { name: "message", type: "text", label: "Détail", admin: { width: "40%" } },
          ],
        },
      ],
    },
    {
      type: "collapsible",
      label: "Le prospect",
      fields: [
        {
          type: "row",
          fields: [
            { name: "firstName", type: "text", label: "Prénom", required: true, admin: { width: "25%", readOnly: true } },
            { name: "lastName", type: "text", label: "Nom", required: true, admin: { width: "25%", readOnly: true } },
            { name: "email", type: "email", label: "E-mail", required: true, index: true, admin: { width: "25%", readOnly: true } },
            { name: "phone", type: "text", label: "Téléphone", admin: { width: "25%", readOnly: true } },
          ],
        },
        {
          type: "row",
          fields: [
            { name: "company", type: "text", label: "Société", required: true, admin: { width: "60%", readOnly: true } },
            { name: "locationKind", type: "select", label: "Où (choisi par le prospect)", options: LOCATION_KINDS.map(({ label, value }) => ({ label, value })), admin: { width: "40%", readOnly: true } },
          ],
        },
        { name: "answers", type: "json", label: "Réponses aux questions", admin: { readOnly: true } },
        { name: "client", type: "relationship", relationTo: "partner-clients", label: "Fiche du prospect", index: true },
        { name: "task", type: "relationship", relationTo: "client-activities", label: "Tâche « Réunion » (CRM)", admin: { readOnly: true } },
        { name: "submission", type: "relationship", relationTo: "form-submissions", label: "Demande d'origine (formulaire)", admin: { readOnly: true } },
        { name: "heardFrom", type: "select", label: "Comment il nous a connus (déclaré)", options: HEARD_FROM.map(({ label, value }) => ({ label, value })), admin: { readOnly: true } },
      ],
    },
    {
      type: "collapsible",
      label: "D'où il vient",
      admin: { initCollapsed: true },
      fields: [
        // La source du lead, comme une soumission de formulaire : reprise de la demande d'origine, sinon de l'adresse.
        { name: "tracking", type: "json", label: "UTM, référent, page d'arrivée, identifiants de clic", admin: { readOnly: true } },
      ],
    },
    {
      type: "collapsible",
      label: "Agenda & suivi",
      admin: { initCollapsed: true },
      fields: [
        {
          type: "row",
          fields: [
            { name: "meetingUrl", type: "text", label: "Lien de visio", admin: { width: "50%", readOnly: true } },
            { name: "eventId", type: "text", label: "Événement d'agenda", admin: { width: "25%", readOnly: true } },
            { name: "calendarId", type: "text", label: "Agenda", admin: { width: "25%", readOnly: true } },
          ],
        },
        { name: "connection", type: "relationship", relationTo: "calendar-connections", label: "Connexion d'agenda", admin: { readOnly: true } },
        { name: "manageToken", type: "text", unique: true, index: true, admin: { hidden: true } },
        { name: "remindersSent", type: "json", admin: { hidden: true } },
        { name: "rescheduledCount", type: "number", label: "Déplacé (fois)", defaultValue: 0, admin: { readOnly: true } },
        { name: "cancelReason", type: "textarea", label: "Motif d'annulation", admin: { readOnly: true, condition: (d) => d?.status === "annule" } },
        { name: "cancelledBy", type: "select", label: "Annulé par", options: [{ label: "Le prospect", value: "prospect" }, { label: "L'équipe", value: "equipe" }], admin: { readOnly: true, condition: (d) => d?.status === "annule" } },
        { name: "notes", type: "textarea", label: "Notes internes" },
      ],
    },
  ],
};
