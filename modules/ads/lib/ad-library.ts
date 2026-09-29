/**
 * La bibliothèque publicitaire Meta — ce qu'on sait lire d'un lien collé.
 *
 * Un concurrent se désigne par l'identifiant de sa page : c'est lui que l'API
 * `ads_archive` interroge (`search_page_ids`), pas un nom qui change ni une URL
 * de page qui peut être un alias. Le plus simple pour le récupérer est de
 * coller le lien de la page de l'annonceur dans la bibliothèque : il le porte
 * dans `view_all_page_id`.
 */

export type PageRef = { ok: true; pageId: string; sourceUrl: string | null } | { ok: false; reason: string };

export const PAGE_ID = /^\d{5,20}$/;

const HOW_TO =
  "Dans la bibliothèque publicitaire, ouvrez l'annonceur (« Voir toutes les publicités » ou son nom), puis copiez le lien de la page qui s'affiche.";

/** Un lien de la bibliothèque (…&view_all_page_id=123…) ou un identifiant seul → l'identifiant de page. */
export function parsePageRef(raw: unknown): PageRef {
  const input = typeof raw === "string" ? raw.trim() : "";
  if (!input) return { ok: false, reason: "Collez un lien de la bibliothèque publicitaire Meta, ou l'identifiant de la page." };
  if (PAGE_ID.test(input)) return { ok: true, pageId: input, sourceUrl: null };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(input) ? input : `https://${input}`);
  } catch {
    return { ok: false, reason: "Ni un lien, ni un identifiant de page : un identifiant ne contient que des chiffres." };
  }
  const host = url.hostname.toLowerCase();
  if (!(host === "facebook.com" || host.endsWith(".facebook.com"))) {
    return { ok: false, reason: `Ce lien vient de ${host}, pas de la bibliothèque publicitaire Meta (facebook.com/ads/library).` };
  }
  if (!url.pathname.startsWith("/ads/library")) {
    return { ok: false, reason: `Ce lien Facebook n'est pas celui de la bibliothèque publicitaire (facebook.com/ads/library). ${HOW_TO}` };
  }

  const pageId = url.searchParams.get("view_all_page_id")?.trim();
  if (pageId && PAGE_ID.test(pageId)) return { ok: true, pageId, sourceUrl: input };
  if (pageId) return { ok: false, reason: `L'identifiant de page de ce lien (« ${pageId} ») n'est pas valide : il ne doit contenir que des chiffres.` };
  if (url.searchParams.get("id")) {
    return { ok: false, reason: `Ce lien mène à une seule publicité, pas à la page d'un annonceur. ${HOW_TO}` };
  }
  return { ok: false, reason: `Ce lien ne contient pas d'identifiant de page (view_all_page_id). ${HOW_TO}` };
}
