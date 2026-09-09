/**
 * Où renvoyer le client APRÈS sa connexion.
 *
 * Les pages de l'espace renvoient vers la connexion quand la session manque.
 * Sans mémoire de la destination, tout le monde atterrissait sur l'accueil — y
 * compris celui qui vient de cliquer « Choisir mon créneau de bilan » dans un
 * e-mail. Il se retrouvait devant une page d'accueil, sans savoir que le
 * rendez-vous qu'on lui proposait était deux clics plus loin.
 *
 * ⚠️ Une destination venue de l'URL ne se suit JAMAIS telle quelle. Un lien
 * `?next=https://ailleurs` transformerait notre page de connexion en tremplin :
 * on y arrive avec le logo TIM, on saisit son code, et on ressort sur un site
 * qu'on n'a pas choisi. On n'accepte donc qu'un chemin de NOTRE espace.
 */

/** L'accueil : ce qu'on sert quand la destination demandée n'est pas sûre. */
export const PORTAL_HOME = "/espace-client/accueil";

const ALLOWED = /^\/espace-client\/[a-z0-9/-]*$/i;

/**
 * @returns un chemin de l'espace client, ou l'accueil à défaut.
 *
 * Refusé : une adresse absolue, un autre domaine, `//ailleurs` (que le
 * navigateur lit comme un domaine), un chemin hors de l'espace client, et tout
 * ce qui porte une chaîne de requête ou un fragment — on ne rejoue pas des
 * paramètres qu'on n'a pas écrits.
 */
export const safeNext = (value?: string | null): string => {
  const path = value?.trim();
  if (!path) return PORTAL_HOME;
  if (path.startsWith("//")) return PORTAL_HOME;
  if (/[?#\\]/.test(path)) return PORTAL_HOME;
  if (!ALLOWED.test(path)) return PORTAL_HOME;
  return path;
};
