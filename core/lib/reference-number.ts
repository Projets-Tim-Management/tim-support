import type { Payload } from "payload";
import type { CollectionSlug } from "payload";

/**
 * Génère un numéro de référence humain unique (4-5 chiffres) pour une
 * collection donnée. Vérifie l'absence de collision (le champ `number` est
 * `unique`) et réessaie ; repli déterministe très improbable en dernier recours.
 */
export async function generateUniqueReferenceNumber(
  payload: Payload,
  collection: CollectionSlug,
  attempts = 10,
): Promise<number> {
  for (let i = 0; i < attempts; i++) {
    const candidate = Math.floor(Math.random() * 98999) + 1000;
    const existing = await payload.find({
      collection,
      where: { number: { equals: candidate } },
      limit: 1,
      depth: 0,
    });
    if (existing.totalDocs === 0) return candidate;
  }
  // Repli : basé sur l'horodatage (unicité quasi garantie) si 10 tirages
  // aléatoires ont tous collisionné (extrêmement improbable).
  return 100000 + (Date.now() % 900000);
}
