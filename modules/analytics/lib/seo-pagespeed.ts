import { cached, httpError, missingEnv, type SourceResult } from "@/modules/analytics/lib/seo-cache";

/**
 * PageSpeed Insights — la santé technique des pages clés, sur mobile (c'est
 * l'index mobile que Google classe) :
 *
 *  - les Core Web Vitals RÉELS (CrUX : ce que vivent les visiteurs Chrome sur
 *    28 jours, au 75ᵉ centile) — LCP, INP, CLS. Un site peu visité n'en a pas :
 *    on le dit plutôt que d'afficher le labo à la place ;
 *  - les scores Lighthouse (labo) : performance, SEO, accessibilité, bonnes
 *    pratiques.
 *
 * Une clé d'API gratuite (Google Cloud → « PageSpeed Insights API ») suffit.
 */

export const PSI_ENV = ["PAGESPEED_API_KEY"];
const TTL = 24 * 3600_000;

/** Les pages auditées : `SEO_KEY_URLS` (virgules), sinon l'accueil du site Search Console. */
export function keyUrls(env: Record<string, string | undefined> = process.env): string[] {
  const list = (env.SEO_KEY_URLS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length) return list.slice(0, 12);
  const site = env.GSC_SITE_URL?.trim();
  if (!site) return [];
  // « sc-domain:exemple.fr » (propriété domaine) → https://exemple.fr/
  return [site.startsWith("sc-domain:") ? `https://${site.slice(10)}/` : site];
}

export type Vital = { p75: number | null; category: "FAST" | "AVERAGE" | "SLOW" | null };
export type PageAudit = {
  url: string;
  lcp: Vital;
  inp: Vital;
  cls: Vital;
  /** Les Core Web Vitals mesurés sont « bons » (vrai), au moins un ne l'est pas (faux), pas de LCP ou de CLS terrain (null). */
  cwvPass: boolean | null;
  performance: number | null;
  seo: number | null;
  accessibility: number | null;
  bestPractices: number | null;
};

type Metric = { percentile?: number; category?: string };
type PsiJson = {
  loadingExperience?: { metrics?: Record<string, Metric>; overall_category?: string };
  lighthouseResult?: { categories?: Record<string, { score?: number | null }> };
};

const vital = (m?: Metric, scale = 1): Vital => ({
  p75: m?.percentile != null ? m.percentile / scale : null,
  category: (m?.category as Vital["category"]) ?? null,
});
const score = (j: PsiJson, k: string) => {
  const s = j.lighthouseResult?.categories?.[k]?.score;
  return s == null ? null : Math.round(s * 100);
};

export function parsePsi(url: string, j: PsiJson): PageAudit {
  const m = j.loadingExperience?.metrics ?? {};
  const lcp = vital(m.LARGEST_CONTENTFUL_PAINT_MS);
  const inp = vital(m.INTERACTION_TO_NEXT_PAINT);
  // CrUX rend le CLS multiplié par 100.
  const cls = vital(m.CUMULATIVE_LAYOUT_SHIFT_SCORE, 100);
  // Comme Google : LCP et CLS sont indispensables ; l'INP, souvent absent sur un
  // site peu visité, compte quand il est mesuré et ne bloque pas quand il manque.
  const known = [lcp, inp, cls].filter((v) => v.category);
  return {
    url,
    lcp,
    inp,
    cls,
    cwvPass: lcp.category && cls.category ? known.every((v) => v.category === "FAST") : null,
    performance: score(j, "performance"),
    seo: score(j, "seo"),
    accessibility: score(j, "accessibility"),
    bestPractices: score(j, "best-practices"),
  };
}

/** Audits simultanés au plus : au-delà, Google répond 429 (limite de débit). */
const CONCURRENCY = 4;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function audit(url: string): Promise<PageAudit> {
  const q = new URLSearchParams({ url, strategy: "mobile", key: process.env.PAGESPEED_API_KEY!.trim() });
  for (const c of ["performance", "seo", "accessibility", "best-practices"]) q.append("category", c);
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(`https://www.googleapis.com/pagespeedonline/v5/runPagespeed?${q}`, { cache: "no-store", signal: AbortSignal.timeout(55_000) });
    // Limite de débit : on patiente et on réessaie, deux fois au plus.
    if (res.status === 429 && attempt < 2) {
      await sleep(4000 * (attempt + 1));
      continue;
    }
    if (!res.ok) throw await httpError(res, `PageSpeed (${url})`);
    return parsePsi(url, (await res.json()) as PsiJson);
  }
}

/** Chaque page a son propre cache : une page refusée est réessayée seule, les autres restent servies. */
const auditCached = (url: string) => cached(`psi:${url}`, TTL, () => audit(url));

/** `fn` sur chaque élément, `limit` à la fois, dans l'ordre de la liste. */
async function pool<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const out: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      try {
        out[i] = { status: "fulfilled", value: await fn(items[i]) };
      } catch (reason) {
        out[i] = { status: "rejected", reason };
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export type PageSpeedData = { pages: PageAudit[]; /** Les pages qu'on n'a pas pu auditer cette fois (réessayées à la prochaine ouverture). */ failed: string[] };

export async function loadPageSpeed(): Promise<SourceResult<PageSpeedData>> {
  const missing = missingEnv(PSI_ENV);
  const urls = keyUrls();
  if (!urls.length) missing.push("SEO_KEY_URLS");
  if (missing.length) return { status: "missing", missing };
  // Un audit prend 10 à 30 s : quatre à la fois, et une page en échec n'éteint pas les autres.
  const settled = await pool(urls, CONCURRENCY, auditCached);
  const pages = settled.flatMap((s) => (s.status === "fulfilled" ? [s.value] : []));
  const failed = urls.filter((_, i) => settled[i].status === "rejected");
  if (!pages.length) {
    const first = settled.find((s): s is PromiseRejectedResult => s.status === "rejected");
    return { status: "error", message: first?.reason instanceof Error ? first.reason.message : "PageSpeed : aucune page auditée." };
  }
  return { status: "ok", data: { pages, failed }, fetchedAt: new Date().toISOString() };
}

export async function pingPageSpeed(): Promise<string> {
  const url = keyUrls()[0];
  if (!url) throw new Error("Aucune page à auditer : poser SEO_KEY_URLS ou GSC_SITE_URL.");
  const a = await audit(url);
  return `PageSpeed répond : ${url} — performance mobile ${a.performance ?? "?"}/100, SEO ${a.seo ?? "?"}/100.`;
}
