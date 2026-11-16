import type { Payload } from "payload";

import { parisNow, periodKey } from "@/modules/ads/agent/followup";

/**
 * LA VEILLE DES PLANS DE SITE des concurrents (équipe SEO/GEO, étape 3) —
 * sans IA : chaque semaine, le code lit le plan de site (sitemap) de chaque
 * concurrent suivi pour le SEO, garde la liste des pages, et la compare à la
 * précédente : ce qu'ils ont AJOUTÉ (nouveaux thèmes, nouvelles pages), ce
 * qu'ils ont RETIRÉ. Guy (l'agent Concurrence) en tire ensuite son rapport.
 *
 * Poli : un robot nommé, 15 s par fichier, 25 fichiers et 10 000 pages par site
 * au plus ; un site qui refuse est noté « illisible », sans insister.
 *
 * Le dimanche à partir de 18 h (Paris), avant les veilles ; tant que le cron
 * passe, il continue où il en était (une minute de travail par passage).
 */

const UA = "Mozilla/5.0 (compatible; TIM-Support-Veille/1.0; +https://tim-management.co)";
const TIMEOUT_MS = 15_000;
const MAX_FILES = 25;
const MAX_URLS = 10_000;
const MAX_BYTES = 8_000_000;
const CRAWL_WEEKDAY = 7;
const CRAWL_HOUR = 18;
/** Le temps de travail d'un passage du cron (il en reste pour le reste). */
const BUDGET_MS = 60_000;

export type MapUrl = { loc: string; lastmod: string | null };

const decode = (s: string) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'").trim();

/** Un fichier de plan de site : un index (d'autres plans) ou une liste de pages. Pur (testé). */
export function parseSitemap(xml: string): { kind: "index" | "urlset" | "inconnu"; locs: MapUrl[] } {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const isSet = /<urlset[\s>]/i.test(xml);
  const blocks = xml.match(isIndex ? /<sitemap[\s>][\s\S]*?<\/sitemap>/gi : /<url[\s>][\s\S]*?<\/url>/gi) ?? [];
  const locs = blocks.flatMap((b) => {
    const loc = b.match(/<loc>\s*(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?\s*<\/loc>/i)?.[1];
    const lastmod = b.match(/<lastmod>\s*([^<]+)<\/lastmod>/i)?.[1] ?? null;
    return loc ? [{ loc: decode(loc), lastmod: lastmod ? lastmod.trim().slice(0, 10) : null }] : [];
  });
  return { kind: isIndex ? "index" : isSet ? "urlset" : "inconnu", locs };
}

/** Les plans annoncés dans un robots.txt. Pur. */
export const sitemapsInRobots = (robots: string): string[] => [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);

/**
 * Plan B, pour un site sans plan : les liens internes d'une page (menu, pied
 * de page, rubriques), sans ancres ni fichiers. Pur (testé).
 */
export function internalLinks(html: string, origin: string, max = 300): MapUrl[] {
  const out = new Map<string, MapUrl>();
  for (const m of html.matchAll(/<a\s[^>]*href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(decode(m[1]), origin);
      if (u.origin !== origin || /\.(pdf|jpe?g|png|gif|webp|svg|zip|mp4)$/i.test(u.pathname)) continue;
      u.search = "";
      const loc = u.toString();
      if (!out.has(loc)) out.set(loc, { loc, lastmod: null });
      if (out.size >= max) break;
    } catch {
      continue;
    }
  }
  return [...out.values()];
}

/** Ajoutées / retirées entre deux photos (par adresse). Pur (testé). */
export function diffMaps(previous: MapUrl[] | null, current: MapUrl[]): { added: MapUrl[]; removed: MapUrl[] } {
  if (!previous) return { added: [], removed: [] };
  const before = new Set(previous.map((u) => u.loc));
  const now = new Set(current.map((u) => u.loc));
  return { added: current.filter((u) => !before.has(u.loc)), removed: previous.filter((u) => !now.has(u.loc)) };
}

/** La rubrique d'une page : son premier dossier (« /blog/… » → « blog »), « (accueil) » sinon. Pur. */
export const sectionOf = (loc: string): string => {
  try {
    const seg = new URL(loc).pathname.split("/").filter(Boolean);
    // Une langue en tête (« /fr/… ») ne fait pas une rubrique.
    const first = /^[a-z]{2}(-[a-z]{2})?$/i.test(seg[0] ?? "") ? seg[1] : seg[0];
    return first ? decodeURIComponent(first).toLowerCase() : "(accueil)";
  } catch {
    return "(autre)";
  }
};

/** Le nombre de pages par rubrique, les plus grosses d'abord. Pur. */
export const sections = (urls: MapUrl[], max = 12): { section: string; pages: number }[] => {
  const n = new Map<string, number>();
  for (const u of urls) n.set(sectionOf(u.loc), (n.get(sectionOf(u.loc)) ?? 0) + 1);
  return [...n].map(([section, pages]) => ({ section, pages })).sort((a, b) => b.pages - a.pages).slice(0, max);
};

async function get(url: string, fetcher: typeof fetch): Promise<string | null> {
  const res = await fetcher(url, { redirect: "follow", headers: { "user-agent": UA, accept: "application/xml,text/xml,text/plain,*/*" }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  if (!res.ok) return null;
  const text = await res.text();
  return text.length > MAX_BYTES ? text.slice(0, MAX_BYTES) : text;
}

/** Toutes les pages du plan d'un site (index suivis, plafonnés). Lève si rien n'est lisible. */
export async function crawlSite(origin: string, fetcher: typeof fetch = fetch): Promise<MapUrl[]> {
  const robots = await get(`${origin}/robots.txt`, fetcher).catch(() => null);
  // Les plans annoncés par le robots.txt ; à défaut seulement, les adresses habituelles.
  const listed = robots ? sitemapsInRobots(robots) : [];
  const queue = listed.length ? [...new Set(listed)] : [`${origin}/sitemap.xml`, `${origin}/sitemap_index.xml`, `${origin}/wp-sitemap.xml`];
  const seen = new Set<string>();
  const urls = new Map<string, MapUrl>();
  let read = 0;
  while (queue.length && read < MAX_FILES && urls.size < MAX_URLS) {
    const file = queue.shift()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const xml = await get(file, fetcher).catch(() => null);
    if (!xml) continue;
    read += 1;
    const parsed = parseSitemap(xml);
    if (parsed.kind === "index") queue.push(...parsed.locs.map((l) => l.loc).filter((l) => !seen.has(l)));
    else for (const u of parsed.locs) if (urls.size < MAX_URLS) urls.set(u.loc, u);
    // Une adresse devinée qui répond suffit : on n'essaie pas les suivantes.
    if (!listed.length && parsed.kind !== "inconnu") queue.splice(0, queue.length, ...queue.filter((q) => parsed.locs.some((l) => l.loc === q)));
  }
  if (urls.size) return [...urls.values()];
  // Pas de plan : les liens de la page d'accueil (ce que le site met en avant).
  const home = await get(`${origin}/`, fetcher).catch(() => null);
  const links = home ? internalLinks(home, origin) : [];
  if (!links.length) throw new Error(read ? "plan de site vide" : "aucun plan de site lisible (robots.txt, /sitemap.xml), et page d'accueil sans liens lisibles");
  return links;
}

/** Les concurrents suivis pour le SEO, avec un site. */
export const seoCompetitors = (payload: Payload) =>
  payload
    .find({ collection: "ad-competitors", where: { and: [{ status: { equals: "suivi" } }, { website: { exists: true } }, { usages: { contains: "seo" } }] }, pagination: false, depth: 0, overrideAccess: true, select: { name: true, website: true, kind: true } as never })
    .then((r) => (r.docs as unknown as { id: number | string; name: string; website?: string | null; kind?: string | null }[]).filter((c) => c.website));

export type CrawlResult = { status: "pas-encore" | "fait" | "en-partie"; read: number; left: number };

/**
 * Le rythme : le dimanche dès 18 h (Paris), ou tout de suite avec `force`.
 * Lit les concurrents pas encore photographiés cette semaine, tant que le temps
 * du passage le permet.
 */
export async function runCompetitorCrawl(payload: Payload, opts: { now?: Date; force?: boolean; fetcher?: typeof fetch } = {}): Promise<CrawlResult> {
  const now = opts.now ?? new Date();
  const p = parisNow(now);
  if (!opts.force && (p.weekday !== CRAWL_WEEKDAY || p.hour < CRAWL_HOUR)) return { status: "pas-encore", read: 0, left: 0 };
  // Le dimanche appartient à la semaine qui s'ouvre le lendemain : la photo sert à la revue du lundi.
  const week = periodKey("hebdomadaire", parisNow(new Date(now.getTime() + (p.weekday === 7 ? 86_400_000 : 0))));
  const competitors = await seoCompetitors(payload);
  const done = await payload.find({ collection: "ai-team-competitor-maps", where: { week: { equals: week } }, pagination: false, depth: 0, overrideAccess: true, select: { competitor: true } as never });
  const doneIds = new Set((done.docs as unknown as { competitor: number | string }[]).map((d) => String(d.competitor)));
  const todo = competitors.filter((c) => !doneIds.has(String(c.id)));
  const start = Date.now();
  let read = 0;
  for (const c of todo) {
    if (Date.now() - start > BUDGET_MS) break;
    const prev = await payload.find({ collection: "ai-team-competitor-maps", where: { and: [{ competitor: { equals: c.id } }, { status: { equals: "lu" } }] }, sort: "-createdAt", limit: 1, depth: 0, overrideAccess: true, select: { urls: true } as never });
    const previous = (prev.docs[0] as unknown as { urls?: MapUrl[] } | undefined)?.urls ?? null;
    try {
      const urls = await crawlSite(String(c.website), opts.fetcher);
      const { added, removed } = diffMaps(previous, urls);
      // Première photo : ajouts et retraits inconnus (null), pas « aucun ».
      await payload.create({ collection: "ai-team-competitor-maps", data: { competitor: c.id, week, status: "lu", count: urls.length, urls, added: previous ? added : null, removed: previous ? removed : null } as never, overrideAccess: true });
    } catch (e) {
      await payload.create({ collection: "ai-team-competitor-maps", data: { competitor: c.id, week, status: "illisible", error: e instanceof Error ? e.message : String(e) } as never, overrideAccess: true });
    }
    read += 1;
  }
  return { status: read === todo.length ? "fait" : "en-partie", read, left: todo.length - read };
}
