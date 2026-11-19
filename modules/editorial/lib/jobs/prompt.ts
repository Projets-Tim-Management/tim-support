/**
 * PROMPT DES FICHES MÉTIER : portage mot pour mot de tim-management/metiers_generator.py.
 *
 * Écarts voulus (décisions du 18/11/2026) :
 * - marque « TIM Management » (Python : « Tim Management ») ;
 * - une règle ajoutée (JOB_NUMBERS_RULE) : la fiche est publiée sans relecture si elle passe le
 *   contrôle (check.ts), qui refuse tout nombre écrit en chiffres hors des chiffres France Travail,
 *   sauf les niveaux et durées des certifications listés ici.
 * Appel Claude (hors de ce module) : 1 message, max_tokens 8000, sans outils (comme Python).
 */
import { serpBriefText, type SerpBrief } from "@/modules/editorial/lib/articles/writer/prompt";
import { parseJsonResponse } from "@/modules/editorial/lib/articles/check/normalize";

import type { JobFigures } from "./francetravail";

// 8 000 dans le pipeline Python ; Opus 5.5 rédige plus long : coupé à 8 000 le 18/11/2026.
export const JOB_SHEET_MAX_TOKENS = 16000;

export const JOB_SHEET_SYSTEM_PROMPT =
  "Tu es un expert de l'orientation et des métiers du BTP, rédacteur web " +
  "E-E-A-T. Tu connais les diplômes, certifications, compétences et conditions " +
  "de travail RÉELS de la filière. Tu réponds UNIQUEMENT avec un objet JSON " +
  "valide, sans markdown, sans texte avant ou après.";

/** Liste blanche des niveaux et durées (seuls nombres permis hors chiffres France Travail). */
export const JOB_NUMBERS_RULE =
  '- Seules exceptions aux chiffres fournis : « Niveau 2 » à « Niveau 8 » et « Bac+2 » à « Bac+8 » (niveaux de diplôme, partout), les durées du champ "duree" des certifications (1 à 30 jours, 1 à 52 semaines, 1 à 24 mois, 1 à 5 ans, 1 à 1 000 heures, ex. « 2 ans », « 3 à 5 jours »), les références collées à des lettres (ex. « CACES R489 »), « 12 mois » et « 35 ans ». Aucun autre nombre écrit en chiffres, nulle part (pas de durée hors du champ "duree", pas d\'année, pas de pourcentage calculé).';

const FACT_LABELS: Array<[keyof JobFigures, string]> = [
  ["salaire_median", "Salaire médian (tous âges, €/mois)"],
  ["salaire_median_moins35", "Salaire médian <35 ans"],
  ["salaire_median_plus35", "Salaire médian 35 ans+"],
  ["fourchette_min", "Fourchette offres min"],
  ["fourchette_max", "Fourchette offres max"],
  ["offres_12m", "Offres sur 12 mois"],
  ["demandeurs", "Demandeurs d'emploi inscrits"],
  ["tension", "Tension de recrutement"],
];

/** Chiffres connus mis en forme pour le prompt (`_facts_block`). */
export function factsBlock(numbers: JobFigures): string {
  const lines: string[] = [];
  for (const [key, label] of FACT_LABELS) {
    const val = numbers[key];
    if (val != null && val !== "") lines.push(`- ${label} : ${val}`);
  }
  return lines.length ? lines.join("\n") : "- (aucun chiffre fourni)";
}

export type JobPromptInput = { metier: string; rome: string; categorie?: string | null; figures: JobFigures; serpBrief?: SerpBrief | null };

export function buildJobSheetPrompt({ metier, rome, categorie, figures, serpBrief }: JobPromptInput): { system: string; user: string } {
  const user = `Génère le contenu éditorial de la fiche métier BTP suivante.

MÉTIER : "${metier}"
CODE ROME : ${rome}
CATÉGORIE (indicative) : ${categorie || "à déterminer (filière BTP)"}

CHIFFRES CONNUS (à RÉUTILISER dans les textes/points clés, NE PAS en inventer d'autres) :
${factsBlock(figures)}

RÈGLES
- Français, ton informatif et neutre. Diplômes, certifications, compétences et conditions RÉELS de ce métier dans le BTP.
- N'invente AUCUN chiffre : n'utilise que ceux fournis ci-dessus (tu peux les reformuler).
${JOB_NUMBERS_RULE}
- "orientation" : EXACTEMENT 5 questions de profil, chacune avec EXACTEMENT 4 options notées 3, 2, 1, 0 (de la plus favorable à la moins favorable). Total max = 15.
- "points_cles" : 4 à 5 faits MARQUANTS, si possible chiffrés à partir des chiffres connus.
- "synonymes" : 2 à 5 appellations courantes du métier.

── LEVIERS SEO / GEO (importants) ──
1. RÉPONSES SNIPPET-READY : la "definition" ET chaque "reponse" de FAQ doivent être des phrases AUTO-PORTÉES de 40 à 60 mots, compréhensibles SANS contexte (c'est ce que Google et les LLM extraient pour leurs réponses). Commence par répondre directement.
2. ENTITÉS : intègre naturellement les entités liées (secteur "BTP/bâtiment", métiers proches, matériaux/outils, diplômes nommés, organismes) pour renforcer la compréhension sémantique. Mentionne "TIM Management" UNE fois max, sans forcer.
- TEXTE BRUT UNIQUEMENT : aucun HTML, aucune balise, aucun lien dans les champs (ils sont affichés tels quels par le front).

FORMAT JSON STRICT (sans markdown) :
{
  "titre_complet": "Intitulé épicène, ex: Charpentier / Charpentière",
  "categorie": "Catégorie filière, ex: BTP — Bois & gros œuvre",
  "definition": "Réponse snippet-ready de 40-60 mots, auto-portée, définissant clairement le métier dès la 1re phrase.",
  "synonymes": ["Synonyme 1", "Synonyme 2"],
  "points_cles": ["Fait chiffré 1", "Fait chiffré 2", "Fait 3", "Fait 4"],
  "informations_cles_description": "2 à 3 phrases décrivant le métier.",
  "certifications_texte": "Phrase d'intro sur les diplômes du métier.",
  "certifications_items": [
    {"intitule": "CAP ...", "niveau": "Niveau 3 (CAP)", "duree": "2 ans"}
  ],
  "statistiques_texte": "Phrase d'intro aux statistiques du métier.",
  "salaires_texte": "Phrase d'intro aux salaires du métier.",
  "competences_texte": "Phrase d'intro aux compétences.",
  "competences_groupes": [
    {"titre": "Savoir-faire", "items": ["Compétence 1", "Compétence 2", "Compétence 3"]},
    {"titre": "Savoir-être", "items": ["Qualité 1", "Qualité 2", "Qualité 3"]}
  ],
  "contextes_texte": "Phrase d'intro aux contextes de travail.",
  "contextes_items": [
    {"label": "Travail en hauteur", "description": "Description réelle de la condition."}
  ],
  "orientation_intro": "Cinq questions rapides pour estimer la compatibilité.",
  "orientation_questions": [
    {"question": "Question de profil 1 ?", "options": [
      {"label": "Réponse très favorable", "points": 3},
      {"label": "Réponse plutôt favorable", "points": 2},
      {"label": "Réponse peu favorable", "points": 1},
      {"label": "Réponse défavorable", "points": 0}
    ]}
  ],
  "orientation_resultats": [
    {"min": 12, "titre": "Ce métier est fait pour vous !", "texte": "Message palier haut."},
    {"min": 7,  "titre": "Le métier peut vous correspondre", "texte": "Message palier moyen."},
    {"min": 0,  "titre": "Ce métier ne semble pas idéal", "texte": "Message palier bas."}
  ],
  "faq_items": [
    {"question": "Quel diplôme pour devenir ${metier} ?", "reponse": "Réponse snippet-ready de 40-60 mots, auto-portée, en texte brut (sans aucune balise ni lien)."}
  ],
  "yoast_title": "Mot-clé (métier) au début | 60 caractères MAX",
  "yoast_description": "Promesse claire avec le métier + salaire/formation | 155 caractères MAX"
}

IMPORTANT : 5 questions d'orientation, 4 à 6 certifications, 4 à 6 contextes, 5 à 6 questions de FAQ.
yoast_title : 60 caractères MAXIMUM, nom du métier au début. yoast_description : 155 caractères MAXIMUM.`;
  // Le top 10 de google.fr (comparateur, étape 4) : notions et questions à couvrir, sans jamais en tirer de chiffre.
  const serp = serpBrief ? `\n\nTOP 10 GOOGLE.FR SUR « FICHE MÉTIER ${metier.toUpperCase()} » (notions et questions seulement ; AUCUN chiffre n'en vient, les seuls chiffres permis restent ceux de France Travail ci-dessus) :\n${serpBriefText(serpBrief, 1200)}` : "";
  return { system: JOB_SHEET_SYSTEM_PROMPT, user: user + serp };
}

// ── Réponse du modèle ────────────────────────────────────────────────────────

export type JobCertification = { intitule?: string; niveau?: string; duree?: string };
export type JobCompetenceGroup = { titre?: string; items?: string[] };
export type JobContext = { label?: string; description?: string };
export type JobQuizOption = { label?: string; points?: number };
export type JobQuizQuestion = { question?: string; options?: JobQuizOption[] };
export type JobQuizResult = { min?: number; titre?: string; texte?: string };
export type JobFaq = { question?: string; reponse?: string };

/** Contenu éditorial rendu par le modèle (contrat JSON du prompt). Rien n'est garanti : voir check.ts. */
export type JobSheetContent = {
  titre_complet?: string;
  categorie?: string;
  definition?: string;
  synonymes?: string[];
  points_cles?: string[];
  informations_cles_description?: string;
  certifications_texte?: string;
  certifications_items?: JobCertification[];
  statistiques_texte?: string;
  salaires_texte?: string;
  competences_texte?: string;
  competences_groupes?: JobCompetenceGroup[];
  contextes_texte?: string;
  contextes_items?: JobContext[];
  orientation_intro?: string;
  orientation_questions?: JobQuizQuestion[];
  orientation_resultats?: JobQuizResult[];
  faq_items?: JobFaq[];
  yoast_title?: string;
  yoast_description?: string;
};

/**
 * Texte de la réponse → contenu. Même lecture que Python (fence ``` retirée, préfixe « json »),
 * puis, si ce n'est pas du JSON, la lecture tolérante des articles (texte parasite autour).
 * Lève si aucun objet JSON n'est lisible.
 */
export function parseJobSheetResponse(text: string): JobSheetContent {
  let raw = text.trim();
  if (raw.startsWith("```")) {
    raw = raw.split("```")[1] ?? "";
    if (raw.startsWith("json")) raw = raw.slice(4);
    raw = raw.trim();
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    data = parseJsonResponse(text);
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) throw new Error("La réponse n'est pas un objet JSON");
  return data as JobSheetContent;
}
