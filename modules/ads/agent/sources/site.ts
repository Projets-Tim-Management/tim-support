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

/** Pages légales : jamais lues, elles n'apprennent rien au stratège (décision du 30/09/2026). */
const LEGAL = /mentions|cookie|cgv|cgu|conditions-generales|confidentialit|privacy|politique-de-donnees|legal|rgpd/i;

/**
 * Les pages de fonctionnalités, par sujet, dans l'ordre de priorité ; pour
 * chaque sujet, le motif le plus précis d'abord (la page de la fonctionnalité
 * avant une page métier qui en parle).
 */
const PRODUCT_TOPICS: RegExp[][] = [
  [/^\/pointage-digital/, /pointage/],
  [/^\/feuilles?-d-?heures/, /feuilles?-d-?heures/],
  [/^\/plannings?-ouvriers?/, /planning/],
  [/^\/suivi-chantier$/, /suivi/],
];
const PRICING = /offres|tarif|prix|pricing/i;
const CALCULATOR = /calcul/i;

const pathOf = (url: string) => new URL(url).pathname.replace(/\/$/, "") || "/";

/**
 * Les pages à lire, dans l'ordre (décision du 30/09/2026) : l'accueil ; une page
 * par fonctionnalité (pointage, feuilles d'heures, plannings, suivi de chantier) ;
 * les offres ; les autres pages de fonctionnalités ; les calculateurs ; le reste.
 * Jamais une page légale. Pure — c'est elle qu'on teste, et l'aperçu montre son
 * résultat tel quel.
 */
export function planSitePages(listed: string[], max = MAX_PAGES): string[] {
  const home = `${SITE_ORIGIN}/`;
  const urls = [...new Set(listed.filter((u) => isSiteUrl(u) && !LEGAL.test(pathOf(u)) && pathOf(u) !== "/"))];
  const taken = new Set<string>();
  const take = (u: string | undefined) => u && taken.add(u);
  for (const topic of PRODUCT_TOPICS) {
    for (const re of topic) {
      const hit = urls.find((u) => !taken.has(u) && !CALCULATOR.test(pathOf(u)) && re.test(pathOf(u)));
      if (hit) {
        take(hit);
        break;
      }
    }
  }
  const product = (u: string) => !CALCULATOR.test(pathOf(u)) && PRODUCT_TOPICS.some((t) => t.some((re) => re.test(pathOf(u))));
  const rest = (test: (u: string) => boolean) => urls.filter((u) => !taken.has(u) && test(u));
  const ordered = [home, ...taken, ...rest((u) => PRICING.test(pathOf(u))), ...rest(product), ...rest((u) => CALCULATOR.test(pathOf(u)))];
  const withRest = [...ordered, ...urls.filter((u) => !ordered.includes(u))];
  return [...new Set(withRest)].slice(0, max);
}

/**
 * Un lecteur du site sûr : chaque lecture est bornée dans le temps, et une
 * redirection n'est suivie que si elle reste sur le domaine (relecture du
 * 01/10/2026, F5 : `redirect: "follow"` aurait lu n'importe quel site vers
 * lequel une page redirige).
 */
export function siteFetcher(f: typeof fetch, timeoutMs: number): Fetcher {
  return async (start) => {
    let url = start;
    for (let hop = 0; hop < 3; hop++) {
      const res = await f(url, { redirect: "manual", signal: AbortSignal.timeout(timeoutMs), headers: { "user-agent": "TIM-support (agent de campagne)" } });
      if (res.status < 300 || res.status >= 400) return res;
      const location = res.headers.get("location");
      const next = location ? new URL(location, url).toString() : null;
      if (!next || !isSiteUrl(next)) break;
      url = next;
    }
    return { ok: false, status: 310, text: async () => "" };
  };
}

/** Les pages que la lecture du site prendra par défaut : le plan du site, ordonné. */
export async function plannedSitePages(fetcher: Fetcher): Promise<string[]> {
  const map = await fetcher(`${SITE_ORIGIN}/sitemap.xml`).catch(() => null);
  return planSitePages(map?.ok ? sitemapUrls(await map.text()) : []);
}

/**
 * Lit des pages du site. Sans adresse demandée : celles de `planSitePages`. Une
 * adresse hors du domaine, ou une page légale, est refusée ; une page en erreur
 * est sautée (et dite).
 */
export async function readSite(fetcher: Fetcher, urls?: string[]): Promise<{ pages: SitePage[]; refused: string[]; failed: string[] }> {
  const allowed = (u: string) => isSiteUrl(u) && !LEGAL.test(pathOf(u));
  const refused = (urls ?? []).filter((u) => !allowed(u));
  let wanted = (urls ?? []).filter(allowed);
  if (!wanted.length) wanted = await plannedSitePages(fetcher);
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
