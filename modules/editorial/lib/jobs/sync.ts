import type { Payload } from "payload";

import { htmlToText } from "@/core/lib/html";
import { acfDate, acfOf, type WpPost } from "@/modules/editorial/lib/articles/from-wp";
import { listWpArticles, WP_JOB_TYPE } from "@/modules/editorial/lib/articles/wp-client";

/**
 * SYNCHRONISATION WORDPRESS → FICHES MÉTIER (étape 9), sur le modèle des
 * articles : premier passage = import de toutes les fiches ; ensuite, celles
 * modifiées depuis la dernière modification connue (2 h de marge). Les champs
 * venus de WordPress sont réécrits ; ce qui est propre au tableau (pourquoi,
 * proposé par, chiffres de clics) ne l'est jamais. Lecture seule de WordPress.
 */

const COLL = "job-sheets" as never;
const PUBLIC_SITE = "https://tim-management.co";
const MARGIN_MS = 2 * 3_600_000;

const wpGmt = (v: string | undefined) => (v && !Number.isNaN(Date.parse(`${v}Z`)) ? new Date(`${v}Z`).toISOString() : null);

/** Les champs d'une fiche venus de WordPress. Pur (testé). */
export function jobFieldsFromWp(post: WpPost) {
  const acf = acfOf(post) as Record<string, unknown>;
  return {
    title: htmlToText(post.title?.raw ?? post.title?.rendered ?? "") || `Fiche ${post.id}`,
    slug: post.slug ?? "",
    wpId: post.id,
    wpStatus: post.status ?? "",
    // L'adresse PUBLIQUE de la vitrine (/fiche-metier/…), pas celle de WordPress (/metier/…) :
    // c'est elle que Google et GA4 connaissent (chiffres du lundi).
    wpLink: post.slug ? `${PUBLIC_SITE}/fiche-metier/${post.slug}` : (post.link ?? ""),
    wpModified: wpGmt(post.modified_gmt),
    publishedAt: post.status === "publish" ? wpGmt(post.date_gmt) : null,
    rome: String(acf.rome ?? "").trim().toUpperCase() || null,
    figuresUpdatedAt: acfDate(acf.derniere_mise_a_jour),
    // La méta Yoast (note v3, 19/11/2026).
    seoTitle: post.seo_meta?.title ?? "",
    seoDescription: post.seo_meta?.metadesc ?? "",
    wpFocusKeyword: post.seo_meta?.focuskw ?? "",
    acf,
  };
}

/** Le statut d'une fiche d'après WordPress : en ligne → Publiée ; une fiche arrêtée le reste. Pur (testé). */
export function jobStatusFromWp(local: string | null | undefined, wp: string): string {
  if (local === "arretee") return "arretee";
  if (wp === "publish") return "publiee";
  return local ?? "a-verifier";
}

export async function syncJobSheetsFromWordPress(payload: Payload, o: { full?: boolean } = {}) {
  const last = o.full
    ? null
    : ((await payload.find({ collection: COLL, sort: "-wpModified", limit: 1, depth: 0, overrideAccess: true, where: { wpModified: { exists: true } }, select: { wpModified: true } as never })).docs[0] as unknown as { wpModified?: string } | undefined)?.wpModified;
  const posts = await listWpArticles({ postType: WP_JOB_TYPE, ...(last ? { modifiedAfter: new Date(Date.parse(last) - MARGIN_MS) } : {}) });
  const result = { read: posts.length, created: 0, updated: 0, errors: [] as string[] };
  for (const post of posts) {
    try {
      const fields = jobFieldsFromWp(post);
      const found = (await payload.find({ collection: COLL, where: { wpId: { equals: post.id } }, limit: 1, depth: 0, overrideAccess: true, select: { status: true } as never })).docs[0] as unknown as { id: number; status?: string } | undefined;
      const data = { ...fields, status: jobStatusFromWp(found?.status, post.status ?? ""), syncedAt: new Date().toISOString() };
      if (found) {
        await payload.update({ collection: COLL, id: found.id, data: data as never, overrideAccess: true });
        result.updated++;
      } else {
        await payload.create({ collection: COLL, data: data as never, overrideAccess: true });
        result.created++;
      }
    } catch (e) {
      result.errors.push(`Fiche WordPress ${post.id} : ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
