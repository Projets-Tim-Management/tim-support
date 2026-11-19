/**
 * LES CRITÈRES DE LA NOTE SEO / GEO (étude du marché du 19/11/2026,
 * reports/Outils optimisation contenu SEO GEO.md ; validés par Charlie le 19/11/2026).
 *
 * Une note FACTUELLE et HONNÊTE (règles v3, 19/11/2026) : un élément attendu qui manque
 * compte 0 ; seul un critère sans objet sort du calcul, avec sa raison. Chaque critère porte :
 *  - sa jauge (SEO ou GEO) et son poids ;
 *  - son niveau de preuve : A = exigence officielle d'un moteur ou effet
 *    expérimental ; B = corrélation sur un large échantillon ; C = convention
 *    d'éditeur ou règle maison ; D = pratique contredite par une corrélation ;
 *  - son statut : « active » (compte dans la note) ou « info » (affichée, poids 0).
 *
 * Ces critères sont VERSIONNÉS avec les règles (Éditorial › Règles des
 * articles, champ « Critères de la note ») : une recommandation de Sergey
 * validée peut changer un poids ou un seuil ; la note de chaque contenu garde
 * la version avec laquelle elle a été calculée. Les poids sont des choix de
 * conception, pas des standards (aucun éditeur ne publie les siens).
 *
 * La note n'est PAS une prévision de classement ni de citation.
 */

export type Gauge = "seo" | "geo";
export type ProofLevel = "A" | "B" | "C" | "D";
export type ContentKind = "article" | "fiche";

export type Criterion = {
  id: string;
  gauge: Gauge;
  label: string;
  /** Ce que mesure le code, en une phrase. */
  measure: string;
  weight: number;
  level: ProofLevel;
  status: "active" | "info";
  /** La source du niveau de preuve (adresse), s'il y en a une. */
  source?: string;
  applies: ContentKind[];
  /** Les seuils du critère (règles v3) : Sergey peut les durcir ou les assouplir, la direction valide. */
  params?: Record<string, number>;
};

const SRC = {
  google: "https://developers.google.com/search/docs/fundamentals/creating-helpful-content",
  spam: "https://developers.google.com/search/docs/essentials/spam-policies#keyword-stuffing",
  links: "https://developers.google.com/search/docs/crawling-indexing/links-crawlable",
  images: "https://developers.google.com/search/docs/appearance/google-images",
  url: "https://developers.google.com/search/docs/crawling-indexing/url-structure",
  geo: "https://arxiv.org/abs/2311.09735",
  serank: "https://www.searchenginejournal.com/new-data-top-factors-influencing-chatgpt-citations/561954/",
};

/**
 * RÈGLES v3 DE LA NOTE (validées par la direction le 19/11/2026). Principe : un élément
 * attendu qui MANQUE compte 0 (une image absente n'est plus « non mesurable ») ; un élément
 * qui se pose à une étape suivante compte 0 et est marqué « à venir » ; une donnée pas encore
 * relevée compte 0 et rend la note « provisoire » ; seul un critère SANS OBJET (raison écrite)
 * sort du calcul. Poids SEO = 100, GEO = 100.
 */
export const DEFAULT_CRITERIA: Criterion[] = [
  // ── SEO (100) ──
  { id: "SEO-01", gauge: "seo", label: "Méta Yoast (titre et description)", measure: "Titre SEO de 30 à 60 caractères, méta description de 120 à 155.", weight: 10, level: "C", status: "active", applies: ["article", "fiche"], params: { titleMin: 30, titleMax: 60, descMin: 120, descMax: 155 } },
  { id: "SEO-02", gauge: "seo", label: "Mot-clé bien placé", measure: "Le mot-clé figure dans le H1, le titre SEO, la méta description et les 100 premiers mots ; un titre SEO réduit au mot-clé exact perd des points.", weight: 10, level: "B", status: "active", source: SRC.serank, applies: ["article", "fiche"] },
  { id: "SEO-03", gauge: "seo", label: "Maillage interne", measure: "Liens vers des pages de tim-management.co (3 à 5).", weight: 10, level: "A", status: "active", source: SRC.links, applies: ["article"], params: { min: 3, max: 5 } },
  { id: "SEO-04", gauge: "seo", label: "Image principale", measure: "Une image principale est posée.", weight: 10, level: "A", status: "active", source: SRC.images, applies: ["article"] },
  { id: "SEO-05", gauge: "seo", label: "Texte alternatif de l'image", measure: "Non vide, 125 caractères au plus, reprend le mot-clé, sans « image de ».", weight: 5, level: "A", status: "active", source: SRC.images, applies: ["article"], params: { max: 125 } },
  { id: "SEO-06", gauge: "seo", label: "Fichier image optimisé", measure: "WebP ou AVIF, 200 Ko au plus, 1 200 px de large au moins, nom de fichier descriptif.", weight: 5, level: "A", status: "active", source: SRC.images, applies: ["article"], params: { maxKb: 200, minWidth: 1200 } },
  { id: "SEO-07", gauge: "seo", label: "Hiérarchie des titres", measure: "Aucun H1 dans le contenu, le contenu commence par un H2, aucun saut de niveau.", weight: 5, level: "C", status: "active", applies: ["article"] },
  { id: "SEO-08", gauge: "seo", label: "Longueur face au top 10", measure: "Nombre de mots dans la fourchette (1er à 3e quartile) des pages classées dans le top 10 de Google.", weight: 5, level: "C", status: "active", source: SRC.google, applies: ["article", "fiche"] },
  { id: "SEO-09", gauge: "seo", label: "Couverture du sujet", measure: "Score de contenu face au top 10 (termes, entités, questions) ; la cible atteinte donne tous les points.", weight: 15, level: "C", status: "active", applies: ["article", "fiche"] },
  { id: "SEO-10", gauge: "seo", label: "Aucun bourrage", measure: "Densité du mot-clé exact sous 2,5 % des mots, et aucun terme au-delà de la fourchette du top 10.", weight: 15, level: "A", status: "active", source: SRC.spam, applies: ["article", "fiche"], params: { density: 2.5 } },
  { id: "SEO-11", gauge: "seo", label: "Adresse de la page", measure: "Courte (60 caractères, 6 mots au plus), avec le mot-clé, sans date.", weight: 5, level: "A", status: "active", source: SRC.url, applies: ["article", "fiche"], params: { maxChars: 60, maxWords: 6 } },
  { id: "SEO-12", gauge: "seo", label: "Marque et promesses", measure: "« TIM Management » partout, aucune promesse sur TIM Management, aucune page de démo.", weight: 5, level: "C", status: "active", applies: ["article", "fiche"] },
  // ── GEO (100) ──
  { id: "GEO-01", gauge: "geo", label: "Faits chiffrés sourcés", measure: "Phrases chiffrées (hors années seules) pour 1 000 mots, avec au moins une source précise.", weight: 20, level: "A", status: "active", source: SRC.geo, applies: ["article", "fiche"], params: { per1000: 5 } },
  { id: "GEO-02", gauge: "geo", label: "Sources externes", measure: "Sources précises distinctes (page exacte, pas une page d'accueil).", weight: 15, level: "A", status: "active", source: SRC.geo, applies: ["article", "fiche"], params: { min: 3 } },
  { id: "GEO-03", gauge: "geo", label: "Réponse directe en tête", measure: "TL;DR de 3 à 5 points (définition pour une fiche) et une phrase de définition dans les 60 premiers mots.", weight: 15, level: "B", status: "active", applies: ["article", "fiche"] },
  { id: "GEO-04", gauge: "geo", label: "Capsules de 40 à 60 mots", measure: "Une capsule conforme après chaque H2 et en tête de chaque réponse de FAQ.", weight: 10, level: "C", status: "active", applies: ["article", "fiche"] },
  { id: "GEO-05", gauge: "geo", label: "Sections de 120 à 180 mots", measure: "Longueur moyenne des sections entre deux H2.", weight: 10, level: "B", status: "active", source: SRC.serank, applies: ["article"], params: { min: 120, max: 180 } },
  { id: "GEO-06", gauge: "geo", label: "Fraîcheur", measure: "Date de mise à jour visible de moins de 90 jours (fiches : chiffres de moins d'un an).", weight: 10, level: "B", status: "active", source: SRC.serank, applies: ["article", "fiche"], params: { days: 90, daysFiche: 365 } },
  { id: "GEO-07", gauge: "geo", label: "Citations attribuées", measure: "Phrases attribuées à une source (« selon… », « d'après… »).", weight: 10, level: "B", status: "active", source: SRC.geo, applies: ["article"], params: { min: 2 } },
  { id: "GEO-08", gauge: "geo", label: "Auteur et relecture visibles", measure: "Bloc Méthode renseigné, avec « relu par ».", weight: 5, level: "C", status: "active", applies: ["article"] },
  { id: "GEO-09", gauge: "geo", label: "Entités du sujet citées", measure: "Part des organismes, textes et sigles cités par la majorité du top 10 que le texte cite aussi (60 % = plein).", weight: 5, level: "C", status: "active", applies: ["article", "fiche"], params: { full: 0.6 } },
  { id: "GEO-10", gauge: "geo", label: "H2 en question", measure: "Part des H2 formulés en question. Corrélation négative observée avec les citations ChatGPT, non causale : pour information.", weight: 0, level: "D", status: "info", source: SRC.serank, applies: ["article"] },
  { id: "GEO-11", gauge: "geo", label: "FAQ présente", measure: "Nombre de questions de FAQ. Corrélation négative observée avec les citations ChatGPT, non causale : pour information.", weight: 0, level: "D", status: "info", source: SRC.serank, applies: ["article", "fiche"] },
];

/** Les critères d'une version des règles (champ `criteria`), ou les critères par défaut. */
export function criteriaOf(version: { criteria?: unknown } | null | undefined): Criterion[] {
  const c = version?.criteria;
  return Array.isArray(c) && c.length && c.every((x) => x && typeof x === "object" && "id" in (x as object)) ? (c as Criterion[]) : DEFAULT_CRITERIA;
}
