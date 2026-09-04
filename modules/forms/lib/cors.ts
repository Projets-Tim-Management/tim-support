/**
 * Origines autorisées à lire le schéma depuis un navigateur.
 *
 * ⚠️ Ne concerne QUE la lecture. L'envoi d'une soumission passe par le proxy
 * serveur de la vitrine : pas de navigateur, pas de CORS, un secret partagé à la
 * place — une origine se falsifie, un secret non.
 */

/**
 * Previews Vercel, par MOTIF : le slug d'équipe est inconnu de ce dépôt et le
 * projet a déjà changé de compte — une liste figée casserait en silence.
 */
const PREVIEW = /^https:\/\/tim-front-[a-z0-9-]+\.vercel\.app$/;

const PRODUCTION = [
  "https://tim-management.co",
  // Redirige en 308 vers l'apex, mais reste une origine possible le temps de la
  // redirection — et le code de la vitrine la traite comme un hôte de production.
  "https://www.tim-management.co",
  "https://tim-front.vercel.app",
];

/** Postes de développement — jamais servis depuis la production. */
const DEVELOPMENT = ["http://localhost:3000", "http://localhost:3001"];

/** Origines supplémentaires (virgules) : ouvrir un domaine sans déploiement. */
const extra = (): string[] =>
  (process.env.FORMS_ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

export function isAllowedOrigin(origin: string | null | undefined): boolean {
  if (!origin) return false;
  if (PRODUCTION.includes(origin) || extra().includes(origin)) return true;
  if (PREVIEW.test(origin)) return true;
  return process.env.NODE_ENV !== "production" && DEVELOPMENT.includes(origin);
}

/**
 * En-têtes CORS, vides si l'origine n'est pas autorisée. `Vary: Origin` évite
 * qu'un CDN serve à tous la réponse mise en cache pour la première origine.
 */
export function corsHeaders(origin: string | null | undefined): Record<string, string> {
  if (!isAllowedOrigin(origin)) return { Vary: "Origin" };
  return {
    "Access-Control-Allow-Origin": origin as string,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}
