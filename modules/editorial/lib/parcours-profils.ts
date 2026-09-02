/**
 * Profils cibles d'un parcours d'apprentissage, dans l'ordre d'affichage.
 * Source unique partagée par la collection Parcours (options + validation du
 * defaultValue) et la vue liste par onglets (ParcoursListView : libellés + ordre).
 * NB : distinct des profils de licence (modules/partner/lib/pricing.ts), qui
 * relèvent d'un autre domaine même si certaines valeurs se recoupent.
 */
export const PARCOURS_PROFILS = [
  { value: "admin", label: "Admin" },
  { value: "conducteur", label: "Conducteur de travaux" },
  { value: "chef-chantier", label: "Chef de chantier" },
  { value: "compagnon", label: "Compagnon" },
] as const;

/** Valeurs valides, dans l'ordre (pour tri / validation). */
export const PARCOURS_PROFIL_VALUES: string[] = PARCOURS_PROFILS.map((p) => p.value);

/** Libellé FR d'un profil (clé → libellé). */
export const PARCOURS_PROFIL_LABEL: Record<string, string> = Object.fromEntries(
  PARCOURS_PROFILS.map((p) => [p.value, p.label]),
);
