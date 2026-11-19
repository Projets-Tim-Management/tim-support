import { htmlToText } from "@/core/lib/html";
import type { Article } from "@/modules/editorial/lib/articles/check";
import { WP_POST_TYPE } from "@/modules/editorial/lib/articles/wp-client";

/**
 * LE SEUL POINT D'ÉCRITURE DANS WORDPRESS (étape 6, 18/11/2026).
 *
 * Tout ce que le support écrit sur la vitrine passe ici, avec la même règle
 * (garde-fous des corrections d'octobre 2026) :
 *  - RELIRE AVANT : la version en ligne n'a pas changé depuis qu'on l'a lue
 *    (sinon : conflit, rien n'est écrit — Charlie a peut-être retouché l'article) ;
 *  - n'ÉCRIRE QUE ce qui change (jamais le slug, l'auteur, « relu par » ni le
 *    titre SEO verrouillé lors d'une mise à jour) ;
 *  - RELIRE APRÈS : ce qui est en ligne est bien ce qu'on a écrit, sinon erreur.
 *
 * Le format reprend celui du pipeline Python (wordpress.py, build_payload) :
 * CPT `actualite`, contenu dans les champs ACF, SEO par le champ REST
 * `seo_meta` du plugin tim-api, dates ACF en AAAA-MM-JJ.
 */

export const AUTHOR_DEFAULT = 1; // Charlie Piancatelli
export const REVIEWER = "Charlie Piancatelli";
export const NOTE_METHODE = "Article rédigé avec assistance IA à partir de sources vérifiées, relu avant publication.";

/** Thématique du tableau → catégorie WordPress du CPT `actualite` (relevé du 18/11/2026). */
export const THEME_TO_CATEGORY: Record<number, number> = { 1: 58, 2: 62, 3: 59, 4: 61, 5: 61, 6: 63, 7: 64 };

/** Un slug court à partir du mot-clé : minuscules, sans accents, 60 caractères au plus. Pur (testé). */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/, "");
}

/** AAAA-MM-JJ (date de Paris). */
export const parisDay = (d: Date) => new Intl.DateTimeFormat("fr-CA", { timeZone: "Europe/Paris" }).format(d);

/** Les champs ACF d'un article rédigé (contenu, sources, méthode, dates). Pur (testé). */
export function acfOfArticle(article: Article, o: { reviewedOn?: string | null; updatedOn?: string | null; updateSummary?: string | null }) {
  const methode = (article.methode ?? {}) as { assistance_ia?: boolean; note_methode?: string };
  return {
    temps_de_lecture: String(article.temps_de_lecture ?? ""),
    introduction: String(article.introduction ?? ""),
    contenu: (article.contenu ?? []).filter(Boolean),
    conclusion: String(article.conclusion ?? ""),
    faq: (article.faq ?? []).filter(Boolean),
    sources: (article.sources ?? []).map((s) => ({ libelle: s.libelle ?? "", url: s.url ?? "", date: s.date ?? "" })),
    methode: {
      assistance_ia: methode.assistance_ia !== false,
      note_methode: methode.note_methode || NOTE_METHODE,
      ...(o.reviewedOn ? { relu_par: REVIEWER, relu_le: o.reviewedOn } : {}),
    },
    date_mise_a_jour: o.updatedOn ?? "",
    resume_mise_a_jour: o.updateSummary ?? "",
  };
}

/** Le brouillon à créer (toujours `draft`). Pur (testé). */
export function buildDraftPayload(article: Article, o: { keyword: string; themeNumber?: number | null; reviewedOn: string; author?: number }) {
  const category = o.themeNumber != null ? THEME_TO_CATEGORY[o.themeNumber] : undefined;
  const slug = slugify(o.keyword || String(article.title ?? ""));
  return {
    title: String(article.title ?? ""),
    content: "",
    status: "draft" as const,
    author: o.author ?? AUTHOR_DEFAULT,
    ...(slug ? { slug } : {}),
    ...(category ? { categories: [category] } : {}),
    seo_meta: { title: String(article.yoast_title ?? ""), metadesc: String(article.yoast_description ?? ""), focuskw: o.keyword },
    acf: acfOfArticle(article, { reviewedOn: o.reviewedOn }),
  };
}

// ── Réseau ───────────────────────────────────────────────────────────────────

export class WpWriteError extends Error {}

function config() {
  const url = process.env.VITRINE_WP_URL?.replace(/\/+$/, "");
  const user = process.env.VITRINE_WP_USER;
  const pass = process.env.VITRINE_WP_APP_PASSWORD;
  if (!url || !user || !pass) throw new WpWriteError("Accès WordPress de la vitrine non configuré.");
  return { url, auth: `Basic ${Buffer.from(`${user}:${pass}`).toString("base64")}` };
}

async function wp<T>(method: "GET" | "POST", path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  const { url, auth } = config();
  const res = await fetch(`${url}/wp-json/wp/v2/${path}`, {
    method,
    headers: { Authorization: auth, ...(body !== undefined && !(body instanceof Uint8Array) ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body === undefined ? undefined : body instanceof Uint8Array ? (body as unknown as BodyInit) : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(60_000),
  });
  const text = await res.text();
  if (!res.ok) throw new WpWriteError(`WordPress a répondu ${res.status} (${path}) : ${text.slice(0, 300)}`);
  return JSON.parse(text) as T;
}

export type WpPostEdit = { id: number; status: string; link: string; modified_gmt: string; featured_media?: number; acf?: Record<string, unknown> | unknown[]; seo_meta?: Record<string, string> };

export const readPost = (id: number) => wp<WpPostEdit>("GET", `${WP_POST_TYPE}/${id}?context=edit`);

const flatText = (v: unknown): string => htmlToText(typeof v === "string" ? v : JSON.stringify(v ?? "")).replace(/\s+/g, " ").trim();

/** Ce qui est en ligne correspond-il à ce qu'on a écrit ? Comparaison du texte, aux espaces près. Pur (testé). */
export function sameContent(written: Record<string, unknown>, online: Record<string, unknown>): string[] {
  const off: string[] = [];
  for (const [k, v] of Object.entries(written)) {
    if (k === "methode" || k === "date_mise_a_jour") continue; // reformatés par ACF (booléens, dates) : vérifiés à part
    if (flatText(v) !== flatText(online[k])) off.push(k);
  }
  return off;
}

/** Crée le brouillon, puis le relit. */
export async function createDraft(payload: ReturnType<typeof buildDraftPayload>): Promise<{ id: number; link: string }> {
  const created = await wp<WpPostEdit>("POST", WP_POST_TYPE, payload);
  const back = await readPost(created.id);
  const acf = back.acf && !Array.isArray(back.acf) ? back.acf : {};
  const off = sameContent({ introduction: payload.acf.introduction, conclusion: payload.acf.conclusion, contenu: payload.acf.contenu, faq: payload.acf.faq }, acf);
  if (back.status !== "draft") throw new WpWriteError(`Le brouillon ${created.id} n'est pas en brouillon (${back.status}).`);
  if (off.length) throw new WpWriteError(`Brouillon ${created.id} créé, mais différent de l'article rédigé après relecture (${off.join(", ")}).`);
  return { id: created.id, link: back.link };
}

/**
 * Met à jour des champs ACF (et le SEO, si donné) d'un article, après avoir
 * vérifié qu'il n'a pas changé depuis `expectedModifiedIso` (date de modification
 * connue du tableau). Relit et vérifie.
 */
export async function updateFields(id: number, fields: { acf?: Record<string, unknown>; seo_meta?: Record<string, string>; title?: string }, expectedModifiedIso: string | null): Promise<{ modifiedIso: string; previousAcf: Record<string, unknown> }> {
  const before = await readPost(id);
  const iso = (gmt: string) => new Date(`${gmt}Z`).toISOString();
  if (expectedModifiedIso && iso(before.modified_gmt) !== new Date(expectedModifiedIso).toISOString()) {
    throw new WpWriteError(`L'article ${id} a été modifié dans WordPress depuis sa dernière lecture (${before.modified_gmt}) : rien n'est écrit.`);
  }
  const previousAcf = before.acf && !Array.isArray(before.acf) ? before.acf : {};
  await wp("POST", `${WP_POST_TYPE}/${id}`, fields);
  const after = await readPost(id);
  const acf = after.acf && !Array.isArray(after.acf) ? after.acf : {};
  const off = fields.acf ? sameContent(fields.acf, acf) : [];
  if (fields.title != null) {
    const back = await wp<{ title?: { raw?: string } }>("GET", `${WP_POST_TYPE}/${id}?context=edit&_fields=title`);
    if (flatText(back.title?.raw ?? "") !== flatText(fields.title)) off.push("titre");
  }
  if (off.length) throw new WpWriteError(`Article ${id} écrit, mais différent après relecture (${off.join(", ")}). Ancienne version gardée sur la fiche.`);
  return { modifiedIso: iso(after.modified_gmt), previousAcf };
}

/** Publie un brouillon maintenant, et vérifie qu'il est en ligne. */
export async function publishPost(id: number): Promise<{ link: string }> {
  const before = await readPost(id);
  if (before.status === "publish") return { link: before.link };
  if (before.status !== "draft" && before.status !== "future") throw new WpWriteError(`L'article ${id} est « ${before.status} » dans WordPress : publication annulée.`);
  await wp("POST", `${WP_POST_TYPE}/${id}`, { status: "publish", date_gmt: new Date().toISOString().slice(0, 19) });
  const after = await readPost(id);
  if (after.status !== "publish") throw new WpWriteError(`L'article ${id} n'est pas en ligne après publication (${after.status}).`);
  return { link: after.link };
}

/** Envoie une image dans la médiathèque, avec son texte alternatif, et la pose en image principale de l'article. */
export async function setFeaturedImage(postId: number, file: { data: Uint8Array; filename: string; mime: string }, alt: string, caption?: string): Promise<{ mediaId: number; url: string }> {
  const media = await wp<{ id: number; source_url: string }>("POST", "media", file.data, {
    "Content-Type": file.mime,
    "Content-Disposition": `attachment; filename="${file.filename.replace(/"/g, "")}"`,
  });
  await wp("POST", `media/${media.id}`, { alt_text: alt, title: alt, ...(caption ? { caption } : {}) });
  await wp("POST", `${WP_POST_TYPE}/${postId}`, { featured_media: media.id });
  const after = await readPost(postId);
  if (after.featured_media !== media.id) throw new WpWriteError(`Image ${media.id} envoyée, mais pas posée en image principale de l'article ${postId}.`);
  return { mediaId: media.id, url: media.source_url };
}
