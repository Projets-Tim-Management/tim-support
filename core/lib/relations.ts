/**
 * Helpers pour manipuler les champs de relation Payload.
 */

/** id d'une relation, qu'elle soit peuplée ({id}) ou brute (number). */
export const relId = (v: unknown): number | null =>
  (v && typeof v === "object" ? (v as { id: number }).id : (v as number)) ?? null;
