/**
 * L'identifiant d'une relation Payload, qu'elle arrive peuplée (objet) ou non
 * (nombre, texte) ; null si elle est vide. Pure.
 */
export const idOf = (v: unknown): number | null => (v && typeof v === "object" ? Number((v as { id: unknown }).id) : v == null ? null : Number(v));
