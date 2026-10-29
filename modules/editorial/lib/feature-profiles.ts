/**
 * « Pour qui ? » — les profils d'utilisateurs concernés par une feature.
 *
 * Les VALEURS sont celles des profils de licence (voir partner/lib/pricing,
 * PROFILS) : le même vocabulaire que le devis et que le dossier de démarrage,
 * pour qu'un jour une fiche puisse être recommandée au profil d'un utilisateur
 * sans table de correspondance. Les LIBELLÉS, eux, sont ceux qu'emploient les
 * équipes (« Compagnon visuel » plutôt que « Visuel »).
 *
 * L'administrateur n'y figure pas : il a accès à tout, une fiche « pour
 * l'admin » ne l'aiderait à rien trouver.
 *
 * Aucune case cochée = la fiche concerne TOUT LE MONDE : elle reste visible
 * quel que soit le profil choisi sur le site.
 *
 * ⚠️ `value` est une valeur d'enum Postgres : en ajouter une exige une
 * migration (`npm run db:migrate:create`).
 */

export const FEATURE_PROFILES = [
  { value: "conducteur", label: "Conducteur de travaux" },
  { value: "chefChantier", label: "Chef de chantier" },
  { value: "chefEquipe", label: "Chef d'équipe" },
  { value: "compagnon", label: "Compagnon" },
  { value: "visuel", label: "Compagnon visuel" },
  { value: "bureau", label: "Bureau" },
] as const;

export type FeatureProfile = (typeof FEATURE_PROFILES)[number]["value"];

export const isFeatureProfile = (v: unknown): v is FeatureProfile =>
  FEATURE_PROFILES.some((p) => p.value === v);

export const profileLabel = (v: string): string => FEATURE_PROFILES.find((p) => p.value === v)?.label ?? v;

/** Une fiche concerne-t-elle ce profil ? Sans profil coché, elle concerne tout le monde. */
export const concerns = (profiles: readonly string[] | null | undefined, profile: string | null | undefined): boolean =>
  !profile || !profiles?.length || profiles.includes(profile);
