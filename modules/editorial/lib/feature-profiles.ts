/**
 * « Pour qui ? » — les profils d'utilisateurs concernés par une feature.
 *
 * Les VALEURS sont celles des profils de licence (voir partner/lib/pricing,
 * PROFILS) : le même vocabulaire que le devis et que le dossier de démarrage,
 * pour qu'un jour une fiche puisse être recommandée au profil d'un utilisateur
 * sans table de correspondance. Les LIBELLÉS, eux, sont ceux qu'emploient les
 * équipes (« Compagnon visuel » plutôt que « Visuel »).
 *
 * L'ADMINISTRATEUR y figure depuis le 29/10/2026 (demande de Charlie) : sa
 * case sert à marquer les fiches qui ne concernent QUE lui (paramètres,
 * administration, licences), pour qu'elles disparaissent des autres profils.
 * Lui-même voit toujours tout : il a accès à tout le logiciel.
 *
 * Aucune case cochée = la fiche concerne TOUT LE MONDE : elle reste visible
 * quel que soit le profil choisi sur le site. Cocher les six profils métier
 * revient au même (« Tous les profils »), case Administrateur ou non.
 *
 * ⚠️ `value` est une valeur d'enum Postgres : en ajouter une exige une
 * migration (`npm run db:migrate:create`).
 */

export const FEATURE_PROFILES = [
  { value: "admin", label: "Administrateur" },
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

/** Une fiche concerne-t-elle ce profil ? Sans profil coché, elle concerne tout le monde ; l'administrateur voit tout. */
export const concerns = (profiles: readonly string[] | null | undefined, profile: string | null | undefined): boolean =>
  !profile || profile === "admin" || !profiles?.length || profiles.includes(profile);

/** Les profils métier : tous les profils sauf l'administrateur, qui voit tout de toute façon. */
export const TEAM_PROFILES: string[] = FEATURE_PROFILES.filter((p) => p.value !== "admin").map((p) => p.value);

/** La fiche s'adresse-t-elle à tous ? Rien de coché, ou les six profils métier (avec ou sans l'administrateur). */
export const forEveryone = (profiles: readonly string[] | null | undefined): boolean => !profiles?.length || TEAM_PROFILES.every((v) => profiles.includes(v));
