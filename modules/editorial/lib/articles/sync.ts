import type { Payload } from "payload";

import { articleDataFromWp, type ExistingArticle } from "@/modules/editorial/lib/articles/from-wp";
import { THEME_SEEDS } from "@/modules/editorial/lib/articles/themes";
import { fetchMediaInfo, listWpArticles, type MediaInfo } from "@/modules/editorial/lib/articles/wp-client";

/**
 * SYNCHRONISATION WORDPRESS → TABLEAU DES ARTICLES.
 *
 * - Premier passage (tableau vide) : import de TOUS les articles de la vitrine.
 * - Ensuite, chaque heure (cron) ou à la demande : les articles modifiés dans
 *   WordPress depuis la dernière modification connue, avec 2 h de marge (les
 *   dates WordPress du filtre sont à l'heure du site, pas en UTC).
 * - `full: true` relit tout (bouton « Tout relire »).
 *
 * Les thématiques sont créées au premier passage si la collection est vide.
 * Ne fait QUE LIRE WordPress.
 */

const MARGIN_MS = 2 * 3_600_000;
const COLLECTION = "articles" as never;
const THEMES = "article-themes" as never;

export type SyncResult = { read: number; created: number; updated: number; unchanged: number; errors: string[]; full: boolean };

async function ensureThemes(payload: Payload): Promise<Record<number, number | string>> {
  const existing = await payload.find({ collection: THEMES, pagination: false, depth: 0, overrideAccess: true });
  const docs = existing.docs as unknown as { id: number | string; number?: number }[];
  if (docs.length === 0) {
    for (const t of THEME_SEEDS) {
      const created = await payload.create({
        collection: THEMES,
        overrideAccess: true,
        data: { number: t.number, name: t.name, kind: t.kind, pillar: t.pillar, module: t.module, priority: t.priority, subthemes: t.subthemes.map((name) => ({ name })) } as never,
      });
      docs.push(created as unknown as { id: number | string; number: number });
    }
  }
  return Object.fromEntries(docs.filter((d) => d.number != null).map((d) => [d.number as number, d.id]));
}

/** La date de modification WordPress la plus récente connue du tableau. */
async function lastKnownModification(payload: Payload): Promise<Date | null> {
  const r = await payload.find({ collection: COLLECTION, sort: "-wpModified", limit: 1, depth: 0, overrideAccess: true, where: { wpModified: { exists: true } }, select: { wpModified: true } as never });
  const v = (r.docs[0] as unknown as { wpModified?: string } | undefined)?.wpModified;
  return v ? new Date(v) : null;
}

export async function syncArticlesFromWordPress(payload: Payload, o: { full?: boolean } = {}): Promise<SyncResult> {
  const themeIdByNumber = await ensureThemes(payload);
  const last = o.full ? null : await lastKnownModification(payload);
  const posts = await listWpArticles(last ? { modifiedAfter: new Date(last.getTime() - MARGIN_MS) } : {});
  const result: SyncResult = { read: posts.length, created: 0, updated: 0, unchanged: 0, errors: [], full: !last };
  // Les images principales, mesurées pour la note (format, largeur, poids, texte alternatif).
  const media = await fetchMediaInfo(posts.map((p) => Number(p.featured_media ?? 0))).catch((e) => {
    result.errors.push(`Images : ${e instanceof Error ? e.message : String(e)}`);
    return new Map<number, MediaInfo>();
  });
  const imageOf = (p: { featured_media?: number }) => {
    const id = Number(p.featured_media ?? 0);
    const m = id ? media.get(id) : undefined;
    return id && m ? { featuredMediaId: id, featuredImageUrl: m.url, imageAlt: m.alt, imageMime: m.mime, imageWidth: m.width, imageBytes: m.bytes, imageFile: m.file } : id ? {} : { featuredMediaId: null, featuredImageUrl: null, imageAlt: null, imageMime: null, imageWidth: null, imageBytes: null, imageFile: null };
  };

  for (const post of posts) {
    try {
      const found = await payload.find({ collection: COLLECTION, where: { wpId: { equals: post.id } }, limit: 1, depth: 0, overrideAccess: true, select: { status: true, keyword: true, wpModified: true } as never });
      const existing = (found.docs[0] as unknown as (ExistingArticle & { wpModified?: string }) | undefined) ?? null;
      const data = { ...articleDataFromWp(post, existing, themeIdByNumber), ...imageOf(post) };
      if (existing) {
        const same = existing.wpModified && data.wpModified && new Date(existing.wpModified).getTime() === new Date(data.wpModified).getTime() && existing.status === data.status;
        if (same && !o.full) {
          result.unchanged++;
          continue;
        }
        await payload.update({ collection: COLLECTION, id: existing.id, data: { ...data, syncedAt: new Date().toISOString() } as never, overrideAccess: true, context: { fromWordPress: true } });
        result.updated++;
      } else {
        await payload.create({ collection: COLLECTION, data: { ...data, syncedAt: new Date().toISOString() } as never, overrideAccess: true, context: { fromWordPress: true } });
        result.created++;
      }
    } catch (err) {
      result.errors.push(`Article WordPress ${post.id} : ${err instanceof Error ? err.message : String(err)}`);
    }
  }
  return result;
}
