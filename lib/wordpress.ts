import type {
  WPPost, WPCategory, ArticleSummary, ArticleFull, Feature, FeatureTerm,
  Reward, PointsSummary, RedeemResult, Mission,
} from "./types";

const API_URL =
  process.env.SUPPORT_WP_API_URL ??
  "https://support-tim-management.co/wp-json/wp/v2";

const TIM_API_URL =
  process.env.SUPPORT_WP_API_URL
    ? process.env.SUPPORT_WP_API_URL.replace("/wp/v2", "/tim-support/v1")
    : "https://support-tim-management.co/wp-json/tim-support/v1";

const DEFAULT_REVALIDATE = 3600; // 1h

async function wpFetch<T>(
  path: string,
  params: Record<string, string | number> = {},
  revalidate = DEFAULT_REVALIDATE
): Promise<T | null> {
  const url = new URL(`${API_URL}${path}`);
  Object.entries(params).forEach(([k, v]) =>
    url.searchParams.set(k, String(v))
  );

  try {
    const res = await fetch(url.toString(), {
      next: { revalidate },
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.warn(`WP API ${res.status} on ${url}`);
      return null;
    }

    return res.json() as Promise<T>;
  } catch (err) {
    console.warn(`WP API fetch failed on ${url}:`, err);
    return null;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function toSummary(post: WPPost): ArticleSummary {
  const categories =
    post._embedded?.["wp:term"]?.[0]?.filter((t) => !t.parent) ?? [];
  const thumbnail =
    post._embedded?.["wp:featuredmedia"]?.[0]?.source_url;

  return {
    id: post.id,
    slug: post.slug,
    title: post.title.rendered,
    excerpt: post.excerpt.rendered.replace(/<[^>]+>/g, "").slice(0, 160),
    date: post.date,
    categories,
    thumbnail,
  };
}

function toFull(post: WPPost): ArticleFull {
  return {
    ...toSummary(post),
    content: post.content.rendered,
    modified: post.modified,
    seo: {
      title: post.yoast_head_json?.title,
      description: post.yoast_head_json?.description,
    },
  };
}

// ─── API publique ────────────────────────────────────────────────────────────

/** Toutes les catégories (exclut parent = 0 si vous avez des sous-catégories) */
export async function getCategories(): Promise<WPCategory[]> {
  const result = await wpFetch<WPCategory[]>("/categories", {
    per_page: 50,
    hide_empty: 1,
    orderby: "count",
    order: "desc",
  });
  return result ?? [];
}

/** Articles récents (page d'accueil) */
export async function getRecentArticles(
  perPage = 12
): Promise<ArticleSummary[]> {
  const posts = await wpFetch<WPPost[]>("/posts", {
    per_page: perPage,
    _embed: "wp:featuredmedia,wp:term",
    orderby: "date",
    order: "desc",
  });
  return (posts ?? []).map(toSummary);
}

/** Articles par catégorie */
export async function getArticlesByCategory(
  categoryId: number,
  perPage = 20,
  page = 1
): Promise<ArticleSummary[]> {
  const posts = await wpFetch<WPPost[]>("/posts", {
    categories: categoryId,
    per_page: perPage,
    page,
    _embed: "wp:featuredmedia,wp:term",
  });
  return (posts ?? []).map(toSummary);
}

/** Article par slug */
export async function getArticleBySlug(
  slug: string
): Promise<ArticleFull | null> {
  const posts = await wpFetch<WPPost[]>("/posts", {
    slug,
    _embed: "wp:featuredmedia,wp:term",
  });
  if (!posts?.length) return null;
  return toFull(posts[0]);
}

/** Recherche plein texte */
export async function searchArticles(
  query: string,
  perPage = 15
): Promise<ArticleSummary[]> {
  if (!query.trim()) return [];
  const posts = await wpFetch<WPPost[]>("/posts", {
    search: query,
    per_page: perPage,
    _embed: "wp:featuredmedia,wp:term",
  });
  return (posts ?? []).map(toSummary);
}

/** Catégorie par slug */
export async function getCategoryBySlug(
  slug: string
): Promise<WPCategory | null> {
  const cats = await wpFetch<WPCategory[]>("/categories", { slug });
  return cats?.[0] ?? null;
}

/** Slugs de tous les articles — retourne [] si l'API est inaccessible */
export async function getAllArticleSlugs(): Promise<string[]> {
  const posts = await wpFetch<WPPost[]>("/posts", {
    per_page: 100,
    fields: "slug",
  });
  return (posts ?? []).map((p) => p.slug);
}

/** Slugs de toutes les catégories */
export async function getAllCategorySlugs(): Promise<string[]> {
  const cats = await getCategories();
  return cats.map((c) => c.slug);
}

// ─── Features ────────────────────────────────────────────────────────────────

async function timFetch<T>(
  path: string,
  params: Record<string, string | number> = {},
  revalidate = DEFAULT_REVALIDATE
): Promise<T | null> {
  const url = new URL(`${TIM_API_URL}${path}`);
  Object.entries(params).forEach(([k, v]) =>
    url.searchParams.set(k, String(v))
  );

  const isDev = process.env.NODE_ENV === "development";

  try {
    const res = await fetch(url.toString(), {
      ...(isDev ? { cache: "no-store" } : { next: { revalidate } }),
      headers: { Accept: "application/json" },
    });

    if (!res.ok) {
      console.warn(`TIM API ${res.status} on ${url}`);
      return null;
    }

    return res.json() as Promise<T>;
  } catch (err) {
    console.warn(`TIM API fetch failed on ${url}:`, err);
    return null;
  }
}

/** Toutes les features (avec filtres optionnels plateforme / catégorie) */
export async function getFeatures(opts: {
  platform?: string;
  category?: string;
} = {}): Promise<Feature[]> {
  const params: Record<string, string> = {};
  if (opts.platform) params.platform = opts.platform;
  if (opts.category) params.category = opts.category;

  const result = await timFetch<Feature[]>("/features", params);
  return result ?? [];
}

/** Feature par slug */
export async function getFeatureBySlug(slug: string): Promise<Feature | null> {
  return timFetch<Feature>(`/features/${slug}`);
}

/** Toutes les catégories de features avec leur hiérarchie (parent inclus) */
export async function getFeatureCategories(): Promise<FeatureTerm[]> {
  const result = await timFetch<FeatureTerm[]>("/feature-categories");
  return result ?? [];
}

/** Plateformes disponibles */
export async function getPlatforms(): Promise<FeatureTerm[]> {
  const result = await timFetch<FeatureTerm[]>("/platforms");
  return result ?? [];
}

/** Slugs de toutes les features — pour generateStaticParams */
export async function getAllFeatureSlugs(): Promise<string[]> {
  const features = await getFeatures();
  return features.map((f) => f.slug);
}

// ─── Parcours d'apprentissage ────────────────────────────────────────────────

/** Liste tous les parcours publiés (résumé sans le contenu des steps) */
export async function getParcours(): Promise<import("@/lib/types").ParcoursSummary[]> {
  const r = await timFetch<import("@/lib/types").ParcoursSummary[]>("/parcours");
  return r ?? [];
}

/** Parcours complet avec features embedded (full, prêtes à rendre) */
export async function getParcoursBySlug(
  slug: string
): Promise<import("@/lib/types").ParcoursFull | null> {
  return timFetch<import("@/lib/types").ParcoursFull>(`/parcours/${slug}`);
}

/** Slugs de tous les parcours — pour generateStaticParams */
export async function getAllParcoursSlugs(): Promise<string[]> {
  const list = await getParcours();
  return list.map((p) => p.slug);
}

// ─── Espace partenaires : points & récompenses ───────────────────────────────
//
// Ces appels sont SERVER-ONLY : ils portent le secret partagé
// TIM_INTERNAL_SECRET qui ne doit jamais atteindre le navigateur. À n'utiliser
// que dans des Server Components ou des route handlers. L'identité du
// partenaire (email) provient toujours d'une session JWT vérifiée côté Next.

const INTERNAL_SECRET = process.env.TIM_INTERNAL_SECRET ?? "";

async function timAuthFetch<T>(
  path: string,
  init: RequestInit = {}
): Promise<T | null> {
  try {
    const res = await fetch(`${TIM_API_URL}${path}`, {
      ...init,
      cache: "no-store",
      headers: {
        Accept: "application/json",
        "X-Tim-Internal-Secret": INTERNAL_SECRET,
        ...(init.headers ?? {}),
      },
    });
    if (!res.ok) {
      console.warn(`TIM partner API ${res.status} on ${path}`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err) {
    console.warn(`TIM partner API fetch failed on ${path}:`, err);
    return null;
  }
}

/** Catalogue des récompenses disponibles (épuisées masquées côté WP). */
export async function getRewards(): Promise<Reward[]> {
  const r = await timAuthFetch<Reward[]>("/rewards");
  return r ?? [];
}

/** Solde + historique de points d'un partenaire (par email de session). */
export async function getPointsSummary(email: string): Promise<PointsSummary | null> {
  const params = new URLSearchParams({ email });
  return timAuthFetch<PointsSummary>(`/points?${params.toString()}`);
}

/** Liste des missions actives, annotées du statut pour le partenaire courant. */
export async function getMissions(email: string): Promise<Mission[]> {
  const params = new URLSearchParams({ email });
  const r = await timAuthFetch<Mission[]>(`/missions?${params.toString()}`);
  return r ?? [];
}

/** Échange de points contre une récompense. Renvoie le détail WP (succès ou erreur). */
export async function redeemReward(
  email: string,
  rewardId: number
): Promise<{ status: number; data: RedeemResult }> {
  try {
    const res = await fetch(`${TIM_API_URL}/rewards/redeem`, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Tim-Internal-Secret": INTERNAL_SECRET,
      },
      body: JSON.stringify({ email, reward_id: rewardId }),
    });
    const data = (await res.json().catch(() => ({}))) as RedeemResult;
    return { status: res.status, data };
  } catch {
    return {
      status: 503,
      data: { code: "network_error", message: "Impossible de joindre le serveur." },
    };
  }
}

/** Envoie un feedback utilisateur (côté client uniquement) */
export async function submitFeedback(
  postId: number,
  helpful: boolean,
  comment?: string
): Promise<boolean> {
  try {
    const res = await fetch(
      `${TIM_API_URL}/feedback`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post_id: postId, helpful, comment }),
      }
    );
    return res.ok;
  } catch {
    return false;
  }
}
