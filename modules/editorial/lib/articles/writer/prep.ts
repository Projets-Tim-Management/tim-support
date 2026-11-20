import { decodeEntities, htmlToText } from "@/core/lib/html";

/**
 * LA PRÉPARATION D'UN ARTICLE (étape 5) — ce que le rédacteur reçoit en plus
 * des faits, repris du pipeline Python (scraper.py) :
 *  - le plan du site de TIM Management (sitemap) : pour le maillage interne ;
 *  - la STRUCTURE des pages concurrentes (H2, H3, questions) : jamais leurs
 *    chiffres, qui ne vont jamais au rédacteur ;
 *  - pour un article de vente, le texte de la page /offres (les seuls prix permis).
 *
 * Les fonctions d'analyse sont pures (testées) ; la lecture réseau passe par
 * `fetchPage` (en-têtes de navigateur : certains sites coupent les autres).
 */

export const SITE = "https://tim-management.co";
const MAX_URLS = 500;
const EXCLUDED = /\/wp-|\/feed|\/tag\/|\/page\//;

const BROWSER_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "Accept-Language": "fr-FR,fr;q=0.9",
};

export async function fetchPage(url: string, fetcher: typeof fetch = fetch, timeoutMs = 15_000): Promise<string | null> {
  try {
    const res = await fetcher(url, { headers: BROWSER_HEADERS, redirect: "follow", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

/** Les adresses d'un sitemap XML, et les sous-sitemaps d'un index. Pure (testée). */
export function parseSitemap(xml: string): { urls: string[]; children: string[] } {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decodeEntities(m[1]));
  const isIndex = /<sitemapindex\b/i.test(xml);
  return isIndex ? { urls: [], children: locs } : { urls: locs.filter((u) => !EXCLUDED.test(u)), children: [] };
}

/** Le plan du site (index récursif, 500 adresses au plus). Vide en cas d'erreur : jamais bloquant. */
export async function loadSitemap(fetcher: typeof fetch = fetch): Promise<string[]> {
  const out: string[] = [];
  const queue = [`${SITE}/sitemap.xml`];
  const seen = new Set<string>();
  while (queue.length && out.length < MAX_URLS && seen.size < 30) {
    const url = queue.shift() as string;
    if (seen.has(url)) continue;
    seen.add(url);
    const xml = await fetchPage(url, fetcher, 10_000);
    if (!xml) continue;
    const { urls, children } = parseSitemap(xml);
    out.push(...urls);
    queue.push(...children);
  }
  return [...new Set(out)].slice(0, MAX_URLS);
}

export type Outline = { url: string; h2s: string[]; h3s: string[]; questions: string[] };

const clean = (s: string) => htmlToText(s).replace(/\s+/g, " ").trim();

/** La structure d'une page concurrente : H2, H3 et questions (FAQ). Jamais ses chiffres. Pure (testée). */
export function extractOutline(url: string, html: string): Outline {
  const body = html.replace(/<(script|style|nav|footer|header)\b[\s\S]*?<\/\1>/gi, " ");
  const tag = (t: string) => [...body.matchAll(new RegExp(`<${t}\\b[^>]*>([\\s\\S]*?)</${t}>`, "gi"))].map((m) => clean(m[1])).filter((s) => s.length >= 3 && s.length <= 200);
  const h2s = tag("h2").slice(0, 10);
  const h3s = tag("h3").slice(0, 15);
  const headingQuestions = [...h2s, ...h3s, ...tag("h4"), ...tag("summary"), ...tag("dt")].filter((s) => s.endsWith("?"));
  // Questions du balisage FAQPage (JSON-LD).
  const ld: string[] = [];
  for (const m of body.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (n: unknown): void => {
        if (Array.isArray(n)) n.forEach(walk);
        else if (n && typeof n === "object") {
          const o = n as Record<string, unknown>;
          if (o["@type"] === "Question" && typeof o.name === "string") ld.push(clean(o.name));
          Object.values(o).forEach(walk);
        }
      };
      walk(JSON.parse(m[1]));
    } catch {
      /* JSON-LD illisible : ignoré */
    }
  }
  // Le JSON-LD est dans <script> : relu sur le HTML brut.
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    for (const q of m[1].matchAll(/"@type"\s*:\s*"Question"\s*,\s*"name"\s*:\s*"([^"]{5,200})"/g)) ld.push(clean(q[1]));
  }
  const questions = [...new Set([...headingQuestions, ...ld])].slice(0, 20);
  return { url, h2s, h3s, questions };
}

/** La structure des pages concurrentes (illisible = ignorée, jamais bloquant). */
export async function loadOutlines(urls: string[], fetcher: typeof fetch = fetch): Promise<Outline[]> {
  const pages = await Promise.all(urls.slice(0, 3).map(async (u) => ({ u, html: await fetchPage(u, fetcher) })));
  return pages.filter((p) => p.html).map((p) => extractOutline(p.u, p.html as string));
}

/** Le texte de la page /offres (les seuls prix de TIM Management permis, articles de vente). Null si illisible. */
export async function loadOffersText(fetcher: typeof fetch = fetch): Promise<string | null> {
  const html = await fetchPage(`${SITE}/offres`, fetcher);
  if (!html) return null;
  const text = htmlToText(html.replace(/<(script|style|nav|footer)\b[\s\S]*?<\/\1>/gi, " "));
  return text.length > 200 ? text.slice(0, 12_000) : null;
}
