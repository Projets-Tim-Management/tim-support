/** Formes des données contrôlées (JSON produit par le modèle, faits_sources), comme dans le pipeline Python. */

export type Fait = { fait: string; source: string; url?: string; annee?: string };

export type ArticleBlock = { texte?: string; [k: string]: unknown } | null;
export type ArticleFaq = { titre?: string; text?: string; [k: string]: unknown } | null;
export type ArticleSource = { libelle?: string; url?: string; date?: string };
export type ArticleImage = { position_apres_h2?: string; description_visuelle?: string; alt?: string; [k: string]: unknown };
export type ArticleVideo = { titre?: string; script?: string; [k: string]: unknown } | null;

export type Article = {
  title?: string;
  yoast_title?: string;
  yoast_description?: string;
  introduction?: string;
  conclusion?: string;
  contenu?: ArticleBlock[] | null;
  faq?: ArticleFaq[] | null;
  sous_requetes?: unknown[] | null;
  images?: unknown[] | null;
  video?: ArticleVideo;
  sources?: ArticleSource[] | null;
  [k: string]: unknown;
};

/** Emplacement (« H1 », « bloc 2 », « FAQ 1 réponse »…) et fragment HTML. */
export type Fragment = [where: string, html: string];

export type CheckResult = { errors: string[]; warnings: string[] };
