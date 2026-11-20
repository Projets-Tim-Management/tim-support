import type { Payload } from "payload";

import { keywordKey } from "@/modules/editorial/lib/competitors/content";
import { serpContextOf, type SerpContext } from "@/modules/editorial/lib/articles/performance";

/**
 * Les contextes DataForSEO de toutes les requêtes suivies, par clé de mot-clé, pour le diagnostic
 * de performance (19/11/2026). Une seule lecture de la base par appel ; dans une requête HTTP,
 * `forRequest` la garde pour toute la page (le tableau diagnostique 50 articles d'un coup).
 */
export async function loadSerpContexts(payload: Payload): Promise<Map<string, SerpContext>> {
  const r = await payload.find({
    collection: "seo-keywords" as never,
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { keyword: true, keywordKey: true, volume: true, position: true, checkedAt: true, aiOverview: true, aiCited: true, aiSources: true, top10: true } as never,
  });
  const map = new Map<string, SerpContext>();
  for (const d of r.docs as unknown as Parameters<typeof serpContextOf>[0][]) {
    const ctx = serpContextOf(d);
    const key = String(d?.keywordKey ?? keywordKey(String(d?.keyword ?? "")));
    if (ctx && key) map.set(key, ctx);
  }
  return map;
}

/** Le contexte de l'article (par son mot-clé principal), ou null. */
export const serpOfArticle = (map: Map<string, SerpContext>, a: Record<string, unknown>) => {
  const k = String(a.keyword ?? a.wpFocusKeyword ?? "").trim();
  return k ? (map.get(keywordKey(k)) ?? null) : null;
};

/** Le même chargement, gardé le temps d'une requête HTTP (contexte de la requête Payload). */
export function forRequest(req: { payload: Payload; context?: Record<string, unknown> }): Promise<Map<string, SerpContext>> {
  const ctx = (req.context ??= {});
  if (!ctx.serpContexts) ctx.serpContexts = loadSerpContexts(req.payload).catch(() => new Map<string, SerpContext>());
  return ctx.serpContexts as Promise<Map<string, SerpContext>>;
}
