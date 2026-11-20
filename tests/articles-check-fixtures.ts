/**
 * Données de test partagées des tests articles-check-* : portage de tim-management/tests/conftest.py.
 * Seul écart : la conclusion de l'article type écrit « TIM Management » (règle de marque inversée
 * le 18/11/2026 ; Python écrivait « Tim Management »).
 */
import type { Article, Fait } from "@/modules/editorial/lib/articles/check";

const WORDS = (
  "Le pointage digital centralise les heures de chaque compagnon sur tous les chantiers actifs " +
  "et permet au conducteur de travaux de consolider la paie sans ressaisie ni oubli tout en " +
  "gardant une trace datée de chaque intervention pour le client final et pour les contrôles " +
  "internes réalisés chaque fin de mois par la direction"
).split(" ");

/** Texte neutre (sans chiffre ni source) de n mots. */
export function words(n: number): string {
  const out: string[] = [];
  while (out.length < n) out.push(...WORDS);
  return out.slice(0, n).join(" ") + ".";
}

export function capsule(n = 45): string {
  return `<p><strong>${words(n)}</strong></p>`;
}

export const H2S = [
  "Comment organiser le pointage sur plusieurs chantiers ?",
  "À partir de combien de chantiers passer au digital ?",
  "Quelle différence entre pointage papier et application ?",
  "Faut-il former les chefs d'équipe ?",
  "Les étapes du déploiement",
];

export type TestArticle = Omit<Article, "contenu" | "faq" | "introduction" | "conclusion" | "title"> & {
  contenu: Array<{ acf_fc_layout?: string; texte: string }>;
  faq: Array<{ titre: string; text: string }>;
  introduction: string;
  conclusion: string;
  title: string;
};

export function makeArticle(overrides: Partial<TestArticle> = {}): TestArticle {
  const article: TestArticle = {
    title: "Comment centraliser le pointage multi-chantiers ?",
    introduction:
      '<div class="tldr-box"><p>Points clés :</p><ul><li>Un</li><li>Deux</li>' +
      "<li>Trois</li></ul></div><p>Le pointage multi-chantiers regroupe les heures.</p>",
    contenu: H2S.map((h) => ({ acf_fc_layout: "texte", texte: `<h2>${h}</h2>${capsule()}<p>Détail de la section.</p>` })),
    // 3 liens internes dont une page produit : minimum exigé à la génération (checkInternalLinking)
    conclusion:
      "<p>Conclusion avec TIM Management : voir le " +
      '<a href="https://tim-management.co/pointage-digital-mobile-chantier">pointage mobile sur chantier</a>, ' +
      'le <a href="https://tim-management.co/actualite/pointage-multi-chantiers">guide du pointage multi-chantiers</a> ' +
      'et la <a href="https://tim-management.co/contact">page de contact</a>.</p>',
    faq: [1, 2, 3, 4].map((i) => ({ titre: `Question ${i} ?`, text: capsule(50) })),
    sous_requetes: H2S.map((h, i) => ({ requete: `requête ${i}`, h2: h })),
    images: [
      { position_apres_h2: H2S[0], description_visuelle: "Schéma", alt: "Schéma du flux" },
      { position_apres_h2: H2S[2], description_visuelle: "Tableau", alt: "Comparatif" },
    ],
    video: { titre: "Le pointage multi-chantiers en 90 secondes", script: words(180) },
    yoast_title: "Pointage multi-chantiers : centraliser les heures",
    yoast_description: "Comment centraliser le pointage de plusieurs chantiers : méthode, étapes et erreurs à éviter.",
  };
  return { ...article, ...overrides };
}

export const FAITS_FFB: Fait[] = [
  {
    fait: "Les conducteurs de travaux perdent 12 h par semaine en consolidation papier",
    source: "FFB, baromètre digitalisation BTP",
    url: "https://www.ffbatiment.fr/barometre",
    annee: "2024",
  },
];

export const FAIT_LEGAL: Fait = {
  fait: "Article L3171-4 du Code du travail : l'employeur fournit les éléments justifiant les horaires",
  source: "Légifrance",
  url: "https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000033020517",
  annee: "2016",
};
