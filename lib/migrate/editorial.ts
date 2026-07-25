import type { Payload } from "payload";

import { htmlToLexical, stripHtml } from "./htmlToLexical";
import { uploadMediaFromUrl } from "./media";

/**
 * Coerce en tableau. ACF renvoie `false` (et non `[]`) pour un repeater ou un
 * flexible content vide — ce qui casse les `for…of`. On normalise ici.
 */
const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : []);

// ─── Accès à l'API WordPress (namespace tim-support/v1) ──────────────────────

const TIM_API = process.env.SUPPORT_WP_API_URL
  ? process.env.SUPPORT_WP_API_URL.replace("/wp/v2", "/tim-support/v1")
  : "https://support-tim-management.co/wp-json/tim-support/v1";

async function wp<T>(path: string): Promise<T> {
  const res = await fetch(`${TIM_API}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WP ${res.status} sur ${path}`);
  return res.json() as Promise<T>;
}

// API cœur WordPress (posts / catégories natifs)
const CORE_API =
  process.env.SUPPORT_WP_API_URL ??
  "https://support-tim-management.co/wp-json/wp/v2";

async function wpCore<T>(path: string): Promise<T> {
  const res = await fetch(`${CORE_API}${path}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`WP core ${res.status} sur ${path}`);
  return res.json() as Promise<T>;
}

// ─── Mappings de valeurs ─────────────────────────────────────────────────────

const STATUS: Record<string, string> = {
  Disponible: "disponible",
  Beta: "beta",
  Prochainement: "prochainement",
};
const POSITION: Record<string, string> = { Droite: "droite", Gauche: "gauche" };

// ─── Upsert générique par slug ───────────────────────────────────────────────

type CollSlug = "features" | "platforms" | "feature-categories" | "articles" | "article-categories" | "parcours";

async function upsertBySlug(
  payload: Payload,
  collection: CollSlug,
  slug: string,
  data: Record<string, unknown>,
): Promise<number> {
  const found = await payload.find({
    collection,
    where: { slug: { equals: slug } },
    limit: 1,
    depth: 0,
  });
  if (found.docs.length) {
    const doc = await payload.update({
      collection,
      id: found.docs[0].id,
      data,
    });
    return doc.id as number;
  }
  const doc = await payload.create({ collection, data });
  return doc.id as number;
}

// ─── Taxonomies (plateformes + catégories de features) ───────────────────────

type WPTerm = { id: number; name: string; slug: string; parent?: number };

/**
 * Migre plateformes et catégories de features. Retourne une map slug → id
 * Payload pour brancher les relations des features.
 */
export async function migrateTaxonomies(payload: Payload) {
  const platformBySlug = new Map<string, number>();
  const platforms = await wp<WPTerm[]>("/platforms");
  for (const t of platforms) {
    const id = await upsertBySlug(payload, "platforms", t.slug, {
      name: t.name,
      slug: t.slug,
    });
    platformBySlug.set(t.slug, id);
  }

  const categoryBySlug = new Map<string, number>();
  const categoryByWpId = new Map<number, number>();
  const cats = await wp<WPTerm[]>("/feature-categories");
  for (const t of cats) {
    const id = await upsertBySlug(payload, "feature-categories", t.slug, {
      name: t.name,
      slug: t.slug,
    });
    categoryBySlug.set(t.slug, id);
    categoryByWpId.set(t.id, id);
  }
  // 2e passe : liens parent (une fois tous les ids connus)
  for (const t of cats) {
    const childId = categoryByWpId.get(t.id);
    if (childId && t.parent && categoryByWpId.has(t.parent)) {
      await payload.update({
        collection: "feature-categories",
        id: childId,
        data: { parent: categoryByWpId.get(t.parent) },
      });
    }
  }

  return { platformBySlug, categoryBySlug, counts: { platforms: platforms.length, categories: cats.length } };
}

// ─── Features ────────────────────────────────────────────────────────────────

type WPMediaRef = { source_url: string; alt_text?: string };
type WPMediaDocItem =
  | { acf_fc_layout: "img"; img: WPMediaRef }
  | { acf_fc_layout: "galerie"; galerie: WPMediaRef[] }
  | { acf_fc_layout: "editeur"; editeur: string }
  | { acf_fc_layout: "fichier"; fichier: { url: string; filename: string } };

type WPFeature = {
  id: number;
  slug: string;
  title: string;
  thumbnail: string | null;
  platforms: { slug: string }[];
  categories: { slug: string }[];
  content?: string;
  feedback?: { helpful?: number; not_helpful?: number };
  acf: {
    title_feature?: string;
    short_description?: string;
    status?: string;
    keywords?: string | string[];
    doc?: {
      title_doc?: string;
      description_doc?: string;
      media_position?: string;
      media_doc?: WPMediaDocItem[];
    }[];
  };
};

async function buildMediaBlocks(payload: Payload, items: unknown) {
  const blocks: Record<string, unknown>[] = [];
  for (const item of arr<WPMediaDocItem>(items)) {
    if (item.acf_fc_layout === "img") {
      const id = await uploadMediaFromUrl(payload, item.img?.source_url, item.img?.alt_text);
      if (id) blocks.push({ blockType: "img", image: id });
    } else if (item.acf_fc_layout === "galerie") {
      const ids: number[] = [];
      for (const g of arr<WPMediaRef>(item.galerie)) {
        const id = await uploadMediaFromUrl(payload, g.source_url, g.alt_text);
        if (id) ids.push(id);
      }
      if (ids.length) blocks.push({ blockType: "galerie", images: ids });
    } else if (item.acf_fc_layout === "editeur") {
      blocks.push({ blockType: "editeur", content: await htmlToLexical(payload, item.editeur ?? "") });
    } else if (item.acf_fc_layout === "fichier") {
      const id = await uploadMediaFromUrl(payload, item.fichier?.url, item.fichier?.filename);
      if (id) blocks.push({ blockType: "fichier", file: id });
    }
  }
  return blocks;
}

/** Migre une feature (par son objet WP) → retourne son id Payload. */
export async function migrateFeature(
  payload: Payload,
  f: WPFeature,
  platformBySlug: Map<string, number>,
  categoryBySlug: Map<string, number>,
): Promise<number> {
  const doc = [];
  for (const s of arr<NonNullable<WPFeature["acf"]["doc"]>[number]>(f.acf?.doc)) {
    doc.push({
      titleDoc: s.title_doc ?? "",
      descriptionDoc: await htmlToLexical(payload, s.description_doc ?? ""),
      mediaPosition: POSITION[s.media_position ?? ""] ?? "droite",
      mediaDoc: await buildMediaBlocks(payload, s.media_doc),
    });
  }

  const keywords = Array.isArray(f.acf?.keywords)
    ? f.acf.keywords
    : typeof f.acf?.keywords === "string"
      ? f.acf.keywords.split(/[,;\n]/).map((k) => k.trim()).filter(Boolean)
      : [];

  return upsertBySlug(payload, "features", f.slug, {
    title: f.title,
    slug: f.slug,
    thumbnail: f.thumbnail ? await uploadMediaFromUrl(payload, f.thumbnail, f.title) : null,
    titleFeature: f.acf?.title_feature ?? "",
    shortDescription: stripHtml(f.acf?.short_description),
    availability: STATUS[f.acf?.status ?? ""] ?? "disponible",
    keywords,
    platforms: arr<{ slug: string }>(f.platforms).map((p) => platformBySlug.get(p.slug)).filter(Boolean),
    categories: arr<{ slug: string }>(f.categories).map((c) => categoryBySlug.get(c.slug)).filter(Boolean),
    content: await htmlToLexical(payload, f.content ?? ""),
    doc,
    feedback: {
      helpful: f.feedback?.helpful ?? 0,
      notHelpful: f.feedback?.not_helpful ?? 0,
    },
    _status: "published",
  });
}

// ─── Points d'entrée ─────────────────────────────────────────────────────────

/** TEST : migre les taxonomies + UNE seule feature (par slug). */
export async function migrateOneFeature(payload: Payload, slug: string) {
  const { platformBySlug, categoryBySlug, counts } = await migrateTaxonomies(payload);
  const f = await wp<WPFeature>(`/features/${slug}`);
  const id = await migrateFeature(payload, f, platformBySlug, categoryBySlug);
  return {
    taxonomies: counts,
    feature: { slug, payloadId: id, docSections: f.acf?.doc?.length ?? 0 },
  };
}

/** Migre TOUTES les features. */
export async function migrateAllFeatures(payload: Payload) {
  const { platformBySlug, categoryBySlug, counts } = await migrateTaxonomies(payload);
  const list = await wp<{ slug: string }[]>("/features");
  let ok = 0;
  const errors: { slug: string; error: string }[] = [];
  for (const { slug } of list) {
    try {
      const f = await wp<WPFeature>(`/features/${slug}`);
      await migrateFeature(payload, f, platformBySlug, categoryBySlug);
      ok++;
    } catch (err) {
      errors.push({ slug, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { taxonomies: counts, features: { total: list.length, migrated: ok, errors } };
}

// ─── Parcours ────────────────────────────────────────────────────────────────

type WPParcours = {
  slug: string;
  title: string;
  intro?: string;
  profil?: string;
  order?: number;
  steps?: { slug: string }[];
};

/** Migre les parcours. Nécessite que les features soient déjà migrées
 *  (les étapes sont reliées par slug de feature). */
export async function migrateParcours(payload: Payload) {
  const feats = await payload.find({
    collection: "features",
    limit: 1000,
    depth: 0,
    draft: true,
  });
  const featBySlug = new Map(feats.docs.map((f) => [f.slug as string, f.id as number]));

  const list = await wp<{ slug: string }[]>("/parcours");
  let ok = 0;
  const errors: { slug: string; error: string }[] = [];
  for (const { slug } of list) {
    try {
      const p = await wp<WPParcours>(`/parcours/${slug}`);
      const steps = arr<{ slug: string }>(p.steps)
        .map((s) => featBySlug.get(s.slug))
        .filter((id): id is number => typeof id === "number");
      await upsertBySlug(payload, "parcours", slug, {
        title: p.title,
        slug,
        order: p.order ?? 0,
        profil: p.profil || undefined,
        intro: p.intro ?? "",
        steps,
        _status: "published",
      });
      ok++;
    } catch (err) {
      errors.push({ slug, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { total: list.length, migrated: ok, errors };
}

// ─── Articles (posts natifs WordPress) ───────────────────────────────────────

type WPRendered = { rendered: string };
type WPPost = {
  slug: string;
  title: WPRendered;
  excerpt: WPRendered;
  content: WPRendered;
  date: string;
  categories: number[];
  yoast_head_json?: { title?: string; description?: string };
  _embedded?: { "wp:featuredmedia"?: { source_url: string }[] };
};
type WPCategory = { id: number; name: string; slug: string; description?: string; parent?: number };

/** Migre articles + catégories d'articles (cœur WordPress). */
export async function migrateArticles(payload: Payload) {
  const catByWpId = new Map<number, number>();
  const cats = await wpCore<WPCategory[]>("/categories?per_page=100");
  for (const c of cats) {
    const id = await upsertBySlug(payload, "article-categories", c.slug, {
      name: c.name,
      slug: c.slug,
      description: stripHtml(c.description),
    });
    catByWpId.set(c.id, id);
  }
  for (const c of cats) {
    const childId = catByWpId.get(c.id);
    if (childId && c.parent && catByWpId.has(c.parent)) {
      await payload.update({
        collection: "article-categories",
        id: childId,
        data: { parent: catByWpId.get(c.parent) },
      });
    }
  }

  const posts = await wpCore<WPPost[]>("/posts?per_page=100&_embed");
  let ok = 0;
  const errors: { slug: string; error: string }[] = [];
  for (const p of posts) {
    try {
      const featUrl = p._embedded?.["wp:featuredmedia"]?.[0]?.source_url;
      const featuredImage = featUrl
        ? await uploadMediaFromUrl(payload, featUrl, stripHtml(p.title.rendered))
        : null;
      await upsertBySlug(payload, "articles", p.slug, {
        title: stripHtml(p.title.rendered) || p.slug,
        slug: p.slug,
        excerpt: stripHtml(p.excerpt.rendered),
        content: await htmlToLexical(payload, p.content.rendered),
        categories: p.categories.map((id) => catByWpId.get(id)).filter(Boolean),
        featuredImage,
        publishedAt: p.date,
        seo: {
          title: p.yoast_head_json?.title,
          description: p.yoast_head_json?.description,
        },
        _status: "published",
      });
      ok++;
    } catch (err) {
      errors.push({ slug: p.slug, error: err instanceof Error ? err.message : String(err) });
    }
  }
  return { categories: cats.length, articles: { total: posts.length, migrated: ok, errors } };
}

/** Migration éditoriale complète : features → parcours → articles. */
export async function migrateAllEditorial(payload: Payload) {
  const features = await migrateAllFeatures(payload);
  const parcours = await migrateParcours(payload);
  const articles = await migrateArticles(payload);
  return { features, parcours, articles };
}
