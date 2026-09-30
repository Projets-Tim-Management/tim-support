/**
 * Les pages de tim-management.co, lues pour le stratège (plan Publicité,
 * §9 quater, point 2). Liste blanche en code : seul ce domaine est lisible —
 * ce n'est pas un navigateur, et un modèle ne peut pas l'envoyer ailleurs.
 */

export const SITE_ORIGIN = "https://tim-management.co";
const SITE_HOSTS = new Set(["tim-management.co", "www.tim-management.co"]);

/** Pages lues au plus par appel, et caractères gardés par page : la lecture reste bornée, donc son coût aussi. */
export const MAX_PAGES = 6;
export const MAX_CHARS_PER_PAGE = 6_000;

export function isSiteUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === "https:" && SITE_HOSTS.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", laquo: "«", raquo: "»", eacute: "é", egrave: "è", agrave: "à", ccedil: "ç" };

const decode = (s: string) => s.replace(/&(#\d+|[a-z]+);/gi, (m, e: string) => (e.startsWith("#") ? String.fromCodePoint(Number(e.slice(1))) : (ENTITIES[e.toLowerCase()] ?? m)));

/** Le texte lisible d'une page : sans scripts, styles, menus ni pied de page ; titres et paragraphes sur leur ligne. */
export function htmlToText(html: string): { title: string; text: string } {
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1]?.trim() ?? "";
  const text = decode(
    html
      .replace(/<(head|script|style|noscript|svg|nav|footer|header|form)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(br|\/p|\/h[1-6]|\/li|\/div|\/section)[^>]*>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
  return { title: decode(title), text };
}

/** Les adresses du plan du site (sitemap.xml), filtrées sur le domaine. */
export function sitemapUrls(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]).filter(isSiteUrl);
}

export type SitePage = { url: string; title: string; text: string };
export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; text: () => Promise<string> }>;

/**
 * Lit des pages du site. Sans adresse demandée : l'accueil puis le plan du
 * site, dans cet ordre. Une adresse hors du domaine est refusée, une page en
 * erreur est sautée (et dite).
 */
export async function readSite(fetcher: Fetcher, urls?: string[]): Promise<{ pages: SitePage[]; refused: string[]; failed: string[] }> {
  const refused = (urls ?? []).filter((u) => !isSiteUrl(u));
  let wanted = (urls ?? []).filter(isSiteUrl);
  if (!wanted.length) {
    const map = await fetcher(`${SITE_ORIGIN}/sitemap.xml`).catch(() => null);
    const listed = map?.ok ? sitemapUrls(await map.text()) : [];
    wanted = [`${SITE_ORIGIN}/`, ...listed.filter((u) => u.replace(/\/$/, "") !== SITE_ORIGIN)];
  }
  const pages: SitePage[] = [];
  const failed: string[] = [];
  for (const url of [...new Set(wanted)].slice(0, MAX_PAGES)) {
    const res = await fetcher(url).catch(() => null);
    if (!res?.ok) {
      failed.push(url);
      continue;
    }
    const { title, text } = htmlToText(await res.text());
    pages.push({ url, title, text: text.slice(0, MAX_CHARS_PER_PAGE) });
  }
  return { pages, refused, failed };
}
