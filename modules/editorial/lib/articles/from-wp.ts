import { htmlToText } from "@/core/lib/html";
import { isKnownUnpublished, OCTOBER_REVIEW } from "@/modules/editorial/lib/articles/october-review";
import { statusFromWordPress } from "@/modules/editorial/lib/articles/statuses";
import { guessThemeNumber } from "@/modules/editorial/lib/articles/themes";

/** Les relecteurs de la vitrine (champ utilisateur ACF `methode.relu_par` = ID WordPress). */
export const WP_REVIEWER_LIST = [
  { id: 1, name: "Charlie Piancatelli" },
  { id: 4, name: "Aude Pretrelini" },
] as const;
const WP_REVIEWERS: Record<number, string> = Object.fromEntries(WP_REVIEWER_LIST.map((r) => [r.id, r.name]));

/** L'ID WordPress d'un relecteur choisi par son nom (null s'il n'est pas dans la liste). Pure. */
export const reviewerId = (name: unknown): number | null => WP_REVIEWER_LIST.find((r) => r.name === String(name ?? "").trim())?.id ?? null;

/** Le nom du relecteur, que `relu_par` soit un ID WordPress, un objet utilisateur ou déjà un nom. Pure. */
export function reviewerName(v: unknown): string {
  if (v == null || v === "" || v === false) return "";
  if (typeof v === "object") return String((v as { display_name?: string; name?: string }).display_name ?? (v as { name?: string }).name ?? "");
  const n = Number(v);
  if (Number.isInteger(n) && n > 0) return WP_REVIEWERS[n] ?? `utilisateur WordPress n° ${n}`;
  return String(v);
}

/**
 * D'UN ARTICLE WORDPRESS (CPT `actualite`, lu avec `context=edit`) À UNE FICHE
 * DU TABLEAU. Pur (testé) : la lecture réseau est dans wp-client.ts, l'écriture
 * en base dans sync.ts.
 *
 * Partage des rôles (décision du 18/11/2026 : « WordPress fait foi ») :
 *  - ce qui vient de WordPress (titre, contenu, SEO, statut en ligne, dates) est
 *    RÉÉCRIT à chaque synchronisation : une modification faite dans WordPress
 *    arrive dans le support ;
 *  - ce qui est propre au tableau (thématique, intention, mot-clé, historique,
 *    échéances) n'est posé qu'à la CRÉATION de la fiche, puis jamais écrasé.
 */

export type WpPost = {
  id: number;
  slug?: string;
  status?: string;
  link?: string;
  date?: string;
  date_gmt?: string;
  modified?: string;
  modified_gmt?: string;
  author?: number;
  categories?: number[];
  title?: { raw?: string; rendered?: string };
  acf?: WpAcf | unknown[] | null;
  seo_meta?: { title?: string; metadesc?: string; focuskw?: string } | null;
  /** L'image principale (0 : aucune). */
  featured_media?: number;
};

export type WpAcf = {
  temps_de_lecture?: string;
  introduction?: string;
  contenu?: { acf_fc_layout?: string; texte?: string; [k: string]: unknown }[] | false | null;
  conclusion?: string;
  faq?: { titre?: string; text?: string }[] | false | null;
  sources?: { libelle?: string; url?: string; date?: string }[] | false | null;
  methode?: { assistance_ia?: boolean; note_methode?: string; relu_par?: string | number | null; relu_le?: string } | null;
  date_mise_a_jour?: string;
  resume_mise_a_jour?: string;
  [k: string]: unknown;
};

/** ACF vide : WordPress renvoie `[]` au lieu d'un objet quand aucun champ n'est rempli. */
export const acfOf = (post: WpPost): WpAcf => (post.acf && !Array.isArray(post.acf) && typeof post.acf === "object" ? (post.acf as WpAcf) : {});
const list = <T>(v: T[] | false | null | undefined): T[] => (Array.isArray(v) ? v : []);

/** Une date WordPress en UTC (`date_gmt`, `modified_gmt` : sans fuseau, mais en UTC) → ISO. */
const wpGmt = (v: string | undefined) => (v && !Number.isNaN(Date.parse(`${v}Z`)) ? new Date(`${v}Z`).toISOString() : null);

/** Une date ACF (`Y-m-d`, `Ymd` ou `d/m/Y`) → `YYYY-MM-DD`, sinon null. */
export function acfDate(v: unknown): string | null {
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

/** Le texte lisible de l'article (introduction, blocs, conclusion, FAQ), pour compter ses mots. */
export function articlePlainText(acf: WpAcf): string {
  const parts = [
    acf.introduction ?? "",
    ...list(acf.contenu).map((b) => (typeof b.texte === "string" ? b.texte : "")),
    acf.conclusion ?? "",
    ...list(acf.faq).flatMap((q) => [q.titre ?? "", q.text ?? ""]),
  ];
  return parts.map((p) => htmlToText(p)).filter(Boolean).join("\n");
}

export const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/u).length : 0);

/** Les champs qui viennent de WordPress, réécrits à chaque synchronisation. */
export function wordpressFields(post: WpPost) {
  const acf = acfOf(post);
  const words = countWords(articlePlainText(acf));
  const title = htmlToText(post.title?.raw ?? post.title?.rendered ?? "") || `Article ${post.id}`;
  return {
    title,
    slug: post.slug ?? "",
    wpId: post.id,
    wpStatus: post.status ?? "",
    wpLink: post.link ?? "",
    wpModified: wpGmt(post.modified_gmt),
    publishedAt: post.status === "publish" || post.status === "future" ? wpGmt(post.date_gmt) : null,
    wpAuthor: post.author ?? null,
    wpCategories: post.categories ?? [],
    seoTitle: post.seo_meta?.title ?? "",
    seoDescription: post.seo_meta?.metadesc ?? "",
    wpFocusKeyword: post.seo_meta?.focuskw ?? "",
    acf,
    wordCount: words,
    faqCount: list(acf.faq).length,
    sourcesCount: list(acf.sources).filter((s) => s.url).length,
    hasTldr: /class=["']tldr-box["']/.test(acf.introduction ?? ""),
    assistanceIa: acf.methode?.assistance_ia === true,
    reviewedBy: reviewerName(acf.methode?.relu_par),
    reviewedOn: acfDate(acf.methode?.relu_le),
    updatedOnWp: acfDate(acf.date_mise_a_jour),
  };
}

export type ExistingArticle = {
  id: number | string;
  status?: string | null;
  keyword?: string | null;
};

/**
 * Ce qu'il faut écrire pour ce post : la fiche entière à la création, les seuls
 * champs WordPress (+ le statut) ensuite. `themeIdByNumber` relie le numéro de
 * thématique à sa ligne en base. Pure (testée).
 */
export function articleDataFromWp(post: WpPost, existing: ExistingArticle | null, themeIdByNumber: Record<number, number | string>) {
  const fields = wordpressFields(post);
  const status = statusFromWordPress(existing?.status, post.status ?? "", isKnownUnpublished(post.id));
  if (existing) {
    // Le mot-clé n'est repris de Yoast que s'il est encore vide : un mot-clé saisi dans le tableau gagne.
    return { ...fields, status, ...(existing.keyword ? {} : { keyword: fields.wpFocusKeyword }) };
  }
  const review = OCTOBER_REVIEW[post.id];
  const themeNumber = guessThemeNumber({ categories: post.categories, slug: post.slug, title: fields.title });
  const theme = themeNumber != null ? (themeIdByNumber[themeNumber] ?? null) : null;
  const notes = [
    review?.lot ? `Revue d'octobre 2026 : ${review.lot}.` : "",
    review?.notes ?? "",
    review?.redirectTo ? `Retiré du site en octobre 2026 (doublon), redirigé vers l'article ${review.redirectTo}.` : "",
    status === "a-verifier" ? "Brouillon importé de WordPress : à trier (le reprendre, le fusionner ou le supprimer)." : "",
  ].filter(Boolean);
  return {
    ...fields,
    status,
    keyword: fields.wpFocusKeyword,
    theme,
    themeSource: theme ? "auto" : null,
    keepSeoTitle: review?.keepSeoTitle === true,
    deadlines: (review?.deadlines ?? []).map((d) => ({ date: d.date, reason: d.reason })),
    redirectTo: review?.redirectTo ?? null,
    notes: notes.join("\n"),
    origin: "import-wordpress",
  };
}
