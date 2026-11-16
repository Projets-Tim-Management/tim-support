/**
 * Les petits calculs partagés par les analyses, l'équipe IA et les
 * connecteurs (relecture du 12/11/2026 : recopiés dans une dizaine de
 * fichiers). Purs, sans dépendance : utilisables partout, client compris.
 */

export const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Un nombre lu en base ou dans une API (nombre, texte numérique, ou rien). */
export const num = (v: unknown): number => (typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0);

/** « 1 234 € » — les montants des phrases (messages, constats, demandes). */
export const money = (n: number, decimals = 0) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })} €`;

/** Pour mettre un texte libre (un nom, un mot de marque) dans une expression régulière. */
export const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
