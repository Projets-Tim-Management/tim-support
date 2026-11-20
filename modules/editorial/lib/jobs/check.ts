/**
 * CONTRÔLE D'UNE FICHE MÉTIER avant publication sans relecture (décisions du 18/11/2026).
 * Python ne contrôlait rien ; tout ici est nouveau. Erreur = la fiche n'est pas publiée.
 *
 * (a) Chiffres : tout nombre écrit en chiffres dans un texte doit être un chiffre France Travail
 *     donné au modèle (salaires, fourchette et sa part, offres, demandeurs). Seules exceptions,
 *     annoncées dans le prompt (JOB_NUMBERS_RULE) :
 *       - « Niveau 2 » à « Niveau 8 », « Bac+2 » à « Bac+8 » (niveaux de diplôme), partout ;
 *       - dans le champ `duree` des certifications seulement : 1-30 jours, 1-52 semaines,
 *         1-24 mois, 1-5 ans, 1-1000 heures (« 2 ans », « 3 à 5 jours ») ;
 *       - les références collées à des lettres (« CACES R489 », « B1V », « 1re ») ;
 *       - « 12 mois » / « 12 derniers mois » et « 35 ans », qui figurent dans les libellés des
 *         chiffres donnés au modèle (offres sur 12 mois, médianes avant/après 35 ans).
 *     Donc « 3 ans d'expérience » ou « CAP en 2 ans » dans une réponse de FAQ = erreur.
 *     Limite : un nombre écrit en lettres (« deux ans ») n'est pas vu.
 * (b) Définition et chaque réponse de FAQ : capsule de 40 à 60 mots, sans lien, sans reprise
 *     pronominale (`capsuleProblems` des articles).
 * (c) Marque « TIM Management » seulement, une fois au plus ; « hors ligne », notes et étoiles,
 *     traces d'IA refusés (contrôles des articles), aucun HTML ni lien dans aucun champ.
 * (d) Structure du contrat du prompt : synonymes 2-5, points clés 4-5, certifications 4-6,
 *     contextes 4-6, quiz 5 questions × 4 options notées 3/2/1/0 et 3 paliers, FAQ 5-6 ;
 *     yoast_title ≤ 60 et yoast_description ≤ 155 caractères (avertissements).
 */
import { checkAiTraces, checkBrand, checkOffline, checkRating } from "@/modules/editorial/lib/articles/check/brand";
import { extractNumbers } from "@/modules/editorial/lib/articles/check/normalize";
import { cpLen } from "@/modules/editorial/lib/articles/check/py";
import { capsuleProblems } from "@/modules/editorial/lib/articles/check/structure";
import type { Article, CheckResult } from "@/modules/editorial/lib/articles/check/types";

import type { JobFigures } from "./francetravail";
import type { JobSheetContent } from "./prompt";

export const JOB_LIMITS = {
  synonymes: [2, 5],
  points_cles: [4, 5],
  certifications_items: [4, 6],
  contextes_items: [4, 6],
  faq_items: [5, 6],
  orientation_questions: 5,
  orientation_options: 4,
  orientation_points: [3, 2, 1, 0],
  orientation_resultats: 3,
  yoast_title: 60,
  yoast_description: 155,
} as const;

type Field = { where: string; text: string; kind?: "duree" };

const str = (x: unknown): string => (typeof x === "string" ? x : "");
const list = (x: unknown): unknown[] => (Array.isArray(x) ? x : []);
const rec = (x: unknown): Record<string, unknown> => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as Record<string, unknown>) : {});

/** Tous les textes rédigés de la fiche, avec leur emplacement. */
export function jobSheetTexts(g: JobSheetContent): Field[] {
  const out: Field[] = [];
  const add = (where: string, x: unknown, kind?: "duree") => out.push({ where, text: str(x), kind });
  add("titre_complet", g.titre_complet);
  add("categorie", g.categorie);
  add("definition", g.definition);
  list(g.synonymes).forEach((s, i) => add(`synonyme ${i + 1}`, s));
  list(g.points_cles).forEach((s, i) => add(`point clé ${i + 1}`, s));
  add("informations_cles_description", g.informations_cles_description);
  add("certifications_texte", g.certifications_texte);
  list(g.certifications_items).forEach((c, i) => {
    add(`certification ${i + 1} intitulé`, rec(c).intitule);
    add(`certification ${i + 1} niveau`, rec(c).niveau);
    add(`certification ${i + 1} durée`, rec(c).duree, "duree");
  });
  add("statistiques_texte", g.statistiques_texte);
  add("salaires_texte", g.salaires_texte);
  add("competences_texte", g.competences_texte);
  list(g.competences_groupes).forEach((grp, i) => {
    add(`compétences ${i + 1} titre`, rec(grp).titre);
    list(rec(grp).items).forEach((s, j) => add(`compétences ${i + 1} item ${j + 1}`, s));
  });
  add("contextes_texte", g.contextes_texte);
  list(g.contextes_items).forEach((c, i) => {
    add(`contexte ${i + 1} label`, rec(c).label);
    add(`contexte ${i + 1} description`, rec(c).description);
  });
  add("orientation_intro", g.orientation_intro);
  list(g.orientation_questions).forEach((q, i) => {
    add(`quiz question ${i + 1}`, rec(q).question);
    list(rec(q).options).forEach((o, j) => add(`quiz question ${i + 1} option ${j + 1}`, rec(o).label));
  });
  list(g.orientation_resultats).forEach((r, i) => {
    add(`quiz palier ${i + 1} titre`, rec(r).titre);
    add(`quiz palier ${i + 1} texte`, rec(r).texte);
  });
  list(g.faq_items).forEach((q, i) => {
    add(`FAQ ${i + 1} question`, rec(q).question);
    add(`FAQ ${i + 1} réponse`, rec(q).reponse);
  });
  add("yoast_title", g.yoast_title);
  add("yoast_description", g.yoast_description);
  return out;
}

// ── (a) Chiffres ─────────────────────────────────────────────────────────────

const FIGURE_KEYS = [
  "salaire_median",
  "salaire_median_moins35",
  "salaire_median_plus35",
  "fourchette_min",
  "fourchette_max",
  "fourchette_part",
  "offres_12m",
  "demandeurs",
] as const;

/** Nombres permis (forme de `extractNumbers`) : les chiffres France Travail donnés au modèle. */
export function allowedNumbers(figures: JobFigures): Set<string> {
  const out = new Set<string>();
  for (const k of FIGURE_KEYS) {
    const v = figures[k];
    if (typeof v === "number" && Number.isFinite(v)) for (const n of extractNumbers(String(v))) out.add(n);
  }
  return out;
}

const CODE_RE = /[\p{L}\d]*(?:\p{L}\d|\d\p{L})[\p{L}\d]*/gu; // R489, B1V, H0B0, 1re
const LEVEL_RE = /\bniveau\s+[2-8](?!\d)|\bbac\s*\+\s*[2-8](?!\d)/giu;
const LABEL_CONTEXT_RE = /\b12\s+(?:derniers\s+)?mois\b|\b35\s+ans\b/giu;
const DURATION_RE = /(?<!\d)(\d+)(?:\s*(?:à|-|–)\s*(\d+))?\s*(jours?|semaines?|mois|ans?|heures?)\b/giu;
const DURATION_MAX: Record<string, number> = { jour: 30, semaine: 52, moi: 24, an: 5, heure: 1000 };

function stripDurations(text: string): string {
  return text.replace(DURATION_RE, (m, a: string, b: string | undefined, unit: string) => {
    const max = DURATION_MAX[unit.toLowerCase().replace(/s$/, "")];
    const ok = [a, b].filter(Boolean).every((n) => Number(n) >= 1 && Number(n) <= max);
    return ok ? " " : m;
  });
}

/** Nombres d'un texte qui ne sont ni des chiffres France Travail ni une exception permise. */
export function unexpectedNumbers(text: string, allowed: Set<string>, kind?: "duree"): string[] {
  let t = text.replace(CODE_RE, " ").replace(LEVEL_RE, " ").replace(LABEL_CONTEXT_RE, " ");
  if (kind === "duree") t = stripDurations(t);
  return [...extractNumbers(t)].filter((n) => !allowed.has(n));
}

export function checkJobNumbers(g: JobSheetContent, figures: JobFigures): string[] {
  const allowed = allowedNumbers(figures);
  const errors: string[] = [];
  for (const f of jobSheetTexts(g)) {
    const bad = unexpectedNumbers(f.text, allowed, f.kind);
    if (bad.length) errors.push(`[${f.where}] Chiffre absent des données France Travail : ${bad.join(", ")} — « ${f.text.slice(0, 120)} »`);
  }
  return errors;
}

// ── (b) Capsules ─────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\/|\bwww\./i;
const HTML_RE = /<\/?[a-z][^>]*>/i;

export function checkJobCapsules(g: JobSheetContent): string[] {
  const errors: string[] = [];
  const caps: Array<[string, string]> = [["definition", str(g.definition)]];
  list(g.faq_items).forEach((q, i) => caps.push([`FAQ ${i + 1} réponse`, str(rec(q).reponse)]));
  for (const [where, text] of caps) {
    for (const p of capsuleProblems(text)) errors.push(`[${where}] Capsule : ${p}`);
  }
  return errors;
}

// ── (c) Marque, ton, texte brut ──────────────────────────────────────────────

const ARTICLE_LABEL = "[introduction]";
const BRAND_MENTION_RE = /\btim\s+management\b/giu;

/** Contrôles des articles appliqués à chaque texte (posé comme introduction, libellé remplacé). */
export function checkJobTone(g: JobSheetContent): string[] {
  const errors: string[] = [];
  let mentions = 0;
  for (const f of jobSheetTexts(g)) {
    if (!f.text) continue;
    const article: Article = { introduction: f.text };
    for (const check of [checkBrand, checkOffline, checkRating, checkAiTraces]) {
      for (const e of check(article)) errors.push(e.replace(ARTICLE_LABEL, `[${f.where}]`));
    }
    if (HTML_RE.test(f.text)) errors.push(`[${f.where}] HTML interdit (texte brut uniquement)`);
    if (URL_RE.test(f.text)) errors.push(`[${f.where}] Lien interdit (texte brut uniquement)`);
    mentions += (f.text.match(BRAND_MENTION_RE) ?? []).length;
  }
  if (mentions > 1) errors.push(`Marque citée ${mentions} fois (une fois au plus)`);
  return errors;
}

// ── (d) Structure ────────────────────────────────────────────────────────────

function count(errors: string[], label: string, x: unknown, [min, max]: readonly [number, number]) {
  const n = list(x).length;
  if (!Array.isArray(x)) errors.push(`${label} : liste absente`);
  else if (n < min || n > max) errors.push(`${label} : ${n} (attendu ${min} à ${max})`);
}

const REQUIRED_TEXTS = [
  "titre_complet",
  "definition",
  "informations_cles_description",
  "certifications_texte",
  "statistiques_texte",
  "salaires_texte",
  "competences_texte",
  "contextes_texte",
] as const;

export function checkJobStructure(g: JobSheetContent): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const k of REQUIRED_TEXTS) if (!str(g[k]).trim()) errors.push(`${k} vide`);

  count(errors, "Synonymes", g.synonymes, JOB_LIMITS.synonymes);
  count(errors, "Points clés", g.points_cles, JOB_LIMITS.points_cles);
  count(errors, "Certifications", g.certifications_items, JOB_LIMITS.certifications_items);
  count(errors, "Contextes", g.contextes_items, JOB_LIMITS.contextes_items);
  count(errors, "FAQ", g.faq_items, JOB_LIMITS.faq_items);
  list(g.synonymes).forEach((s, i) => !str(s).trim() && errors.push(`Synonyme ${i + 1} vide`));
  list(g.points_cles).forEach((s, i) => !str(s).trim() && errors.push(`Point clé ${i + 1} vide`));
  list(g.certifications_items).forEach((c, i) => {
    for (const k of ["intitule", "niveau", "duree"]) if (!str(rec(c)[k]).trim()) errors.push(`Certification ${i + 1} : ${k} vide`);
  });
  list(g.contextes_items).forEach((c, i) => {
    for (const k of ["label", "description"]) if (!str(rec(c)[k]).trim()) errors.push(`Contexte ${i + 1} : ${k} vide`);
  });
  list(g.faq_items).forEach((q, i) => {
    for (const k of ["question", "reponse"]) if (!str(rec(q)[k]).trim()) errors.push(`FAQ ${i + 1} : ${k} vide`);
  });
  const groups = list(g.competences_groupes);
  if (!groups.length) errors.push("Compétences : aucun groupe");
  groups.forEach((grp, i) => {
    if (!str(rec(grp).titre).trim()) errors.push(`Compétences ${i + 1} : titre vide`);
    if (!list(rec(grp).items).some((s) => str(s).trim())) errors.push(`Compétences ${i + 1} : aucun item`);
  });

  // Quiz : 5 questions × 4 options notées 3, 2, 1, 0 (dans cet ordre), 3 paliers.
  const questions = list(g.orientation_questions);
  if (questions.length !== JOB_LIMITS.orientation_questions) errors.push(`Quiz : ${questions.length} questions (attendu ${JOB_LIMITS.orientation_questions})`);
  questions.forEach((q, i) => {
    if (!str(rec(q).question).trim()) errors.push(`Quiz question ${i + 1} : intitulé vide`);
    const opts = list(rec(q).options);
    const points = opts.map((o) => Number(rec(o).points));
    if (opts.length !== JOB_LIMITS.orientation_options) errors.push(`Quiz question ${i + 1} : ${opts.length} options (attendu ${JOB_LIMITS.orientation_options})`);
    else if (points.join(",") !== JOB_LIMITS.orientation_points.join(",")) errors.push(`Quiz question ${i + 1} : points ${points.join("/")} (attendu 3/2/1/0)`);
    opts.forEach((o, j) => !str(rec(o).label).trim() && errors.push(`Quiz question ${i + 1} option ${j + 1} : libellé vide`));
  });
  const maxScore = JOB_LIMITS.orientation_questions * 3;
  const results = list(g.orientation_resultats);
  if (results.length !== JOB_LIMITS.orientation_resultats) errors.push(`Quiz : ${results.length} paliers (attendu ${JOB_LIMITS.orientation_resultats})`);
  else {
    const mins = results.map((r) => Number(rec(r).min));
    const decreasing = mins.every((m, i) => Number.isInteger(m) && (i === 0 || m < mins[i - 1]));
    if (!decreasing || mins[0] > maxScore || mins[mins.length - 1] !== 0) {
      errors.push(`Quiz : seuils des paliers ${mins.join("/")} (décroissants, de ${maxScore} au plus jusqu'à 0)`);
    }
  }
  results.forEach((r, i) => {
    for (const k of ["titre", "texte"]) if (!str(rec(r)[k]).trim()) errors.push(`Quiz palier ${i + 1} : ${k} vide`);
  });

  const title = str(g.yoast_title);
  const desc = str(g.yoast_description);
  if (!title.trim()) warnings.push("yoast_title vide (titre par défaut)");
  else if (cpLen(title) > JOB_LIMITS.yoast_title) warnings.push(`yoast_title : ${cpLen(title)} caractères (> ${JOB_LIMITS.yoast_title}, coupé)`);
  if (!desc.trim()) warnings.push("yoast_description vide (définition reprise)");
  else if (cpLen(desc) > JOB_LIMITS.yoast_description) warnings.push(`yoast_description : ${cpLen(desc)} caractères (> ${JOB_LIMITS.yoast_description}, coupée)`);
  return { errors, warnings };
}

/** Contrôle complet. Aucune erreur = publiable sans relecture. */
export function checkJobSheet(generated: JobSheetContent, figures: JobFigures): CheckResult {
  const structure = checkJobStructure(generated);
  return {
    errors: [...structure.errors, ...checkJobNumbers(generated, figures), ...checkJobCapsules(generated), ...checkJobTone(generated)],
    warnings: structure.warnings,
  };
}
