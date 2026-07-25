import { convertLexicalToHTML } from "@payloadcms/richtext-lexical/html";
import type { SerializedEditorState } from "@payloadcms/richtext-lexical/lexical";

import { payloadClient } from "./payload-client";
import type {
  ArticleFull,
  ArticleSummary,
  Feature,
  FeatureStatus,
  FeatureTerm,
  MediaDocItem,
  MediaPosition,
  ParcoursFull,
  ParcoursProfil,
  ParcoursSummary,
  WPCategory,
  WPMedia,
} from "./types";

/**
 * Couche de lecture Payload — même interface que lib/wordpress.ts (mêmes types
 * de retour) pour l'ÉDITORIAL, afin que les pages du front basculent sans
 * changer leur code. Le métier (points, missions…) reste dans lib/wordpress.ts.
 */

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Convertit un état Lexical (richText Payload) en HTML pour le front. */
export function lexicalToHtml(data: unknown): string {
  const state = data as SerializedEditorState | undefined;
  if (!state || !state.root) return "";
  try {
    return convertLexicalToHTML({ data: state, disableContainer: true });
  } catch {
    return "";
  }
}

type MediaDoc = { id: number; url?: string | null; alt?: string | null; filename?: string | null; width?: number | null; height?: number | null; mimeType?: string | null; filesize?: number | null };

/** upload Payload (populé) → URL, ou null. */
export function mediaUrl(m: unknown): string | null {
  return m && typeof m === "object" ? ((m as MediaDoc).url ?? null) : null;
}

function toWPMedia(m: unknown): WPMedia {
  const d = (m ?? {}) as MediaDoc;
  return {
    id: d.id ?? 0,
    source_url: d.url ?? "",
    alt_text: d.alt ?? "",
    media_details: { width: d.width ?? 0, height: d.height ?? 0, sizes: {} },
  };
}

type TermDoc = { id: number; name: string; slug: string; parent?: number | { id: number } | null };
function toTerm(t: unknown): FeatureTerm {
  const d = t as TermDoc;
  const parent = typeof d.parent === "object" && d.parent ? d.parent.id : (d.parent as number) || 0;
  return { id: d.id, name: d.name, slug: d.slug, parent };
}

const STATUS_LABEL: Record<string, FeatureStatus> = {
  disponible: "Disponible",
  beta: "Beta",
  prochainement: "Prochainement",
};

// ─── Features ────────────────────────────────────────────────────────────────

function mapMediaBlock(b: Record<string, unknown>): MediaDocItem | null {
  switch (b.blockType) {
    case "img":
      return { acf_fc_layout: "img", img: toWPMedia(b.image) };
    case "galerie":
      return { acf_fc_layout: "galerie", galerie: ((b.images as unknown[]) ?? []).map(toWPMedia) };
    case "editeur":
      return { acf_fc_layout: "editeur", editeur: lexicalToHtml(b.content) };
    case "fichier": {
      const f = (b.file ?? {}) as MediaDoc;
      return {
        acf_fc_layout: "fichier",
        fichier: {
          url: f.url ?? "",
          filename: f.filename ?? "",
          filesize: f.filesize ?? 0,
          mime_type: f.mimeType ?? "",
        },
      };
    }
    default:
      return null;
  }
}

type FeatureDoc = Record<string, any>;

function toFeature(d: FeatureDoc, full: boolean): Feature {
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    thumbnail: mediaUrl(d.thumbnail),
    platforms: (d.platforms ?? []).map(toTerm),
    categories: (d.categories ?? []).map(toTerm),
    acf: {
      title_feature: d.titleFeature || d.title,
      short_description: d.shortDescription || "",
      status: STATUS_LABEL[d.availability] ?? "Disponible",
      keywords: d.keywords ?? [],
      doc: full
        ? (d.doc ?? []).map((s: Record<string, unknown>) => ({
            title_doc: (s.titleDoc as string) || "",
            description_doc: lexicalToHtml(s.descriptionDoc),
            media_position: (s.mediaPosition === "gauche" ? "Gauche" : "Droite") as MediaPosition,
            media_doc: ((s.mediaDoc as Record<string, unknown>[]) ?? [])
              .map(mapMediaBlock)
              .filter((x): x is MediaDocItem => x !== null),
          }))
        : [],
    },
    feedback: {
      helpful: d.feedback?.helpful ?? 0,
      not_helpful: d.feedback?.notHelpful ?? 0,
    },
    date: d.createdAt,
    modified: d.updatedAt,
    ...(full ? { content: lexicalToHtml(d.content) } : {}),
  };
}

export async function getFeatures(
  opts: { platform?: string; category?: string } = {},
): Promise<Feature[]> {
  const payload = await payloadClient();
  const res = await payload.find({ collection: "features", limit: 1000, depth: 1, sort: "title" });
  let docs = res.docs as FeatureDoc[];
  if (opts.platform)
    docs = docs.filter((d) => (d.platforms ?? []).some((p: TermDoc) => p.slug === opts.platform));
  if (opts.category)
    docs = docs.filter((d) => (d.categories ?? []).some((c: TermDoc) => c.slug === opts.category));
  return docs.map((d) => toFeature(d, false));
}

export async function getFeatureBySlug(slug: string): Promise<Feature | null> {
  const payload = await payloadClient();
  const res = await payload.find({
    collection: "features",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 2,
  });
  const doc = res.docs[0] as FeatureDoc | undefined;
  return doc ? toFeature(doc, true) : null;
}

export async function getFeatureCategories(): Promise<FeatureTerm[]> {
  const payload = await payloadClient();
  const res = await payload.find({ collection: "feature-categories", limit: 1000, depth: 1, sort: "name" });
  return (res.docs as TermDoc[]).map(toTerm);
}

export async function getPlatforms(): Promise<FeatureTerm[]> {
  const payload = await payloadClient();
  const res = await payload.find({ collection: "platforms", limit: 1000, depth: 0, sort: "name" });
  return (res.docs as TermDoc[]).map(toTerm);
}

export async function getAllFeatureSlugs(): Promise<string[]> {
  const payload = await payloadClient();
  const res = await payload.find({ collection: "features", limit: 1000, depth: 0 });
  return (res.docs as FeatureDoc[]).map((d) => d.slug);
}

// ─── Parcours ────────────────────────────────────────────────────────────────

type ParcoursDoc = Record<string, any>;

function toParcoursSummary(d: ParcoursDoc): ParcoursSummary {
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    intro: d.intro || "",
    profil: (d.profil ?? "") as ParcoursProfil,
    order: d.order ?? 0,
    step_count: (d.steps ?? []).length,
    modified: d.updatedAt,
  };
}

export async function getParcours(): Promise<ParcoursSummary[]> {
  const payload = await payloadClient();
  const res = await payload.find({ collection: "parcours", limit: 1000, depth: 0, sort: "order" });
  return (res.docs as ParcoursDoc[]).map(toParcoursSummary);
}

export async function getParcoursBySlug(slug: string): Promise<ParcoursFull | null> {
  const payload = await payloadClient();
  const res = await payload.find({
    collection: "parcours",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 3, // parcours → steps(features) → doc uploads
  });
  const d = res.docs[0] as ParcoursDoc | undefined;
  if (!d) return null;
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    intro: d.intro || "",
    profil: (d.profil ?? "") as ParcoursProfil,
    order: d.order ?? 0,
    modified: d.updatedAt,
    steps: (d.steps ?? [])
      .filter((s: unknown) => s && typeof s === "object")
      .map((s: FeatureDoc) => toFeature(s, true)),
  };
}

export async function getAllParcoursSlugs(): Promise<string[]> {
  const payload = await payloadClient();
  const res = await payload.find({ collection: "parcours", limit: 1000, depth: 0 });
  return (res.docs as ParcoursDoc[]).map((d) => d.slug);
}

// ─── Articles ────────────────────────────────────────────────────────────────

type ArticleDoc = Record<string, any>;
type CatDoc = { id: number; name: string; slug: string; description?: string; parent?: number | { id: number } | null };

function toWPCategory(c: unknown): WPCategory {
  const d = c as CatDoc;
  const parent = typeof d.parent === "object" && d.parent ? d.parent.id : (d.parent as number) || 0;
  return { id: d.id, name: d.name, slug: d.slug, description: d.description || "", count: 0, parent };
}

function toArticleSummary(d: ArticleDoc): ArticleSummary {
  return {
    id: d.id,
    slug: d.slug,
    title: d.title,
    excerpt: d.excerpt || "",
    date: d.publishedAt || d.createdAt,
    categories: (d.categories ?? []).map(toWPCategory),
    thumbnail: mediaUrl(d.featuredImage) ?? undefined,
  };
}

export async function getRecentArticles(perPage = 12): Promise<ArticleSummary[]> {
  const payload = await payloadClient();
  const res = await payload.find({
    collection: "articles",
    limit: perPage,
    depth: 1,
    sort: "-publishedAt",
  });
  return (res.docs as ArticleDoc[]).map(toArticleSummary);
}

export async function getArticlesByCategory(
  categoryId: number,
  perPage = 20,
  page = 1,
): Promise<ArticleSummary[]> {
  const payload = await payloadClient();
  const res = await payload.find({
    collection: "articles",
    where: { categories: { in: [categoryId] } },
    limit: perPage,
    page,
    depth: 1,
    sort: "-publishedAt",
  });
  return (res.docs as ArticleDoc[]).map(toArticleSummary);
}

export async function getArticleBySlug(slug: string): Promise<ArticleFull | null> {
  const payload = await payloadClient();
  const res = await payload.find({
    collection: "articles",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  });
  const d = res.docs[0] as ArticleDoc | undefined;
  if (!d) return null;
  return {
    ...toArticleSummary(d),
    content: lexicalToHtml(d.content),
    modified: d.updatedAt,
    seo: { title: d.seo?.title, description: d.seo?.description },
  };
}

export async function searchArticles(query: string, perPage = 15): Promise<ArticleSummary[]> {
  if (!query.trim()) return [];
  const payload = await payloadClient();
  const res = await payload.find({
    collection: "articles",
    where: { title: { like: query } },
    limit: perPage,
    depth: 1,
  });
  return (res.docs as ArticleDoc[]).map(toArticleSummary);
}

export async function getCategories(): Promise<WPCategory[]> {
  const payload = await payloadClient();
  const res = await payload.find({ collection: "article-categories", limit: 1000, depth: 1, sort: "name" });
  return (res.docs as CatDoc[]).map(toWPCategory);
}

export async function getCategoryBySlug(slug: string): Promise<WPCategory | null> {
  const payload = await payloadClient();
  const res = await payload.find({
    collection: "article-categories",
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 1,
  });
  const d = res.docs[0] as CatDoc | undefined;
  return d ? toWPCategory(d) : null;
}

export async function getAllArticleSlugs(): Promise<string[]> {
  const payload = await payloadClient();
  const res = await payload.find({ collection: "articles", limit: 1000, depth: 0 });
  return (res.docs as ArticleDoc[]).map((d) => d.slug);
}

export async function getAllCategorySlugs(): Promise<string[]> {
  const payload = await payloadClient();
  const res = await payload.find({ collection: "article-categories", limit: 1000, depth: 0 });
  return (res.docs as CatDoc[]).map((d) => d.slug);
}
