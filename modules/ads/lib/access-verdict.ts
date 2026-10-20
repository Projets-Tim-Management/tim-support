/**
 * Ce qu'un compte doit pouvoir faire pour PUBLIER (plan Publicité, 3b) : le
 * droit de gérer les publicités, et une Page au nom de laquelle les pubs
 * paraissent. Le reste aide (lire la Page, ses comptes Instagram, les pixels)
 * sans bloquer. Pure.
 */
import type { AccountState } from "@/modules/ads/platforms/types";

export const PUBLISH_SCOPES = ["ads_management"] as const;
export const HELPFUL_SCOPES = ["business_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "instagram_basic"] as const;

export type AccessVerdict = { canPublish: boolean; missing: string[]; helpfulMissing: string[]; problems: string[] };

/** Les états de compte de Meta (`account_status`) : seuls « actif » et « délai de grâce » diffusent. */
const META_ACCOUNT_STATUS: Record<number, string> = {
  1: "actif",
  2: "désactivé par Meta",
  3: "impayé",
  7: "en examen de risque chez Meta",
  8: "règlement en attente",
  9: "en délai de grâce",
  100: "en cours de fermeture",
  101: "fermé",
  201: "actif",
  202: "fermé",
};

/** L'état d'un compte Meta d'après son `account_status`. Pure. */
export function metaAccountState(code: number | null | undefined): AccountState {
  if (code == null) return { ok: true, code: null, label: "inconnu" };
  return { ok: code === 1 || code === 9 || code === 201, code, label: META_ACCOUNT_STATUS[code] ?? `statut ${code}` };
}

/** Le problème à afficher pour un compte qui ne peut pas diffuser. Pure. */
export const accountProblem = (a: AccountState): string =>
  a.code === 101 || a.code === 100 || a.code === 202
    ? "Le compte publicitaire est fermé chez Meta (il se ferme seul après 56 jours sans dépense) : Paramètres de l'entreprise → Comptes publicitaires → filtre « Fermé » → le compte → « … » → « Activer »."
    : `Le compte publicitaire est ${a.label} chez Meta : il ne peut pas diffuser. Voyez « Facturation et paiements » ou « Qualité du compte » dans Meta Business Suite.`;

export function accessVerdict(scopes: string[], selected: { pageId?: string | null; account?: AccountState | null }): AccessVerdict {
  const has = new Set(scopes);
  const missing = PUBLISH_SCOPES.filter((s) => !has.has(s));
  const helpfulMissing = HELPFUL_SCOPES.filter((s) => !has.has(s));
  const problems = [
    ...missing.map((s) => `Droit « ${s} » absent du jeton : régénérez le jeton de l'utilisateur système en le cochant, puis recollez-le.`),
    ...(selected.pageId ? [] : ["Aucune Page Facebook choisie : les pubs paraissent au nom d'une Page."]),
    ...(selected.account && !selected.account.ok ? [accountProblem(selected.account)] : []),
  ];
  return { canPublish: problems.length === 0, missing: [...missing], helpfulMissing: [...helpfulMissing], problems };
}
