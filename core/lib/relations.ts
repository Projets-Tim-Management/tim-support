/**
 * Helpers pour manipuler les champs de relation Payload.
 */

/** id d'une relation, qu'elle soit peuplée ({id}) ou brute (number). */
export const relId = (v: unknown): number | null =>
  (v && typeof v === "object" ? (v as { id: number }).id : (v as number)) ?? null;

/** Pareil, sans présumer du type de l'id (nombre ou texte). */
export const idOf = (v: unknown): number | string | null =>
  v && typeof v === "object" ? ((v as { id?: number | string }).id ?? null) : ((v as number | string) ?? null);
