/**
 * Constantes qui sont des règles (validation.py et config.py du pipeline Python).
 * Inventaire : docs/articles/inventaire-pipeline-python/socle-code.md, § 10.
 */

export const SITE_DOMAIN = "tim-management.co";
/** Fichiers téléchargeables de la médiathèque WordPress (cms.tim-management.co) : acceptés par checkLinks. */
export const MEDIA_UPLOADS_PATH = "/wp-content/uploads/";

/** Liens sortants autorisés dans le corps (les URL de faits_sources le sont aussi). */
export const ALLOWED_OUTBOUND_DOMAINS = [
  "legifrance.gouv.fr",
  "insee.fr",
  "service-public.fr",
  "service-public.gouv.fr",
  "urssaf.fr",
  "ffbatiment.fr",
  "code.travail.gouv.fr",
] as const;

/** Organismes dont toute mention doit être adossée à une ligne de faits_sources. */
export const ORGANISMES = [
  "FFB", "Fédération française du bâtiment", "INSEE", "CAPEB", "OPPBTP",
  "FNTP", "DARES", "Xerfi", "Statista", "ADEME", "Banque de France",
  "Observatoire des métiers du BTP",
] as const;

/** Sources officielles pour les références légales (domaine de l'URL ou sous-domaine). */
export const LEGAL_SOURCE_DOMAINS = ["legifrance.gouv.fr", "service-public.fr", "service-public.gouv.fr", "code.travail.gouv.fr"] as const;

export const CONVENTION_TEXT_DOMAINS = ["legifrance.gouv.fr"] as const;
export const CONVENTION_TEXT_PATH = "/conv_coll/";
export const OFFICIAL_SYNTHESIS_DOMAINS = ["code.travail.gouv.fr", "service-public.fr", "service-public.gouv.fr", "travail-emploi.gouv.fr"] as const;

/**
 * Formes normalisées (norm) de la marque admises comme entité par checkFacts.
 * Correction décidée le 18/11/2026 : la marque s'écrit « TIM Management » (checkBrand) ; sa forme
 * normalisée reste « tim management », la liste ne change donc pas de valeur.
 */
export const BRAND_ALLOWLIST = ["tim management"] as const;

export const CAPSULE_MIN_WORDS = 40;
export const CAPSULE_MAX_WORDS = 60;
export const H2_QUESTION_MIN_RATIO = 0.6;
export const FANOUT_MIN = 5;
export const FANOUT_MAX = 8;
export const VIDEO_MIN_WORDS = 130; // ≈ 60-90 s à l'oral
export const VIDEO_MAX_WORDS = 250;

/** Constantes admises dans un calcul à partir de faits sourcés (mois, semaines, heures mensuelles…). */
export const CALC_CONSTANTS = [12.0, 52.0, 35.0, 151.67, 100.0] as const;

export const SEO_TITLE_MAX = 60;
export const SEO_DESC_MAX = 155;
export const ARTICLE_MIN_WORDS = 300;
export const WORDCOUNT_TOLERANCE = 0.3;
export const INTERNAL_LINKS_MIN = 3;
export const INTERNAL_LINKS_WARN = 5;
export const KEYWORD_INTRO_WORDS = 50;

/** config.py : domaines de recherche et de lecture (sous-domaines compris). */
export const RESEARCH_DOMAINS = [
  "legifrance.gouv.fr", "service-public.fr", "service-public.gouv.fr", "code.travail.gouv.fr",
  "travail-emploi.gouv.fr", "urssaf.fr", "boss.gouv.fr", "net-entreprises.fr", "impots.gouv.fr",
  "economie.gouv.fr", "ameli.fr", "insee.fr", "cnil.fr", "inrs.fr", "preventionbtp.fr",
  "cibtp.fr", "ffbatiment.fr", "fntp.fr", "capeb.fr", "francetravail.fr", "francenum.gouv.fr",
] as const;

/**
 * config.py : un concurrent peut être nommé, jamais lié (règle du 03/11/2026). Kalitics (partenaire),
 * Sage, Cegid, Onaya et Silae ne sont pas des concurrents.
 */
export const COMPETITOR_NAMES = [
  "Kelio", "Bodet", "Bizneo", "Agendrix", "Factorial", "Eurécia", "Eurecia", "Skello", "Combo", "Snapshift",
  "Traxxeo", "Novade", "Organilog", "Keobat", "Alobees", "iXbat", "CGSI", "Batiscript",
  "Hellio", "Batappli", "Codial", "Everwin", "Batigest", "ProGBTP", "Fieldwire", "Vertuoza", "Procore",
  "Archipad", "Finalcad", "Obat", "Graneet", "Kizeo", "Planday", "Microsoft Project",
] as const;

/** research.py */
export const MIN_FAITS = 4;
export const MAX_FAITS = 15;
