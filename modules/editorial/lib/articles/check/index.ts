/**
 * Validation des articles SEO/GEO : portage fidèle de tim-management/validation.py (et des contrôles
 * purs de research.py et generator.py). Fonctions pures, sans réseau ni Payload.
 * Inventaire des règles : docs/articles/inventaire-pipeline-python/socle-code.md.
 *
 * Écarts voulus avec Python (décision du 18/11/2026) : mots vides du contexte des chiffres (facts.ts),
 * références légales exactes (facts.ts, legalTokenIn), hôte interne exact (facts.ts, isSiteHost),
 * règle de marque inversée (brand.ts).
 */
import { checkAiTraces, checkBrand, checkOffline, checkRating } from "./brand";
import { checkFacts } from "./facts";
import { checkCompetitorLinks, checkInternalLinking, checkLinks } from "./links";
import { articleTexts } from "./normalize";
import { checkKeywordIntro, checkLength, checkSeoMeta } from "./seo";
import { checkCapsules, checkFanout, checkHeadings, checkMediaProposals, checkTitles, checkTldr } from "./structure";
import type { Article, Fait } from "./types";

export * from "./brand";
export * from "./constants";
export * from "./facts";
export * from "./links";
export * from "./normalize";
export * from "./policy";
export * from "./refresh";
export * from "./research-verify";
export * from "./seo";
export * from "./structure";
export type * from "./types";

export type SeoOptions = { keyword?: string; wordcount?: number | null; required_urls?: readonly string[] | null };
export type ValidationReport = { errors: string[]; warnings: string[]; faits_utilises: Set<number> };

/**
 * Validation complète : erreurs bloquantes (relance puis « À vérifier ») et avertissements.
 * `seo` ({keyword, wordcount, required_urls}) à la génération d'un nouvel article seulement (métas,
 * longueur, mot-clé en ouverture, maillage) ; absent, ces contrôles ne s'appliquent pas.
 */
export function validateArticle(
  article: Article,
  faits: Fait[],
  casClient = "",
  sitemapUrls?: readonly string[] | null,
  seo?: SeoOptions | null,
): ValidationReport {
  const factWarnings: string[] = [];
  const [factErrors, used] = checkFacts(articleTexts(article), faits, casClient, factWarnings);
  const [linkErrors, linkWarnings] = checkLinks(article, faits, sitemapUrls);
  const errors = [
    ...factErrors,
    ...checkCapsules(article),
    ...checkTitles(article),
    ...checkTldr(article),
    ...linkErrors,
    ...checkFanout(article),
    ...checkOffline(article),
    ...checkRating(article),
    ...checkBrand(article),
    ...checkHeadings(article),
    ...checkAiTraces(article),
    ...checkCompetitorLinks(article),
  ];
  const warnings = [...new Set(factWarnings), ...linkWarnings, ...checkMediaProposals(article)];
  if (seo != null) {
    const keyword = seo.keyword ?? "";
    const [lengthErrors, lengthWarnings] = checkLength(article, seo.wordcount);
    const [metaErrors, metaWarnings] = checkSeoMeta(article, keyword);
    errors.push(...metaErrors, ...checkKeywordIntro(article, keyword), ...lengthErrors, ...checkInternalLinking(article, seo.required_urls ?? []));
    warnings.push(...metaWarnings, ...lengthWarnings);
  }
  return { errors, warnings, faits_utilises: used };
}
