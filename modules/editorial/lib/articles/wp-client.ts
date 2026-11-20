import type { WpPost } from "@/modules/editorial/lib/articles/from-wp";

/**
 * LECTURE DES ARTICLES DE LA VITRINE (WordPress, CPT `actualite`).
 *
 * Accès : l'utilisateur WordPress `support-tim` (rôle Éditeur) et son mot de
 * passe d'application, dans VITRINE_WP_URL / VITRINE_WP_USER /
 * VITRINE_WP_APP_PASSWORD (Vercel et .env.local, jamais dans le code).
 * Le rôle Éditeur est nécessaire pour `context=edit` (titre brut, champs ACF
 * bruts) et pour lire les brouillons.
 *
 * Cette étape ne fait QUE LIRE : aucune écriture dans WordPress.
 */

export const WP_POST_TYPE = "actualite";
const PER_PAGE = 100;
const FIELDS = "id,slug,status,link,date,date_gmt,modified,modified_gmt,author,categories,title,acf,seo_meta,featured_media";
/** Les fiches métier de la vitrine (CPT `metier`, base REST `metiers`). */
export const WP_JOB_TYPE = "metiers";

export class WpConfigError extends Error {}

function config() {
  const url = process.env.VITRINE_WP_URL?.replace(/\/+$/, "");
  const user = process.env.VITRINE_WP_USER;
  const pass = process.env.VITRINE_WP_APP_PASSWORD;
  if (!url || !user || !pass) throw new WpConfigError("Accès WordPress de la vitrine non configuré (VITRINE_WP_URL, VITRINE_WP_USER, VITRINE_WP_APP_PASSWORD).");
  return { url, auth: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
}

export const isWpConfigured = () => Boolean(process.env.VITRINE_WP_URL && process.env.VITRINE_WP_USER && process.env.VITRINE_WP_APP_PASSWORD);

export type MediaInfo = { url: string; alt: string; mime: string; width: number | null; bytes: number | null; file: string | null };

/**
 * L'image principale des articles, mesurée pour la note v3 (19/11/2026) : adresse, texte
 * alternatif, format, largeur, poids et nom de fichier, par paquets de 100.
 */
export async function fetchMediaInfo(ids: number[]): Promise<Map<number, MediaInfo>> {
  const { url, auth } = config();
  const out = new Map<number, MediaInfo>();
  const unique = [...new Set(ids.filter((n) => n > 0))];
  for (let i = 0; i < unique.length; i += 100) {
    const batch = unique.slice(i, i + 100);
    const q = new URLSearchParams({ include: batch.join(","), per_page: "100", _fields: "id,source_url,alt_text,mime_type,media_details" });
    const res = await fetch(`${url}/wp-json/wp/v2/media?${q}`, { headers: { Authorization: auth }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`WordPress a répondu ${res.status} sur les images.`);
    for (const m of (await res.json()) as { id: number; source_url?: string; alt_text?: string; mime_type?: string; media_details?: { width?: number; filesize?: number; file?: string } }[]) {
      out.set(m.id, { url: m.source_url ?? "", alt: m.alt_text ?? "", mime: m.mime_type ?? "", width: m.media_details?.width ?? null, bytes: m.media_details?.filesize ?? null, file: m.media_details?.file ?? null });
    }
  }
  return out;
}

/**
 * Tous les articles (publiés, programmés, brouillons, en attente, privés),
 * modifiés depuis `modifiedAfter` s'il est donné. Page par page.
 */
export async function listWpArticles(o: { modifiedAfter?: Date; postType?: string } = {}): Promise<WpPost[]> {
  const { url, auth } = config();
  const out: WpPost[] = [];
  for (let page = 1; page <= 50; page++) {
    const q = new URLSearchParams({
      context: "edit",
      per_page: String(PER_PAGE),
      page: String(page),
      status: "publish,future,draft,pending,private",
      orderby: "modified",
      order: "desc",
      _fields: FIELDS,
    });
    if (o.modifiedAfter) q.set("modified_after", o.modifiedAfter.toISOString());
    const res = await fetch(`${url}/wp-json/wp/v2/${o.postType ?? WP_POST_TYPE}?${q}`, { headers: { Authorization: auth }, cache: "no-store", signal: AbortSignal.timeout(30_000) });
    // Au-delà de la dernière page, WordPress répond 400 (rest_post_invalid_page_number).
    if (res.status === 400 && page > 1) break;
    if (!res.ok) throw new Error(`WordPress a répondu ${res.status} sur la page ${page} des articles.`);
    const rows = (await res.json()) as WpPost[];
    out.push(...rows);
    const pages = Number(res.headers.get("x-wp-totalpages") ?? "1");
    if (rows.length < PER_PAGE || page >= pages) break;
  }
  return out;
}
