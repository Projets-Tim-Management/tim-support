/**
 * LES RENDEZ-VOUS (16/11/2026 : « faire exactement comme Calendly, dans le support ») — les listes partagées par les
 * collections, le moteur, les routes et les pages publiques. Sans dépendance : lisibles côté serveur comme côté
 * navigateur. L'ordre des valeurs est celui des listes en base : ne pas le changer.
 */

/**
 * Où se tient le rendez-vous — et ce qu'il est (16/11/2026 : « visio = démo du logiciel, téléphone = prise de
 * besoin ») : `title` et `hint` sont ce que lit le prospect au moment de choisir ; `stage`, l'étape du pipeline où
 * passe l'affaire (vide : celle du type) ; `task`, le nom de la réunion dans le CRM.
 */
export const LOCATION_KINDS = [
  { label: "Visio Google Meet (lien créé à la réservation)", value: "meet", short: "Visio (Google Meet)", title: "Démo du logiciel en visio", hint: "On vous montre TIM sur vos chantiers, en partage d'écran.", stage: null, task: "Démo en visio" },
  { label: "Téléphone (nous appelons le prospect)", value: "telephone", short: "Téléphone", title: "Échange par téléphone", hint: "On fait le point sur vos besoins, sans écran.", stage: "en-qualification", task: "Appel découverte" },
  { label: "Sur place (adresse ci-dessous)", value: "sur-place", short: "Sur place", title: "Rendez-vous sur place", hint: "On se retrouve à l'adresse indiquée.", stage: null, task: "Rendez-vous sur place" },
  { label: "Autre (précisé ci-dessous)", value: "autre", short: "À préciser", title: "Autre", hint: "", stage: null, task: "Rendez-vous" },
] as const;
export const locationMeta = (value: string) => LOCATION_KINDS.find((l) => l.value === value) ?? LOCATION_KINDS[0];
export type LocationKind = (typeof LOCATION_KINDS)[number]["value"];

/** Plusieurs membres de l'équipe sur un même type : qui prend le rendez-vous (comme le « round robin » de Calendly). */
export const DISTRIBUTIONS = [
  { label: "Priorité à la disponibilité (le premier libre, dans l'ordre de la liste)", value: "disponibilite" },
  { label: "Répartition égale (celui qui en a le moins sur 30 jours)", value: "equilibre" },
] as const;
export type Distribution = (typeof DISTRIBUTIONS)[number]["value"];

/** Les questions posées à la réservation. */
export const QUESTION_TYPES = [
  { label: "Texte court", value: "texte" },
  { label: "Texte long", value: "paragraphe" },
  { label: "Choix dans une liste", value: "choix" },
] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number]["value"];

/** Une réponse qui remplit un champ de la fiche du prospect (CRM). */
export const CRM_FIELDS = [
  { label: "Aucun (la réponse va dans la tâche et la note du prospect)", value: "aucun" },
  { label: "Effectif (collaborateurs)", value: "collaborateurs" },
] as const;

export const BOOKING_STATUSES = [
  { label: "Confirmé", value: "confirme" },
  { label: "Annulé", value: "annule" },
  { label: "Venu", value: "venu" },
  { label: "Pas venu", value: "absent" },
] as const;
export type BookingStatus = (typeof BOOKING_STATUSES)[number]["value"];

/**
 * Ce qui a pu rater autour d'un rendez-vous (16/11/2026, point 13 : « si les e-mails ou l'agenda sont déconnectés, le
 * rendez-vous ne doit pas être perdu, le lead doit rentrer quand même, en affichant l'erreur pour qu'on appelle le
 * prospect »).
 */
export const PROBLEM_KINDS = [
  { label: "Agenda illisible : créneau non vérifié", value: "agenda-lecture" },
  { label: "Événement d'agenda non créé (pas d'invitation, pas de lien de visio)", value: "agenda-evenement" },
  { label: "E-mail au prospect non envoyé", value: "email-prospect" },
  { label: "E-mail à l'équipe non envoyé", value: "email-equipe" },
  { label: "Fiche du prospect non créée", value: "crm" },
] as const;
export type ProblemKind = (typeof PROBLEM_KINDS)[number]["value"];

/** Les rappels par défaut : la veille et une heure avant (en minutes). */
export const DEFAULT_REMINDERS = [24 * 60, 60];

/** Les statuts du pipeline qu'un rendez-vous fait avancer (une affaire plus loin ne recule pas). */
export const EARLY_PIPELINE = ["nouvelle", "en-qualification", "attente-longue"];

export const PUBLIC_PATH = "/rdv";
/** L'adresse publique d'un type de rendez-vous. */
export const bookingPath = (slug: string) => `${PUBLIC_PATH}/${slug}`;
/** L'adresse où le prospect déplace ou annule son rendez-vous. */
export const managePath = (token: string) => `${PUBLIC_PATH}/gerer/${token}`;
