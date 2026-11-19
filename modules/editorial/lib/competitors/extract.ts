import { htmlToText } from "@/core/lib/html";

/**
 * LE TEXTE PRINCIPAL D'UNE PAGE CONCURRENTE (étape 4, 19/11/2026) : sans menus, pied
 * de page, barres latérales, formulaires ni scripts. On prend le plus grand
 * <article>, sinon <main>, sinon le corps. Les titres H2 / H3 sont gardés à part.
 * Jamais réutilisé tel quel dans un article : il sert à compter des termes et
 * (étape 5) à mesurer la ressemblance.
 *
 * Pur (testé).
 */

export const MAX_TEXT = 40_000;

/**
 * Une page OUTIL (calculateur, convertisseur, simulateur, générateur) et non un article : elle
 * ne se compare pas à un texte (19/11/2026). Le mot « outil » seul ne suffit pas (« les
 * meilleurs outils de pointage » est un article). Pure (testée).
 */
export function isToolPage(url: string, title: string): boolean {
  const t = `${title} ${decodeURIComponent(url).replace(/[-_/]/g, " ")}`.toLowerCase();
  return /\b(convertisseur|converter|convertir en ligne|calculateur|calculatrice|calculator|simulateur|simulator|g[ée]n[ée]rateur|generator)\b/.test(t);
}

/** Les pages exclues du corpus, avec leur motif (null = gardée). Pure. */
export function excludeReason(url: string): string | null {
  let host = "";
  let path = "";
  try {
    const u = new URL(url);
    host = u.hostname.replace(/^www\./, "");
    path = u.pathname.toLowerCase();
  } catch {
    return "adresse illisible";
  }
  if (/(^|\.)tim-management\.co$/.test(host)) return "notre site";
  if (/^(play\.google\.com|apps\.apple\.com|chrome\.google\.com|microsoft\.com)$/.test(host) && /\/(store|apps|app|detail|webstore)/.test(path)) return "application (magasin d'applications)";
  if (/\.pdf$/.test(path)) return "PDF";
  if (/(^|\.)(youtube\.com|youtu\.be|dailymotion\.com|vimeo\.com|tiktok\.com)$/.test(host)) return "vidéo";
  if (/(^|\.)(facebook\.com|linkedin\.com|instagram\.com|x\.com|twitter\.com|pinterest\.[a-z]+)$/.test(host)) return "réseau social";
  if (/(^|\.)(reddit\.com|quora\.com)$/.test(host) || /forum/.test(host) || /\/forum|\/forums\//.test(path)) return "forum";
  if (path === "/" || path === "") return "page d'accueil";
  return null;
}

const inner = (html: string, tag: string) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "gi"))].map((m) => m[1]);
const clean = (s: string) => htmlToText(s).replace(/\s+/g, " ").trim();

export type ExtractedPage = { title: string; text: string; h2s: string[]; h3s: string[] };

export function extractMain(html: string): ExtractedPage {
  const title = clean(inner(html, "title")[0] ?? "");
  const body = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe|form|nav|header|footer|aside|button|select)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<(div|section|ul)\b[^>]*(?:class|id)="[^"]*\b(?:cookie|breadcrumb|share|social|newsletter|related|comment|sidebar|menu|toc|sommaire|table-of-contents|ez-toc|lwptoc|rank-math-toc|author|bio)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, " ");
  const articles = inner(body, "article").sort((a, b) => b.length - a.length);
  const main = articles[0] && clean(articles[0]).length > 800 ? articles[0] : (inner(body, "main")[0] ?? inner(body, "body")[0] ?? body);
  const text = clean(main.replace(/<\/(p|h[1-6]|li|td|th|div|tr|br)>/gi, "$&\n")).slice(0, MAX_TEXT);
  const heads = (t: string) => inner(main, t).map(clean).filter((s) => s.length >= 3 && s.length <= 200);
  return { title, text, h2s: heads("h2").slice(0, 20), h3s: heads("h3").slice(0, 30) };
}
