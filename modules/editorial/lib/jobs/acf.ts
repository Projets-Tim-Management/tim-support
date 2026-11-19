/**
 * ASSEMBLAGE ACF D'UNE FICHE MÉTIER : portage de `build_acf` et `build_seo_meta`
 * (tim-management/main_metiers.py), plus la mise à jour annuelle des seuls chiffres.
 *
 * La forme suit le front (tim-front, lib/ficheMetier/fromAcf.ts) et les fiches publiées jusqu'au
 * 01/10/2026. Attention : sur les fiches créées depuis, WordPress renvoie `certifications` sous la
 * forme {valeur, source} et `faq` sous la forme [{q, r}] (vides) : le groupe de champs ACF semble
 * avoir changé, et les certifications et la FAQ envoyées par Python y sont perdues.
 */
import { cpSlice } from "@/modules/editorial/lib/articles/check/py";

import type { JobFigures } from "./francetravail";
import type { JobCertification, JobContext, JobFaq, JobQuizQuestion, JobQuizResult, JobSheetContent } from "./prompt";

export const DATAEMPLOI_URL = (rome: string) => `https://dataemploi.francetravail.fr/emploi/metier/chiffres-cles/NAT/FR/${rome}`;

export const STATS_SOURCE_LABEL = "France Travail — dataemploi (12 derniers mois)";
export const SALARY_SOURCE_LABEL = "France Travail (médianes en poste + fourchette des offres, 12 mois)";

const NNBSP = " "; // espace fine insécable, comme Python

/** `f"{n:,}"` avec espace fine ; null si ce n'est pas un entier. */
export function fmtInt(n: unknown): string | null {
  if (typeof n !== "number" || !Number.isInteger(n)) return null;
  const s = String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, NNBSP);
  return n < 0 ? `-${s}` : s;
}

export function fmtEur(n: unknown): string | null {
  const s = fmtInt(n);
  return s == null ? null : `${s}${NNBSP}€`;
}

/** ['a','b'] → [{valeur:'a'}, {valeur:'b'}] (répéteurs de valeurs simples, vides retirés). */
export function valList(strings: readonly unknown[] | null | undefined): Array<{ valeur: string }> {
  return (strings ?? []).filter((s): s is string => Boolean(s)).map((s) => ({ valeur: s }));
}

export type JobAcfSource = { label: string; url: string; date: string };
export type JobInfoItem = { label: string; value: string | null; unit: string };
export type JobStatItem = { valeur: string | null; label: string };
export type JobMedian = { label: string; valeur: number };
export type JobFourchette = { min: number; max: number; part: number } | Record<string, never>;

export type JobAcf = {
  rome: string;
  definition: string;
  synonymes: Array<{ valeur: string }>;
  points_cles: Array<{ valeur: string }>;
  derniere_mise_a_jour: string;
  informations_cles: { titre: string; categorie: string; description: string; items: JobInfoItem[] };
  certifications: { titre: string; texte: string; items: JobCertification[] };
  statistiques: { titre: string; texte: string; source: JobAcfSource; items: JobStatItem[] };
  salaires: { titre: string; texte: string; source: JobAcfSource; fourchette_offres: JobFourchette; medians: JobMedian[] };
  competences: { titre: string; texte: string; groupes: Array<{ titre: string; items: Array<{ valeur: string }> }> };
  contextes: { titre: string; texte: string; items: JobContext[] };
  orientation: {
    titre: string;
    intro: string;
    questions: JobQuizQuestion[];
    resultats: JobQuizResult[];
    cta: { texte: string; label: string; url: string };
  };
  faq: { titre: string; items: JobFaq[] };
};

export type JobMeta = {
  /** Intitulé du métier (colonne « Métier » du Sheet) : titre WordPress et mot-clé Yoast. */
  metier: string;
  rome: string;
  /** Catégorie imposée (colonne « Catégorie ») ; sinon celle du modèle. */
  categorie?: string | null;
  /** AAAA-MM-JJ */
  today: string;
};

const has = (v: unknown) => v !== undefined && v !== null;

/** Parties chiffrées de l'ACF (tout ce qui vient de France Travail). */
export function figureParts(rome: string, numbers: JobFigures, today: string) {
  const srcUrl = DATAEMPLOI_URL(rome);
  const srcDate = numbers.date_donnees || today;

  const infoItems: JobInfoItem[] = [];
  if (has(numbers.salaire_median)) infoItems.push({ label: "Salaire médian", value: fmtEur(numbers.salaire_median), unit: "brut / mois" });
  if (has(numbers.offres_12m)) infoItems.push({ label: "Offres / an", value: fmtInt(numbers.offres_12m), unit: "" });
  if (numbers.tension) infoItems.push({ label: "Tension de recrutement", value: numbers.tension, unit: "" });
  if (has(numbers.demandeurs)) infoItems.push({ label: "Demandeurs d'emploi", value: fmtInt(numbers.demandeurs), unit: "" });

  const statItems: JobStatItem[] = [];
  if (has(numbers.offres_12m)) statItems.push({ valeur: fmtInt(numbers.offres_12m), label: "Offres diffusées sur 12 mois" });
  if (has(numbers.demandeurs)) statItems.push({ valeur: fmtInt(numbers.demandeurs), label: "Demandeurs d'emploi inscrits" });

  const medians: JobMedian[] = [];
  for (const [label, key] of [
    ["Tous âges", "salaire_median"],
    ["Moins de 35 ans", "salaire_median_moins35"],
    ["35 ans et plus", "salaire_median_plus35"],
  ] as const) {
    const v = numbers[key];
    if (has(v)) medians.push({ label, valeur: v as number });
  }

  let fourchette: JobFourchette = {};
  if (has(numbers.fourchette_min) && has(numbers.fourchette_max)) {
    fourchette = { min: numbers.fourchette_min as number, max: numbers.fourchette_max as number, part: numbers.fourchette_part || 80 };
  }

  return {
    infoItems,
    statItems,
    medians,
    fourchette,
    statsSource: { label: STATS_SOURCE_LABEL, url: srcUrl, date: srcDate } as JobAcfSource,
    salarySource: { label: SALARY_SOURCE_LABEL, url: srcUrl, date: srcDate } as JobAcfSource,
  };
}

/** `editorial.get(key, default)` de Python : le défaut ne vaut que si la clé manque. */
function get<K extends keyof JobSheetContent, D>(e: JobSheetContent, key: K, dflt: D): NonNullable<JobSheetContent[K]> | D {
  return (Object.prototype.hasOwnProperty.call(e, key) ? e[key] : dflt) as NonNullable<JobSheetContent[K]> | D;
}

/** Objet `acf` complet d'une fiche (`build_acf`). */
export function buildJobAcf(generated: JobSheetContent, figures: JobFigures, meta: JobMeta): JobAcf {
  const e = generated;
  const f = figureParts(meta.rome, figures, meta.today);
  return {
    rome: meta.rome,
    definition: get(e, "definition", ""),
    synonymes: valList(e.synonymes),
    points_cles: valList(e.points_cles),
    derniere_mise_a_jour: meta.today,

    informations_cles: {
      titre: get(e, "titre_complet", meta.metier),
      categorie: meta.categorie || get(e, "categorie", ""),
      description: get(e, "informations_cles_description", ""),
      items: f.infoItems,
    },
    certifications: {
      titre: "Certifications et diplômes",
      texte: get(e, "certifications_texte", ""),
      items: get(e, "certifications_items", []),
    },
    statistiques: {
      titre: "Statistiques sur ce métier",
      texte: get(e, "statistiques_texte", ""),
      source: f.statsSource,
      items: f.statItems,
    },
    salaires: {
      titre: "Salaires",
      texte: get(e, "salaires_texte", ""),
      source: f.salarySource,
      fourchette_offres: f.fourchette,
      medians: f.medians,
    },
    competences: {
      titre: "Compétences",
      texte: get(e, "competences_texte", ""),
      groupes: get(e, "competences_groupes", []).map((g) => ({ titre: g?.titre ?? "", items: valList(g?.items) })),
    },
    contextes: {
      titre: "Contextes de travail",
      texte: get(e, "contextes_texte", ""),
      items: get(e, "contextes_items", []),
    },
    orientation: {
      titre: "Ce métier est-il fait pour vous ?",
      intro: get(e, "orientation_intro", "Cinq questions rapides pour estimer la compatibilité."),
      questions: get(e, "orientation_questions", []),
      resultats: get(e, "orientation_resultats", []),
      cta: { texte: "Vous encadrez déjà des équipes ?", label: "Découvrir TIM", url: "/contact-visio" },
    },
    faq: {
      titre: "Questions fréquentes",
      items: get(e, "faq_items", []),
    },
  };
}

export type JobSeoMeta = { title: string; metadesc: string; focuskw: string };

/** Champ REST `seo_meta` (Yoast via tim-api) : titre coupé à 60, description à 155 (`build_seo_meta`). */
export function buildJobSeoMeta(generated: JobSheetContent, metier: string): JobSeoMeta {
  return {
    title: cpSlice(generated.yoast_title || `${metier} : fiche métier BTP`, 0, 60),
    metadesc: cpSlice(generated.yoast_description || get(generated, "definition", ""), 0, 155),
    focuskw: metier,
  };
}

/** Corps de l'upsert WordPress (`metiers_wordpress.build_payload`) : publié directement. */
export function buildJobPayload(title: string, slug: string, acf: JobAcf, seoMeta: JobSeoMeta) {
  return { title, slug, status: "publish" as const, acf, seo_meta: seoMeta };
}

type AnyAcf = Record<string, unknown>;
const group = (x: unknown): AnyAcf => (typeof x === "object" && x !== null && !Array.isArray(x) ? (x as AnyAcf) : {});

/**
 * Mise à jour annuelle : reconstruit SEULEMENT les parties chiffrées d'un `acf` existant (tel que
 * relu dans WordPress) à partir de chiffres France Travail frais. Remplacés : derniere_mise_a_jour,
 * informations_cles.items, statistiques.items et .source, salaires.medians, .fourchette_offres et
 * .source. Tout le reste (textes, titres, quiz, FAQ, rome…) est rendu à l'identique. Un chiffre
 * absent de `figures` disparaît de la fiche, comme à la création : fournir des chiffres complets.
 * Les textes rédigés citent les anciens chiffres (points clés, FAQ…) : ils ne sont pas touchés.
 */
export function refreshFiguresAcf<T extends AnyAcf>(currentAcf: T, figures: JobFigures, today: string): T {
  const acf = structuredClone(currentAcf) as AnyAcf;
  const f = figureParts(String(acf.rome ?? ""), figures, today);
  acf.derniere_mise_a_jour = today;
  acf.informations_cles = { ...group(acf.informations_cles), items: f.infoItems };
  acf.statistiques = { ...group(acf.statistiques), source: f.statsSource, items: f.statItems };
  acf.salaires = { ...group(acf.salaires), source: f.salarySource, fourchette_offres: f.fourchette, medians: f.medians };
  return acf as T;
}

/** « 2 427 € » → 2427 ; vide → null (`metiers_sheet.parse_int`). */
export function parseIntLoose(value: unknown): number | null {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

/** Relit les chiffres d'un `acf` existant (WordPress renvoie les nombres en chaînes). */
export function figuresFromAcf(acf: AnyAcf): JobFigures {
  const out: JobFigures = {};
  const sal = group(acf.salaires);
  const medianKeys: Record<string, keyof JobFigures> = {
    "Tous âges": "salaire_median",
    "Moins de 35 ans": "salaire_median_moins35",
    "35 ans et plus": "salaire_median_plus35",
  };
  for (const m of Array.isArray(sal.medians) ? sal.medians : []) {
    const key = medianKeys[String(group(m).label)];
    const v = parseIntLoose(group(m).valeur);
    if (key && v != null) (out as Record<string, unknown>)[key] = v;
  }
  const fo = group(sal.fourchette_offres);
  const fmin = parseIntLoose(fo.min);
  const fmax = parseIntLoose(fo.max);
  const fpart = parseIntLoose(fo.part);
  if (fmin != null) out.fourchette_min = fmin;
  if (fmax != null) out.fourchette_max = fmax;
  if (fpart != null) out.fourchette_part = fpart;
  const stats = group(acf.statistiques);
  for (const it of Array.isArray(stats.items) ? stats.items : []) {
    const v = parseIntLoose(group(it).valeur);
    if (v == null) continue;
    if (group(it).label === "Offres diffusées sur 12 mois") out.offres_12m = v;
    if (group(it).label === "Demandeurs d'emploi inscrits") out.demandeurs = v;
  }
  for (const it of Array.isArray(group(acf.informations_cles).items) ? (group(acf.informations_cles).items as unknown[]) : []) {
    if (group(it).label === "Tension de recrutement" && group(it).value) out.tension = String(group(it).value);
  }
  const date = group(stats.source).date;
  if (typeof date === "string" && date) out.date_donnees = date;
  return out;
}

const SLUG_STOPWORDS = new Set(["a", "au", "aux", "d", "de", "des", "du", "en", "et", "l", "la", "le", "les"]);

/**
 * Slug d'une fiche à partir de l'intitulé épicène (Python le lisait dans le Sheet) : forme
 * masculine (« Poseur / Poseuse de canalisations » → « Poseur de canalisations »), sans accents,
 * sans mots vides : « poseur-canalisations ». Reproduit 42 des 44 slugs de la vitrine (relevé du
 * 18/11/2026) ; les 2 autres avaient été saisis à la main.
 */
export function jobSlug(title: string): string {
  let t = title.trim();
  const parts = t.split(/\s+\/\s+/);
  if (parts.length === 2) {
    const masc = parts[0].trim().split(/\s+/);
    const rest = parts[1].trim().split(/\s+/).slice(masc.length);
    t = [...masc, ...rest].join(" ");
  }
  const words = t
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replaceAll("œ", "oe")
    .replaceAll("æ", "ae")
    .split(/[^a-z0-9]+/)
    .filter((w) => w && !SLUG_STOPWORDS.has(w));
  return words.join("-");
}
