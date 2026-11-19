/**
 * SEO technique : métas Yoast, mot-clé, longueur, cannibalisation (validation.py, l. 958-1051, 1109-1179 ;
 * generator.py, l. 388 pour le temps de lecture).
 */
import { ARTICLE_MIN_WORDS, KEYWORD_INTRO_WORDS, SEO_DESC_MAX, SEO_TITLE_MAX, WORDCOUNT_TOLERANCE } from "./constants";
import { asStr, norm, stripTags, wordCount } from "./normalize";
import { cpLen, pyRe, pyRound, pySplit, pyStrip, stripChars, sub, urlSplit } from "./py";
import type { Article } from "./types";

/**
 * Mots vides de la cannibalisation et du mot-clé (seconde définition de `_STOPWORDS` en Python).
 * Le contexte des chiffres (facts.ts, contentWords) a sa propre liste depuis le 18/11/2026.
 */
const TOPIC_STOPWORDS = new Set(
  "de du des la le les l d a au aux en et ou un une pour sur dans par qui que quoi comment quel quelle quels quelles est ce ca vs avec sans son sa ses mais faut il".split(
    " ",
  ),
);
/** Mots présents dans presque tous les sujets du site : ils ne distinguent pas deux intentions. */
const SITE_GENERIC = new Set("btp batiment chantier guide regle mode pointage feuille heure logiciel ouvrier meilleur top".split(" "));

/** Mots porteurs, sans accents, pluriel simple retiré, années ignorées ; generic=false retire les mots communs au site. */
export function topicTokens(text: string, generic = false): Set<string> {
  const out = new Set<string>();
  for (let w of norm(text).match(/[a-z0-9]+/g) ?? []) {
    if (w.length >= 4 && (w.endsWith("s") || w.endsWith("x"))) w = w.slice(0, -1);
    if (w.length < 3 || TOPIC_STOPWORDS.has(w) || /^20\d\d$/.test(w)) continue;
    if (generic || !SITE_GENERIC.has(w)) out.add(w);
  }
  return out;
}

/** Au moins 2/3 des mots porteurs du mot-clé (mots génériques compris) figurent dans le texte. */
export function keywordPresent(keyword: string, text: string): boolean {
  const kw = topicTokens(keyword, true);
  if (!kw.size) return true;
  const t = topicTokens(text, true);
  const common = Array.from(kw).filter((w) => t.has(w)).length;
  return common * 3 >= 2 * kw.size;
}

/** Mots de l'introduction (TL;DR comprise), conclusion, blocs et FAQ (question + réponse). */
export function articleWordCount(article: Article): number {
  const parts = [asStr(article.introduction), asStr(article.conclusion)];
  for (const b of article.contenu ?? []) parts.push(asStr(b?.texte));
  for (const q of article.faq ?? []) parts.push(asStr(q?.titre) + " " + asStr(q?.text));
  return wordCount(parts.join(" "));
}

/** « N min », N = mots / 230 arrondi au pair comme `round` de Python, minimum 1. */
export function readingTime(article: Article): string {
  return `${Math.max(1, pyRound(articleWordCount(article) / 230))} min`;
}

const TLDR_BLOCK_RE = pyRe('<div class="tldr-box">.*?</div>', "s");

/** Mot-clé dans les 50 premiers mots de l'introduction, TL;DR exclue. */
export function checkKeywordIntro(article: Article, keyword: string): string[] {
  const intro = sub(TLDR_BLOCK_RE, " ", asStr(article.introduction));
  const first = pySplit(stripTags(intro)).slice(0, KEYWORD_INTRO_WORDS).join(" ");
  if (keyword && !keywordPresent(keyword, first)) {
    return [`Introduction : mot-clé « ${keyword} » absent des ${KEYWORD_INTRO_WORDS} premiers mots (hors TL;DR)`];
  }
  return [];
}

/** [erreurs, avertissements] : au-delà de 60 / 155 caractères, simple avertissement (troncature). */
export function checkSeoMeta(article: Article, keyword: string): [string[], string[]] {
  const errors: string[] = [];
  const warnings: string[] = [];
  const title = pyStrip(stripTags(asStr(article.yoast_title)));
  const desc = pyStrip(stripTags(asStr(article.yoast_description)));
  if (!title) errors.push("yoast_title vide");
  else if (cpLen(title) > SEO_TITLE_MAX) warnings.push(`yoast_title : ${cpLen(title)} caractères (affichage tronqué au-delà de ~${SEO_TITLE_MAX})`);
  if (keyword && title && !keywordPresent(keyword, title)) errors.push(`yoast_title : mot-clé « ${keyword} » absent — « ${title} »`);
  if (!desc) errors.push("yoast_description vide");
  else if (cpLen(desc) > SEO_DESC_MAX) warnings.push(`yoast_description : ${cpLen(desc)} caractères (affichage tronqué au-delà de ~${SEO_DESC_MAX})`);
  return [errors, warnings];
}

/** Contenu trop mince (< 300 mots) : erreur. Écart > 30 % à la cible du Sheet : avertissement. */
export function checkLength(article: Article, wordcount?: number | null): [string[], string[]] {
  const n = articleWordCount(article);
  const errors: string[] = [];
  const warnings: string[] = [];
  if (n < ARTICLE_MIN_WORDS) errors.push(`Longueur : ${n} mots (minimum ${ARTICLE_MIN_WORDS})`);
  if (wordcount && Math.abs(n - wordcount) > WORDCOUNT_TOLERANCE * wordcount) {
    warnings.push(`Longueur : ${n} mots pour une cible de ${wordcount} (écart > ${Math.trunc(WORDCOUNT_TOLERANCE * 100)} %)`);
  }
  return [errors, warnings];
}

function articleSlug(u: string): string | null {
  const path = stripChars(urlSplit(u).path, "/", "right");
  if (!path.includes("/actualite/") || path.includes("/actualite/categorie/")) return null;
  const segs = path.split("/");
  return segs[segs.length - 1];
}

/** Articles publiés qui partagent au moins un mot porteur avec le mot-clé (12 au plus). */
export function relatedArticles(keyword: string, sitemapUrls: readonly string[] = [], limit = 12): string[] {
  const kw = topicTokens(keyword);
  const scored: Array<[number, string]> = [];
  for (const u of sitemapUrls) {
    const slug = articleSlug(u);
    if (slug === null) continue;
    const t = topicTokens(slug);
    const common = Array.from(kw).filter((w) => t.has(w)).length;
    if (common) scored.push([-common, u]);
  }
  scored.sort((a, b) => a[0] - b[0] || (a[1] < b[1] ? -1 : a[1] > b[1] ? 1 : 0));
  return scored.slice(0, limit).map(([, u]) => u);
}

/** Au moins 2 mots porteurs communs, couvrant au moins 2/3 du plus court des deux. */
function overlaps(kw: Set<string>, other: Set<string>): boolean {
  const common = Array.from(kw).filter((w) => other.has(w)).length;
  return common >= 2 && common >= (2 / 3) * Math.min(kw.size, other.size);
}

export type SheetRow = { keyword?: string; status?: string; slug?: string; id?: string | number };

/** Articles publiés (slug du sitemap) ou autres lignes du Sheet qui visent déjà ce mot-clé. */
export function cannibalizationConflicts(keyword: string, siteUrls: readonly string[] = [], otherRows: readonly SheetRow[] = []): string[] {
  const kw = topicTokens(keyword);
  if (kw.size < 2) return [];
  const conflicts: string[] = [];
  for (const u of siteUrls) {
    const slug = articleSlug(u);
    if (slug === null) continue;
    if (overlaps(kw, topicTokens(slug))) conflicts.push(`Cannibalisation : « ${keyword} » recoupe l'article publié ${u}`);
  }
  for (const r of otherRows) {
    if (overlaps(kw, topicTokens(r.keyword ?? ""))) {
      conflicts.push(
        `Cannibalisation : « ${keyword} » recoupe la ligne ${r.id ?? "?"} du Sheet ` + `(« ${r.keyword ?? ""} », ${r.status ?? ""}, ${r.slug ?? ""})`,
      );
    }
  }
  return conflicts;
}
