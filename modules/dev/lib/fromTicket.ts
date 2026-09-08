/**
 * Traduction d'un ticket en développement.
 *
 * Deux tables, faites ici plutôt que laissées à l'utilisateur : la NATURE (une
 * suggestion est une nouvelle fonctionnalité, une demande d'assistance est
 * presque toujours un bug) et l'URGENCE (les quatre niveaux des tickets ont
 * leurs équivalents exacts).
 *
 * Ce sont des points de départ, pas des verdicts : tout reste modifiable dans
 * le formulaire avant création.
 */

/** Type de ticket → type de développement. */
const TYPES: Record<string, string> = {
  suggestion: "feature",
  assistance: "bug",
  autre: "etude",
};

/** Priorité de ticket → priorité de développement (mêmes quatre niveaux). */
const PRIORITIES: Record<string, string> = {
  urgent: "urgente",
  high: "haute",
  normal: "normale",
  low: "basse",
};

/** Un ticket sans type connu part en « bug » : c'est le cas le plus fréquent. */
export const devTypeFromTicket = (ticketType?: string | null): string =>
  TYPES[ticketType ?? ""] ?? "bug";

/** Un ticket sans priorité connue part en « normale » : ne pas inventer d'urgence. */
export const devPriorityFromTicket = (ticketPriority?: string | null): string =>
  PRIORITIES[ticketPriority ?? ""] ?? "normale";
