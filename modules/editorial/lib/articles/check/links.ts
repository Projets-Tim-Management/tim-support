/**
 * Liens : sortants, internes (sitemap, maillage), concurrents (validation.py, l. 884-955, 1063-1106).
 */
import { ALLOWED_OUTBOUND_DOMAINS, COMPETITOR_NAMES, INTERNAL_LINKS_MIN, INTERNAL_LINKS_WARN, MEDIA_UPLOADS_PATH, SITE_DOMAIN } from "./constants";
import { isSiteHost } from "./facts";
import { articleTexts, asStr, hostIn, isHomepageUrl, norm, normUrl, stripTags } from "./normalize";
import { findall, findallGroups, pyRe, pyStrip, stripChars, urlSplit } from "./py";
import type { Article, Fait } from "./types";

const COMPETITOR_KEYS = COMPETITOR_NAMES.map((n) => norm(n).replace(/[^a-z0-9]/g, "")).filter((k) => k.length >= 4);

/** Site d'un concurrent : un label du domaine (TLD exclu) commence par son nom (« combohr.com »). */
export function isCompetitorUrl(url: string | null | undefined): boolean {
  const labels = (urlSplit(pyStrip(url ?? "")).hostname ?? "").toLowerCase().split(".");
  return labels.slice(0, -1).some((label) => COMPETITOR_KEYS.some((k) => label.startsWith(k)));
}

const HREF_TAG_RE = pyRe(String.raw`<a\b[^>]*href\s*=\s*["']([^"']+)["']`, "i");

/** Aucun lien vers le site d'un concurrent (règle du 03/11/2026) ; le nommer reste permis. */
export function checkCompetitorLinks(article: Article, includeSources = false): string[] {
  const errors: string[] = [];
  for (const [where, html] of articleTexts(article, false)) {
    for (const href of findall(HREF_TAG_RE, html)) if (isCompetitorUrl(href)) errors.push(`[${where}] Lien vers le site d'un concurrent interdit : ${href}`);
  }
  if (includeSources) {
    for (const s of article.sources ?? []) {
      if (isCompetitorUrl(s.url ?? "")) errors.push(`[sources] Source sur le site d'un concurrent interdite : ${s.url}`);
    }
  }
  return errors;
}

/** Liens sortants : domaines officiels ou URL de faits_sources. Liens internes : sitemap. Retourne [erreurs, avertissements]. */
export function checkLinks(article: Article, faits: Fait[], sitemapUrls?: readonly string[] | null): [string[], string[]] {
  const errors: string[] = [];
  const warnings: string[] = [];
  const factUrls = new Set(faits.filter((f) => f.url).map((f) => normUrl(f.url)));
  const sitemap = new Set((sitemapUrls ?? []).map(normUrl));
  const parts: Array<[string, string]> = [
    ["introduction", asStr(article.introduction)],
    ["conclusion", asStr(article.conclusion)],
  ];
  (article.contenu ?? []).forEach((b, i) => parts.push([`bloc ${i + 1}`, asStr(b?.texte)]));
  (article.faq ?? []).forEach((q, i) => parts.push([`FAQ ${i + 1}`, asStr(q?.text)]));
  let internal = 0;
  for (const [where, html] of parts) {
    for (let href of findall(HREF_TAG_RE, html)) {
      if (href.startsWith("/")) href = `https://${SITE_DOMAIN}${href}`;
      const u = urlSplit(href);
      const host = (u.hostname ?? "").toLowerCase();
      if (hostIn(href, [SITE_DOMAIN]) && u.path.startsWith(MEDIA_UPLOADS_PATH)) continue; // fichier de la médiathèque
      // Correction décidée le 18/11/2026 : interne = hôte tim-management.co ou sous-domaine
      // (Python : host.endswith("tim-management.co"), qui acceptait faux-tim-management.co).
      if (isSiteHost(host)) {
        internal += 1;
        if (sitemap.size && !sitemap.has(normUrl(href))) errors.push(`[${where}] Lien interne absent du sitemap : ${href}`);
      } else if (href.startsWith("http")) {
        if (isHomepageUrl(href)) {
          errors.push(`[${where}] Lien sortant vers une page d'accueil (URL précise attendue) : ${href}`);
          continue;
        }
        if (factUrls.has(normUrl(href))) continue;
        if (!ALLOWED_OUTBOUND_DOMAINS.some((d) => host === d || host.endsWith("." + d))) errors.push(`[${where}] Lien sortant hors domaines autorisés : ${href}`);
      }
    }
  }
  if (internal > INTERNAL_LINKS_WARN) warnings.push(`${internal} liens internes (max recommandé : ${INTERNAL_LINKS_WARN})`);
  return [errors, warnings];
}

const WEAK_ANCHORS = new Set([
  "ici", "cliquez ici", "cliquez", "en savoir plus", "lire la suite", "cet article", "ce lien",
  "lien", "voir", "voir plus", "plus d'infos", "plus d'informations",
]);
/** Pages internes qui ne sont pas des pages produit ou outil (préfixe de chaîne). */
const NON_PRODUCT_PREFIXES = ["/actualite", "/contact", "/fiche-metier", "/centre-aide", "/video", "/faq", "/plan-du-site", "/auteur", "/author", "/comparatif"];

const LINK_WITH_TEXT_RE = pyRe(String.raw`<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>(.*?)</a>`, "is");

/** [emplacement, href, texte d'ancre] des liens vers tim-management.co (hors médiathèque). */
export function internalLinks(article: Article): Array<[string, string, string]> {
  const out: Array<[string, string, string]> = [];
  for (const [where, html] of articleTexts(article, false)) {
    for (const [rawHref, inner] of findallGroups(LINK_WITH_TEXT_RE, html)) {
      const href = rawHref.startsWith("/") ? `https://${SITE_DOMAIN}${rawHref}` : rawHref;
      const u = urlSplit(href);
      // Correction décidée le 18/11/2026 : hôte tim-management.co ou sous-domaine (Python : endswith).
      if (!isSiteHost(u.hostname)) continue;
      if (u.path.startsWith(MEDIA_UPLOADS_PATH)) continue;
      out.push([where, href, pyStrip(stripTags(inner))]);
    }
  }
  return out;
}

/** Au moins 3 liens internes, dont une page produit ou outil, ancres descriptives, liens imposés présents. */
export function checkInternalLinking(article: Article, requiredUrls: readonly string[] = []): string[] {
  const links = internalLinks(article);
  const errors: string[] = [];
  if (links.length < INTERNAL_LINKS_MIN) errors.push(`${links.length} lien(s) interne(s) (minimum ${INTERNAL_LINKS_MIN})`);
  const paths = links.map(([, h]) => stripChars(urlSplit(h).path, "/", "right") || "/");
  if (links.length && !paths.some((p) => p !== "/" && !NON_PRODUCT_PREFIXES.some((x) => p.startsWith(x)))) {
    errors.push("Aucun lien interne vers une page produit ou un outil de tim-management.co");
  }
  for (const [where, href, anchor] of links) {
    if (WEAK_ANCHORS.has(stripChars(norm(anchor), " .:"))) errors.push(`[${where}] Ancre non descriptive « ${anchor} » (${href})`);
  }
  const present = new Set(links.map(([, h]) => normUrl(h)));
  for (const u of requiredUrls) {
    if (!present.has(normUrl(u))) errors.push(`Lien interne obligatoire absent (page pilier ou maillage du Sheet) : ${u}`);
  }
  return errors;
}

const SITE_PATH_RE = pyRe(String.raw`(?:https?://(?:www\.)?tim-management\.co)?(/[A-Za-z0-9/_-]+)`);

/** Chemins ou URL de tim-management.co cités dans une cellule, gardés seulement s'ils sont dans le sitemap. */
export function resolveSiteUrls(text: string | null | undefined, sitemapUrls: readonly string[] = []): string[] {
  const byPath = new Map<string, string>();
  for (const u of sitemapUrls) byPath.set(stripChars(urlSplit(u).path, "/", "right").toLowerCase(), u);
  const out: string[] = [];
  for (const path of findall(SITE_PATH_RE, text ?? "")) {
    const u = byPath.get(stripChars(path, "/", "right").toLowerCase());
    if (u && !out.includes(u)) out.push(u);
  }
  return out;
}
