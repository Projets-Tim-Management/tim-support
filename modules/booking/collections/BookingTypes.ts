import type { CollectionConfig } from "payload";

import { isAdmin } from "@/core/access";
import { CRM_FIELDS, DEFAULT_REMINDERS, DISTRIBUTIONS, LOCATION_KINDS, QUESTION_TYPES } from "@/modules/booking/lib/constants";
import { CLIENT_STATUS_OPTIONS } from "@/modules/partner/lib/clientStatus";

/**
 * LES TYPES DE RENDEZ-VOUS (16/11/2026 : « comme Calendly, on peut tout régler ») — « Démo 30 min », « Appel
 * découverte 15 min »… Chacun a sa page publique (/rdv/<adresse>), que la vitrine affiche après le formulaire de
 * contact ou que l'on envoie par e-mail.
 *
 * Tout se règle ici : qui reçoit (un ou plusieurs membres de l'équipe, et comment se répartir), où (Meet, téléphone,
 * sur place), la durée, les horaires et exceptions, l'intervalle entre deux départs, les pauses, le délai minimum, la
 * fenêtre de réservation, le maximum par jour, les questions, les e-mails et les rappels, ce que le prospect peut
 * déplacer ou annuler, l'étape du pipeline et la page après réservation.
 */
export const BookingTypes: CollectionConfig = {
  slug: "booking-types",
  labels: { singular: "Type de rendez-vous", plural: "Types de rendez-vous" },
  admin: {
    useAsTitle: "name",
    group: "Système",
    defaultColumns: ["name", "slug", "durationMin", "hosts", "active"],
    description: "Comme Calendly : chaque type a sa page publique de réservation (support…/rdv/<adresse>).",
  },
  access: { read: isAdmin, create: isAdmin, update: isAdmin, delete: isAdmin },
  defaultSort: "name",
  fields: [
    {
      type: "row",
      fields: [
        { name: "name", type: "text", label: "Nom (vu par le prospect)", required: true, admin: { width: "50%", placeholder: "Démo de TIM Management" } },
        {
          name: "slug",
          type: "text",
          label: "Adresse publique",
          required: true,
          unique: true,
          index: true,
          validate: (v: unknown) => (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(String(v ?? "")) ? true : "Lettres minuscules, chiffres et tirets : demo, appel-decouverte…"),
          admin: { width: "30%", placeholder: "demo" },
        },
        { name: "active", type: "checkbox", label: "Réservable", defaultValue: true, admin: { width: "20%" } },
      ],
    },
    { name: "publicLink", type: "ui", admin: { components: { Field: "/modules/booking/admin/PublicLink#PublicLink" } } },
    {
      type: "tabs",
      tabs: [
        {
          label: "Rendez-vous",
          fields: [
            { name: "description", type: "textarea", label: "Description (page de réservation)", admin: { placeholder: "30 minutes pour voir TIM sur vos chantiers : pointage, planning, suivi des heures…" } },
            {
              type: "row",
              fields: [
                { name: "durationMin", type: "number", label: "Durée (min)", required: true, defaultValue: 30, min: 5, max: 480, admin: { width: "33%" } },
                {
                  // Comme Calendly : plusieurs lieux possibles, le prospect choisit en réservant (16/11/2026).
                  name: "locations",
                  type: "select",
                  hasMany: true,
                  label: "Où (le prospect choisit s'il y en a plusieurs)",
                  required: true,
                  defaultValue: ["meet", "telephone"],
                  options: LOCATION_KINDS.map(({ label, value }) => ({ label, value })),
                  admin: { width: "67%" },
                },
              ],
            },
            { name: "locationDetail", type: "text", label: "Adresse ou précision", admin: { condition: (d) => Array.isArray(d?.locations) && d.locations.some((l: string) => l === "sur-place" || l === "autre") } },
            // L'ancien lieu unique (avant le choix du prospect) : gardé en base, relu seulement si « Où » est vide.
            { name: "locationKind", type: "select", options: LOCATION_KINDS.map(({ label, value }) => ({ label, value })), admin: { hidden: true } },
            {
              name: "hosts",
              type: "relationship",
              relationTo: "users",
              hasMany: true,
              required: true,
              label: "Qui reçoit (membres de l'équipe)",
              admin: {
                description: "Leur agenda connecté (fiche partenaire › Agenda & rendez-vous) est lu : un créneau occupé n'est jamais proposé. Sans agenda connecté, les horaires ci-dessous font foi et le rendez-vous est signalé « créneau non vérifié ».",
              },
            },
            {
              name: "distribution",
              type: "radio",
              label: "Plusieurs membres : qui prend le rendez-vous",
              defaultValue: "disponibilite",
              options: DISTRIBUTIONS.map(({ label, value }) => ({ label, value })),
              admin: { condition: (d) => Array.isArray(d?.hosts) && d.hosts.length > 1 },
            },
          ],
        },
        {
          label: "Horaires",
          fields: [
            {
              // Même éditeur que les disponibilités d'un partenaire (semaine type + exceptions datées) : il écrit
              // « scheduling.hours » et « scheduling.dateOverrides ».
              name: "scheduling",
              type: "group",
              label: false,
              fields: [
                // Par défaut (16/11/2026) : du lundi au vendredi, de 8 h à 19 h.
                { name: "hours", type: "json", label: false, defaultValue: Object.fromEntries(["1", "2", "3", "4", "5"].map((d) => [d, [{ start: "08:00", end: "19:00" }]])), admin: { components: { Field: "/modules/marketing/admin/AvailabilityEditor#AvailabilityEditor" } } },
                { name: "dateOverrides", type: "json", admin: { hidden: true } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "incrementMin", type: "select", label: "Un départ toutes les", defaultValue: "30", options: ["10", "15", "20", "30", "45", "60"].map((v) => ({ label: `${v} min`, value: v })), admin: { width: "34%" } },
                { name: "bufferBeforeMin", type: "number", label: "Pause avant (min)", defaultValue: 30, min: 0, admin: { width: "33%" } },
                { name: "bufferAfterMin", type: "number", label: "Pause après (min)", defaultValue: 30, min: 0, admin: { width: "33%", description: "30 min avant et après : jamais deux rendez-vous à la suite." } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "minNoticeHours", type: "number", label: "Délai minimum (heures)", defaultValue: 4, min: 0, admin: { width: "34%", description: "Pas de rendez-vous dans les N prochaines heures." } },
                { name: "horizonDays", type: "number", label: "Réservable jusqu'à (jours)", defaultValue: 30, min: 1, max: 365, admin: { width: "33%" } },
                { name: "maxPerDay", type: "number", label: "Maximum par jour et par membre", min: 1, admin: { width: "33%", description: "Vide : sans limite." } },
              ],
            },
            {
              type: "row",
              fields: [
                { name: "noSameDay", type: "checkbox", label: "Pas de rendez-vous le jour même", defaultValue: true, admin: { width: "50%", description: "Le premier créneau proposé est demain." } },
                {
                  name: "limitedSlots",
                  type: "checkbox",
                  label: "Quelques créneaux par jour, variables",
                  defaultValue: true,
                  admin: { width: "50%", description: "1 à 5 horaires par jour (3 le plus souvent), différents d'un jour à l'autre et fixes : un agenda qui paraît demandé. Décoché : tous les horaires libres." },
                },
              ],
            },
          ],
        },
        {
          label: "Questions",
          description: "Toujours demandés : prénom, nom, e-mail, société. Le téléphone et vos questions se règlent ici. Une adresse de réservation peut pré-remplir les réponses (?prenom=…&email=…&<question>=…).",
          fields: [
            {
              // 16/11/2026 : « tout est déjà sélectionné par rapport au questionnaire d'avant » — les mêmes questions,
              // les mêmes tranches, les mêmes choix que le formulaire de contact ; ce qu'il a déjà rempli est repris.
              name: "sourceForm",
              type: "relationship",
              relationTo: "forms",
              label: "Reprendre les questions du formulaire",
              admin: {
                description: "Choisi : la page pose exactement les questions de ce formulaire (mêmes libellés, mêmes tranches, mêmes choix) à la place des questions ci-dessous. En visio, tout est obligatoire.",
              },
            },
            {
              // Le bouton « Prendre rendez-vous » de la vitrine (16/11/2026, « en simplifié, comme Calendly ») : nom,
              // e-mail, visio ou téléphone, un mot — sans société ni questions.
              name: "simpleForm",
              type: "checkbox",
              label: "Formulaire simplifié : nom, e-mail, téléphone (si appel), un message facultatif",
              defaultValue: false,
            },
            { name: "phoneRequired", type: "checkbox", label: "Téléphone obligatoire", defaultValue: true },
            {
              name: "questions",
              type: "array",
              label: "Questions (si aucun formulaire n'est repris)",
              admin: { condition: (d) => !d?.sourceForm },
              labels: { singular: "Question", plural: "Questions" },
              fields: [
                {
                  type: "row",
                  fields: [
                    { name: "label", type: "text", label: "Question", required: true, admin: { width: "50%" } },
                    {
                      name: "key",
                      type: "text",
                      label: "Clé (pré-remplissage)",
                      required: true,
                      validate: (v: unknown) => (/^[a-z0-9_-]+$/.test(String(v ?? "")) ? true : "Minuscules, chiffres, - et _ : effectif, logiciel…"),
                      admin: { width: "25%" },
                    },
                    { name: "type", type: "select", label: "Forme", required: true, defaultValue: "texte", options: QUESTION_TYPES.map(({ label, value }) => ({ label, value })), admin: { width: "25%" } },
                  ],
                },
                { name: "options", type: "textarea", label: "Choix (un par ligne)", admin: { condition: (_, s) => s?.type === "choix" } },
                {
                  type: "row",
                  fields: [
                    { name: "required", type: "checkbox", label: "Obligatoire", defaultValue: false, admin: { width: "30%" } },
                    { name: "crmField", type: "select", label: "Remplit sur la fiche", defaultValue: "aucun", options: CRM_FIELDS.map(({ label, value }) => ({ label, value })), admin: { width: "70%" } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: "E-mails & rappels",
          fields: [
            { name: "confirmationEmail", type: "checkbox", label: "E-mail de confirmation au prospect", defaultValue: true },
            {
              name: "confirmationText",
              type: "textarea",
              label: "Mot ajouté à la confirmation",
              admin: { condition: (d) => d?.confirmationEmail !== false, placeholder: "Pensez à avoir sous la main le nombre de compagnons et vos chantiers en cours : la démo partira de votre cas." },
            },
            {
              name: "reminders",
              type: "array",
              label: "Rappels au prospect",
              labels: { singular: "Rappel", plural: "Rappels" },
              defaultValue: DEFAULT_REMINDERS.map((m) => ({ minutesBefore: m })),
              admin: { description: "Un e-mail avant le rendez-vous. Par défaut : la veille (1 440 min) et une heure avant (60 min)." },
              fields: [{ name: "minutesBefore", type: "number", label: "Minutes avant", required: true, min: 10 }],
            },
            { name: "notifyHost", type: "checkbox", label: "Prévenir le membre qui reçoit (réservation, déplacement, annulation)", defaultValue: true },
          ],
        },
        {
          label: "Après la réservation",
          fields: [
            {
              type: "row",
              fields: [
                { name: "allowReschedule", type: "checkbox", label: "Le prospect peut déplacer", defaultValue: true, admin: { width: "33%" } },
                { name: "allowCancel", type: "checkbox", label: "Le prospect peut annuler", defaultValue: true, admin: { width: "33%" } },
                { name: "changeUntilHours", type: "number", label: "Jusqu'à (heures avant)", defaultValue: 2, min: 0, admin: { width: "34%" } },
              ],
            },
            { name: "crmStage", type: "select", label: "Étape du pipeline à la réservation", defaultValue: "demo-programmee", options: CLIENT_STATUS_OPTIONS, admin: { description: "Une affaire déjà plus loin ne recule pas." } },
            { name: "confirmationMessage", type: "textarea", label: "Message affiché après la réservation", admin: { placeholder: "C'est noté ! Vous recevez la confirmation par e-mail." } },
            { name: "redirectUrl", type: "text", label: "Ou rediriger vers (https://…)", admin: { description: "Facultatif : une page de la vitrine, par exemple." } },
          ],
        },
      ],
    },
  ],
};
