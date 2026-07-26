/**
 * Helpers pour transformer du HTML WP en texte brut affichable.
 *
 * Le contenu ACF est stocké en HTML (avec entities `&rsquo;`, `&amp;`, …).
 * Quand on l'affiche en TEXT (extrait sur les cartes, résultats de recherche,
 * metadata SEO), il faut décoder ces entities — sinon on voit littéralement
 * "d&rsquo;études" au lieu de "d'études".
 */

// Entities nommées les plus courantes en contenu WP / WordPress
const NAMED_ENTITIES: Record<string, string> = {
  "&amp;":    "&",
  "&lt;":     "<",
  "&gt;":     ">",
  "&quot;":   '"',
  "&apos;":   "'",
  "&nbsp;":   " ",
  "&rsquo;":  "’",
  "&lsquo;":  "‘",
  "&rdquo;":  "”",
  "&ldquo;":  "“",
  "&hellip;": "…",
  "&ndash;":  "–",
  "&mdash;":  "—",
  "&laquo;":  "«",
  "&raquo;":  "»",
  "&copy;":   "©",
  "&reg;":    "®",
  "&trade;":  "™",
  "&eacute;": "é",
  "&egrave;": "è",
  "&agrave;": "à",
  "&ccedil;": "ç",
  "&ocirc;":  "ô",
  "&ucirc;":  "û",
  "&icirc;":  "î",
  "&euro;":   "€",
};

/** Décode les entities HTML nommées + numériques décimales (&#39;) et hex (&#x27;). */
export function decodeEntities(input: string): string {
  if (!input) return "";
  return input
    .replace(/&[a-zA-Z]+;/g, (m) => NAMED_ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g,    (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([\da-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Retire les balises HTML et normalise les espaces. */
export function stripHtml(html: string): string {
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

/** Convertit du HTML en texte brut prêt à afficher : strip + decode entities. */
export function htmlToText(html: string): string {
  return decodeEntities(stripHtml(html));
}
