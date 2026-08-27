/**
 * Dossier de démarrage — listes de référence et règles de saisie.
 *
 * Remplace le fichier Excel envoyé aux clients (« les champs en rouge sont
 * obligatoires, merci de les compléter avant de transmettre le fichier afin
 * d'éviter toute erreur lors de l'import »). L'intérêt du passage en interne
 * est exactement là : ce qui était une consigne en rouge devient une règle de
 * validation, et l'erreur d'import devient impossible par construction.
 *
 * ⚠️ SALARIÉ ≠ UTILISATEUR. Un salarié est une personne de l'effectif (pointée,
 * planifiée, affectée à un chantier) ; un utilisateur est une LICENCE TIM. Une
 * entreprise de 40 salariés peut n'avoir que 12 utilisateurs — et c'est sur ces
 * 12 que porte le devis. D'où deux champs distincts : `poste` (le métier réel)
 * et `licenceProfile` (le profil de licence, qui pilote le prix).
 */

import { PROFILS } from "@/modules/partner/lib/pricing";

// ─── Salariés ────────────────────────────────────────────────────────────────
/**
 * Profils de licence — repris tels quels de la grille tarifaire : une seule
 * source pour le dossier et pour le devis, donc aucun décalage possible entre
 * « ce que le client a déclaré » et « ce qu'on facture ».
 */
export const LICENCE_PROFILE_OPTIONS = PROFILS.map(({ key, label }) => ({ label, value: key }));

export const CONTRACT_TYPES = [
  { label: "CDI", value: "cdi" },
  { label: "CDD", value: "cdd" },
  { label: "Intérim", value: "interim" },
  { label: "Apprentissage", value: "apprentissage" },
  { label: "Stage", value: "stage" },
  { label: "Sous-traitant", value: "sous-traitant" },
] as const;

/** Seul le CDI n'a pas de date de fin (cf. l'intitulé du fichier client). */
export const CONTRACT_NEEDS_END_DATE = (value?: string | null): boolean =>
  Boolean(value) && value !== "cdi";

/**
 * Plaque française : 2 lettres, 3 chiffres, 2 lettres. Normalisée en majuscules
 * avec tirets à l'enregistrement, pour que « ab123cd » et « AB-123-CD » soient
 * la même immatriculation (sinon les doublons passent au travers).
 */
const PLATE_RE = /^[A-Z]{2}-\d{3}-[A-Z]{2}$/;

export const normalizePlate = (value?: string | null): string | undefined => {
  if (!value) return undefined;
  const raw = value.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (raw.length === 7) return `${raw.slice(0, 2)}-${raw.slice(2, 5)}-${raw.slice(5)}`;
  return value.trim().toUpperCase();
};

export const isValidPlate = (value?: string | null): boolean =>
  !value || PLATE_RE.test(normalizePlate(value) ?? "");

// ─── Statut du dossier ───────────────────────────────────────────────────────
export const ONBOARDING_STATUSES = [
  {
    value: "en-cours",
    label: "En cours de saisie",
    color: "var(--tim-amber)",
    bg: "var(--tim-amber-bg)",
  },
  { value: "transmis", label: "Transmis", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)" },
  { value: "valide", label: "Validé", color: "var(--tim-green)", bg: "var(--tim-green-bg)" },
];

export const ONBOARDING_STATUS_OPTIONS = ONBOARDING_STATUSES.map(({ label, value }) => ({
  label,
  value,
}));

/**
 * Statuts qui FERMENT le dossier à la modification par le client.
 *
 * « Transmis » n'en fait pas partie, et c'est le point : transmettre annonce que
 * le dossier est prêt, ce n'est pas un engagement irrévocable. Tant que TIM ne
 * l'a pas validé, un oubli — un salarié, un chantier ouvert entre-temps — se
 * corrige depuis l'espace client. Le verrouiller à la transmission obligeait à
 * passer par un e-mail pour changer une ligne.
 *
 * Une seule liste, lue par l'écran ET par l'API : deux définitions finiraient
 * par diverger, et l'une des deux laisserait passer ce que l'autre refuse.
 */
export const DOSSIER_LOCKED_STATUSES = ["valide"];

export const isDossierLocked = (status?: string | null): boolean =>
  DOSSIER_LOCKED_STATUSES.includes(status ?? "");

export const onboardingStatusMeta = (value?: string | null) =>
  ONBOARDING_STATUSES.find((s) => s.value === value);

/**
 * Les 5 sections du dossier, dans l'ordre du fichier client d'origine.
 * `min` = nombre de lignes en dessous duquel la section n'est pas complète.
 */
export const ONBOARDING_SECTIONS = [
  {
    key: "administrateur",
    label: "Administrateur",
    collection: "client-contacts",
    min: 1,
    hint: "La personne qui administrera TIM chez le client.",
  },
  {
    key: "salaries",
    label: "Salariés",
    collection: "client-employees",
    min: 1,
    hint: "Tout l'effectif : pointage, planning, chantiers. Les licences se déclarent à part, dans « Utilisateurs TIM ».",
  },
  {
    key: "chantiers",
    label: "Chantiers",
    collection: "client-sites",
    min: 1,
    hint: "Les chantiers en cours sur la période de test.",
  },
  {
    key: "vehicules",
    label: "Véhicules",
    collection: "client-vehicles",
    min: 0,
    hint: "Optionnel — si le client suit sa flotte dans TIM.",
  },
  {
    key: "engins",
    label: "Engins",
    collection: "client-machines",
    min: 0,
    hint: "Optionnel — engins de chantier et CACES associés.",
  },
] as const;

export type OnboardingSectionKey = (typeof ONBOARDING_SECTIONS)[number]["key"];
