/**
 * Ce qu'un compte doit pouvoir faire pour PUBLIER (plan Publicité, 3b) : le
 * droit de gérer les publicités, et une Page au nom de laquelle les pubs
 * paraissent. Le reste aide (lire la Page, ses comptes Instagram, les pixels)
 * sans bloquer. Pure.
 */
export const PUBLISH_SCOPES = ["ads_management"] as const;
export const HELPFUL_SCOPES = ["business_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "instagram_basic"] as const;

export type AccessVerdict = { canPublish: boolean; missing: string[]; helpfulMissing: string[]; problems: string[] };

export function accessVerdict(scopes: string[], selected: { pageId?: string | null }): AccessVerdict {
  const has = new Set(scopes);
  const missing = PUBLISH_SCOPES.filter((s) => !has.has(s));
  const helpfulMissing = HELPFUL_SCOPES.filter((s) => !has.has(s));
  const problems = [
    ...missing.map((s) => `Droit « ${s} » absent du jeton : régénérez le jeton de l'utilisateur système en le cochant, puis recollez-le.`),
    ...(selected.pageId ? [] : ["Aucune Page Facebook choisie : les pubs paraissent au nom d'une Page."]),
  ];
  return { canPublish: problems.length === 0, missing: [...missing], helpfulMissing: [...helpfulMissing], problems };
}
