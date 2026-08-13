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

// ─── Véhicules ───────────────────────────────────────────────────────────────
export const LICENSE_TYPES = [
  { label: "B — voiture", value: "b" },
  { label: "BE — voiture + remorque", value: "be" },
  { label: "C1 — poids lourd léger", value: "c1" },
  { label: "C1E — C1 + remorque", value: "c1e" },
  { label: "C — poids lourd", value: "c" },
  { label: "CE — poids lourd + remorque", value: "ce" },
  { label: "D — transport en commun", value: "d" },
  { label: "DE — transport en commun + remorque", value: "de" },
] as const;

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

// ─── Engins ──────────────────────────────────────────────────────────────────
/**
 * CACES — recommandations R482 (engins de chantier), R486 (nacelles),
 * R489 (chariots), R490 (grues auxiliaires). Liste volontairement limitée aux
 * catégories réellement rencontrées en BTP.
 */
export const CACES_TYPES = [
  { label: "R482 A — compacts", value: "r482-a" },
  { label: "R482 B1 — pelles > 6 t", value: "r482-b1" },
  { label: "R482 B2 — engins de forage", value: "r482-b2" },
  { label: "R482 C1 — chargeuses > 6 t", value: "r482-c1" },
  { label: "R482 C2 — bouteurs", value: "r482-c2" },
  { label: "R482 C3 — niveleuses", value: "r482-c3" },
  { label: "R482 D — compacteurs", value: "r482-d" },
  { label: "R482 E — tombereaux", value: "r482-e" },
  { label: "R482 F — chariots de chantier", value: "r482-f" },
  { label: "R482 G — conduite hors production", value: "r482-g" },
  { label: "R486 A — nacelles verticales", value: "r486-a" },
  { label: "R486 B — nacelles multidirectionnelles", value: "r486-b" },
  { label: "R486 C — hors production", value: "r486-c" },
  { label: "R489 1A/1B — transpalettes, gerbeurs", value: "r489-1" },
  { label: "R489 3 — chariots élévateurs frontaux", value: "r489-3" },
  { label: "R489 5 — chariots à mât rétractable", value: "r489-5" },
  { label: "R490 — grues de chargement", value: "r490" },
] as const;

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
    hint: "Tout l'effectif. Cocher « Accès TIM » sur ceux qui consomment une licence.",
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
