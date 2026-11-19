/**
 * STATUTS D'UN ARTICLE — source de vérité UNIQUE (options du champ, étiquette de
 * couleur du tableau, compteurs de l'en-tête, règles de la synchronisation).
 *
 * Le parcours (décision de Charlie, 18/11/2026) : une idée de l'équipe de Sergey,
 * validée par Charlie, rédigée, contrôlée, illustrée, prête, programmée sur un
 * créneau (mardi et jeudi 9 h, 2 par semaine au plus), publiée ; puis, avec le
 * temps, à rafraîchir. « Dépublié » = retiré du site (brouillon dans WordPress).
 * « Arrêtée » = une idée refusée ou stoppée par Charlie à n'importe quelle étape
 * avant la publication (« une idée peut être stoppée si pas bonne », 18/11/2026).
 *
 * ⚠️ `value` est une valeur d'enum Postgres : en ajouter une exige une migration.
 * Couleurs : tokens de styles/_tokens.scss, jamais en dur.
 */
export type ArticleStatus = {
  value: string;
  label: string;
  color: string;
  bg: string;
  /** Ce que le statut veut dire, affiché au survol de l'étiquette. */
  hint: string;
};

export const ARTICLE_STATUSES = [
  { value: "idee", label: "Idée", color: "var(--tim-slate)", bg: "var(--tim-slate-bg)", hint: "Proposée par l'équipe de Sergey, en attente de la validation de Charlie." },
  { value: "validee", label: "Validée", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)", hint: "Sujet validé par Charlie, à rédiger." },
  { value: "redaction", label: "En rédaction", color: "var(--tim-indigo)", bg: "var(--tim-indigo-bg)", hint: "Recherche des faits et rédaction en cours." },
  { value: "a-relire", label: "À relire", color: "var(--tim-primary)", bg: "var(--tim-primary-light)", hint: "Article rédigé et contrôlé : à toi de le relire, puis de valider le texte." },
  { value: "a-verifier", label: "À vérifier", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)", hint: "Le contrôle a bloqué l'article, ou un brouillon importé est à trier : voir le motif." },
  { value: "image", label: "Image à faire", color: "var(--tim-purple)", bg: "var(--tim-purple-bg)", hint: "Texte validé : il manque l'image principale." },
  { value: "pret", label: "Prêt", color: "var(--tim-teal)", bg: "var(--tim-teal-bg)", hint: "Texte validé et image déposée : attend un créneau de publication." },
  { value: "programme", label: "Programmé", color: "var(--tim-sky)", bg: "var(--tim-sky-bg)", hint: "Créneau de publication réservé (mardi ou jeudi, 9 h)." },
  { value: "publie", label: "Publié", color: "var(--tim-green)", bg: "var(--tim-green-bg)", hint: "En ligne sur tim-management.co." },
  { value: "a-rafraichir", label: "À rafraîchir", color: "var(--tim-rose)", bg: "var(--tim-rose-bg)", hint: "En ligne, mais à reprendre : chiffres, prix, échéance, positions qui baissent." },
  { value: "depublie", label: "Dépublié", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)", hint: "Retiré du site (brouillon dans WordPress), souvent fusionné dans un autre article." },
  { value: "arretee", label: "Arrêtée", color: "var(--tim-red)", bg: "var(--tim-red-bg)", hint: "Idée arrêtée par Charlie (refusée ou stoppée en cours de route), avec son motif : elle ne sera plus reproposée." },
] as const satisfies readonly ArticleStatus[];

export type ArticleStatusValue = (typeof ARTICLE_STATUSES)[number]["value"];

export const ARTICLE_STATUS_VALUES = ARTICLE_STATUSES.map((s) => s.value) as ArticleStatusValue[];

export const articleStatusMeta = (value: string | null | undefined): ArticleStatus | null =>
  ARTICLE_STATUSES.find((s) => s.value === value) ?? null;

/** Les statuts « EN PRÉPARATION » : une idée validée qui n'est pas encore en ligne (on peut encore l'arrêter). */
export const PREPARATION_STATUSES: readonly ArticleStatusValue[] = ["idee", "validee", "redaction", "a-relire", "a-verifier", "image", "pret", "programme"];

/** Les statuts EN LIGNE : l'article est visible sur le site. */
export const ONLINE_STATUSES: readonly ArticleStatusValue[] = ["publie", "a-rafraichir"];

/** Statut de l'article dans WordPress (`status` de l'API REST). */
export type WpStatus = "publish" | "future" | "draft" | "pending" | "private" | string;

/**
 * Le statut à donner à un article d'après WordPress. Pure (testée).
 *
 * - Nouvel article (pas de statut local) : en ligne → Publié ; programmé → Programmé ;
 *   brouillon d'un article retiré du site → Dépublié ; autre brouillon → À vérifier (à trier).
 * - Article connu : WordPress fait foi pour ce qui est EN LIGNE ou NON. Un article
 *   publié dans WordPress devient Publié, sauf s'il est déjà « À rafraîchir » (le
 *   travail en attente n'est pas effacé). Un article retiré du site devient Dépublié.
 *   Sinon (brouillon qui avance dans le tableau), le statut local est gardé.
 */
export function statusFromWordPress(local: string | null | undefined, wp: WpStatus, isKnownUnpublished = false): ArticleStatusValue {
  const current = ARTICLE_STATUS_VALUES.includes(local as ArticleStatusValue) ? (local as ArticleStatusValue) : null;
  if (wp === "publish") return current && ONLINE_STATUSES.includes(current) ? current : "publie";
  if (wp === "future") return "programme";
  if (wp === "private") return "depublie";
  // Brouillon ou en attente dans WordPress.
  if (!current) return isKnownUnpublished ? "depublie" : "a-verifier";
  // « Programmé » par le support = brouillon dans WordPress jusqu'au créneau : il le reste (étape 6).
  if (ONLINE_STATUSES.includes(current)) return "depublie";
  return current;
}

/** Pourquoi reprendre un article en ligne (proposition de l'équipe SEO/GEO, étape 3). */
export const REFRESH_REASONS = [
  { value: "baisse", label: "Clics en baisse" },
  { value: "position", label: "Position à faire monter" },
  { value: "echeance", label: "Échéance (texte, barème, tarif)" },
  { value: "format", label: "Format GEO manquant (TL;DR, capsules, FAQ)" },
  { value: "doublon", label: "Doublon évité : sujet d'une nouvelle idée" },
  { value: "autre", label: "Autre" },
] as const;
export type RefreshReason = (typeof REFRESH_REASONS)[number]["value"];
