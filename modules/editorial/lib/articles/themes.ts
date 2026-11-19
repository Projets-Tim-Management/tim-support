/**
 * LES THÉMATIQUES DES ARTICLES — validées par Charlie le 18/11/2026
 * (docs/articles/THEMATIQUES.md). Elles vivent en base (collection
 * `article-themes`, modifiable) ; cette liste sert à la créer et à ranger
 * automatiquement un article importé, que Charlie peut ensuite corriger.
 *
 * `number` est l'identifiant stable d'une thématique (le rangement automatique
 * s'appuie dessus, pas sur le nom, qui peut changer).
 */
export type ThemeSeed = {
  number: number;
  name: string;
  /** Trafic : articles d'information. Vente : comparatifs, choix d'un logiciel (seule thématique avec les prix). */
  kind: "trafic" | "vente";
  pillar: string;
  subthemes: string[];
  module: string;
  /** Rang de priorité (1 = d'abord), décidé avec Charlie. */
  priority: number;
};

export const THEME_SEEDS: ThemeSeed[] = [
  {
    number: 1,
    name: "Temps de travail et pointage",
    kind: "trafic",
    pillar: "Calculer le temps de travail",
    subthemes: ["Calcul des heures", "Feuilles d'heures (modèles PDF/Excel)", "Heures supplémentaires et repos compensateur", "Travail de nuit", "Pauses", "Trajets", "Obligations légales du pointage"],
    module: "Pointage",
    priority: 1,
  },
  {
    number: 2,
    name: "Paie, salaires et conventions BTP",
    kind: "trafic",
    pillar: "Grille de salaire BTP",
    subthemes: ["Grilles et coefficients", "Classification ouvriers / ETAM / cadres", "Primes", "Paniers et zones", "Congés et CIBTP", "RTT", "Intempéries", "Jours fériés", "Solde de tout compte", "Absences", "RH et obligations de l'employeur"],
    module: "Pointage (export paie), employés",
    priority: 2,
  },
  {
    number: 3,
    name: "Planning et organisation des équipes",
    kind: "trafic",
    pillar: "Planning de chantier",
    subthemes: ["Planning ouvriers", "Engins", "Intérimaires", "Gantt", "Multi-chantiers", "Absences"],
    module: "Planning",
    priority: 4,
  },
  {
    number: 4,
    name: "Suivi de chantier et rentabilité",
    kind: "trafic",
    pillar: "Méthode de suivi de chantier",
    subthemes: ["Rentabilité et marge", "Indicateurs", "Compte rendu", "Réception et levée des réserves", "Photos", "Documents de sous-traitance"],
    module: "Suivi de chantier (inclus)",
    priority: 3,
  },
  {
    number: 5,
    name: "Matériel et stock",
    kind: "trafic",
    pillar: "Gérer le matériel de chantier",
    subthemes: ["Stock et consommables", "Parc d'engins", "Entretiens", "Coût du matériel par chantier", "Inventaire"],
    module: "Stock",
    priority: 5,
  },
  {
    number: 6,
    name: "Métiers du BTP",
    kind: "trafic",
    pillar: "Les métiers du bâtiment",
    subthemes: ["Fiches métier", "Problèmes propres à chaque métier"],
    module: "—",
    priority: 6,
  },
  {
    number: 7,
    name: "Choisir son logiciel BTP",
    kind: "vente",
    pillar: "Meilleur logiciel pour une PME du BTP",
    subthemes: ["Comparatifs", "Alternative à …", "Tops logiciels"],
    module: "Toute l'offre (avec prix, règle B4)",
    priority: 7,
  },
];

/** Catégories WordPress du CPT `actualite` (relevé du 18/11/2026) → thématique. */
export const WP_CATEGORY_TO_THEME: Record<number, number> = {
  58: 1, // Pointage
  60: 1, // Feuilles d'heures
  62: 2, // Paie & RH
  59: 3, // Planning
  61: 4, // Suivi de chantier
  63: 6, // Fiches métier
  64: 7, // Comparatifs
};

const norm = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();

/**
 * La thématique proposée pour un article importé. Pure (testée).
 * Le sujet l'emporte sur la catégorie quand il est sans ambiguïté (le matériel,
 * le choix d'un logiciel) ; sinon la catégorie WordPress ; sinon des mots du
 * titre et du slug ; sinon null (Charlie range à la main).
 */
export function guessThemeNumber(input: { categories?: number[]; slug?: string; title?: string }): number | null {
  const text = norm(`${input.slug ?? ""} ${input.title ?? ""}`);
  if (/\b(stock|materiel|engins?|outillage|inventaire|parc)\b/.test(text)) return 5;
  // Pas « vs » : « pointage chantier vs pointage SAV » est un article de trafic, pas un comparatif de logiciels.
  if (/\b(top|meilleurs?|comparatif|alternatives?)\b/.test(text) || /logiciels?[- ](de|du)[- ]|choisir.*logiciel/.test(text)) return 7;
  for (const c of input.categories ?? []) if (WP_CATEGORY_TO_THEME[c]) return WP_CATEGORY_TO_THEME[c];
  if (/pointage|feuille|heures?|temps|horaire|pause|nuit|trajet/.test(text)) return 1;
  if (/salaire|paie|prime|conge|rtt|convention|smic|panier|absence|ferie|intemperie|solde|indemnit|frais|tva/.test(text)) return 2;
  if (/planning|planifi|gantt/.test(text)) return 3;
  if (/chantier|reserve|reception|rentabilit|kpi|sous-trait/.test(text)) return 4;
  if (/metier/.test(text)) return 6;
  return null;
}
