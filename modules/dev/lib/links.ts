/**
 * Les liens externes d'un développement : maquette Figma, page Notion, dépôt,
 * document partagé.
 *
 * Deux besoins, deux fonctions : reconnaître le service pour l'afficher d'un
 * signe plutôt que d'une URL de quatre-vingts caractères, et rattraper les URL
 * saisies sans protocole — « figma.com/… » collé depuis la barre d'adresse est
 * la façon normale de coller un lien, pas une erreur à refuser.
 */

export type LinkService = {
  /** Nom affiché quand l'utilisateur n'a pas donné d'intitulé. */
  label: string;
  /** Signe court, dans l'esprit des pastilles du module. */
  icon: string;
};

/** Domaine (sans www) → service. L'ordre n'a pas d'importance : c'est une table. */
const SERVICES: { match: RegExp; service: LinkService }[] = [
  { match: /(^|\.)figma\.com$/, service: { icon: "🎨", label: "Figma" } },
  { match: /(^|\.)notion\.(so|site)$/, service: { icon: "📓", label: "Notion" } },
  { match: /(^|\.)github\.com$/, service: { icon: "🐙", label: "GitHub" } },
  { match: /(^|\.)gitlab\.com$/, service: { icon: "🦊", label: "GitLab" } },
  { match: /(docs|drive|sheets)\.google\.com$/, service: { icon: "📄", label: "Google" } },
  { match: /(^|\.)miro\.com$/, service: { icon: "🧩", label: "Miro" } },
  { match: /(^|\.)loom\.com$/, service: { icon: "🎥", label: "Loom" } },
  { match: /(^|\.)youtube\.com$|(^|\.)youtu\.be$/, service: { icon: "🎥", label: "Vidéo" } },
  { match: /(^|\.)linear\.app$/, service: { icon: "📐", label: "Linear" } },
  { match: /(^|\.)slack\.com$/, service: { icon: "💬", label: "Slack" } },
];

const GENERIC: LinkService = { icon: "🔗", label: "Lien" };

/**
 * Complète une saisie en URL utilisable.
 *
 * Renvoie `null` si ça ne peut pas être une adresse : mieux vaut refuser à la
 * saisie qu'enregistrer un lien qui n'ouvrira rien.
 */
export const normalizeUrl = (raw: string): string | null => {
  const value = raw.trim();
  if (value === "") return null;
  // Collé depuis une barre d'adresse, le protocole manque souvent.
  const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
  try {
    const url = new URL(withProtocol);
    // Un hôte sans point (« figma », « localhost/x ») est une faute de frappe
    // plus probablement qu'une intention.
    if (!url.hostname.includes(".")) return null;
    return url.toString();
  } catch {
    return null;
  }
};

/** Hôte d'une URL, sans `www.` — ce qu'on affiche à défaut d'intitulé. */
export const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** Le service derrière une URL, ou le lien générique. */
export const serviceOf = (url: string): LinkService => {
  const host = hostOf(url);
  return SERVICES.find(({ match }) => match.test(host))?.service ?? GENERIC;
};

/** Ce qu'on affiche sur la pastille : l'intitulé donné, sinon le service, sinon l'hôte. */
export const linkLabel = (link: { url?: string | null; label?: string | null }): string => {
  const given = link.label?.trim();
  if (given) return given;
  const url = link.url?.trim();
  if (!url) return GENERIC.label;
  const service = serviceOf(url);
  return service === GENERIC ? hostOf(url) : service.label;
};
