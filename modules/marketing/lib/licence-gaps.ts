import { licenceLinesOf, type ProfilKey } from "@/modules/partner/lib/pricing";

/**
 * Les licences PRÉVUES sur la fiche, face aux utilisateurs DÉCLARÉS par le
 * client dans son dossier (« Utilisateurs TIM », un profil par ligne).
 *
 * C'est le même vocabulaire des deux côtés — le profil de licence du dossier
 * est la liste de la grille tarifaire (voir onboarding.LICENCE_PROFILE_OPTIONS)
 * — donc la comparaison est directe : 20 compagnons prévus, 2 lignes
 * « Compagnon » déclarées, il en manque 18.
 *
 * Module pur : la relance, l'aperçu et la console de préparation lisent la même
 * règle.
 */

export type LicenceGap = {
  key: ProfilKey;
  label: string;
  expected: number;
  declared: number;
  /** Jamais négatif : un utilisateur de trop n'est pas un manque. */
  missing: number;
};

/** Singulier / pluriel de chaque profil, pour écrire « 18 compagnons ». */
const NOUNS: Record<ProfilKey, [string, string]> = {
  admin: ["administrateur", "administrateurs"],
  conducteur: ["conducteur de travaux", "conducteurs de travaux"],
  chefChantier: ["chef de chantier", "chefs de chantier"],
  chefEquipe: ["chef d'équipe", "chefs d'équipe"],
  compagnon: ["compagnon", "compagnons"],
  bureau: ["utilisateur Bureau", "utilisateurs Bureau"],
  visuel: ["utilisateur Visuel", "utilisateurs Visuel"],
};

/** « 18 compagnons », « 1 chef d'équipe ». */
export const profileCount = (key: ProfilKey, n: number): string =>
  `${n} ${NOUNS[key][n > 1 ? 1 : 0]}`;

/**
 * Un profil par ligne prévue sur la fiche (quantité > 0), dans l'ordre de la
 * grille. Les profils sans licence prévue n'apparaissent pas : rien n'y manque.
 */
export function licenceGaps(
  client: Record<string, unknown> | null | undefined,
  declaredProfiles: (string | null | undefined)[],
): LicenceGap[] {
  const counts = new Map<string, number>();
  for (const p of declaredProfiles) if (p) counts.set(p, (counts.get(p) ?? 0) + 1);

  // Les quantités, lues comme partout ailleurs (groupe `licences` de la fiche).
  const lines = licenceLinesOf(client?.licences as Record<string, number | null | undefined> | null);
  return lines.flatMap(({ key, label, qty }) => {
    const expected = Math.max(0, Math.floor(qty));
    if (expected === 0) return [];
    const declared = counts.get(key) ?? 0;
    return [{ key, label, expected, declared, missing: Math.max(0, expected - declared) }];
  });
}

export const missingOnly = (gaps: LicenceGap[]): LicenceGap[] => gaps.filter((g) => g.missing > 0);
