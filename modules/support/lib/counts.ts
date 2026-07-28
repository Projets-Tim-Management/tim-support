/**
 * Compteurs de tickets « à traiter », lus via l'API REST Payload.
 * Source unique partagée par les deux composants de notification admin
 * (NavNotifications dans le menu, TicketNotifications sur le dashboard) :
 * garantit que le compte ET les liens pré-filtrés utilisent les mêmes filtres.
 */

// Filtres réutilisés pour le compte ET le lien (cohérence garantie).
export const REPLIES = "where[unreadClientReply][equals]=true";
export const NEWS =
  "where[and][0][needsAttention][equals]=true&where[and][1][unreadClientReply][not_equals]=true&where[and][2][status][not_equals]=resolved";
export const URGENT = "where[priority][equals]=urgent&where[status][not_equals]=resolved";

/** Nombre de tickets correspondant à un filtre REST (0 en cas d'erreur). */
export async function countTickets(query: string): Promise<number> {
  try {
    const res = await fetch(`/payload-api/tickets?${query}&limit=1&depth=0`, {
      credentials: "include",
    });
    const data = res.ok ? await res.json() : { totalDocs: 0 };
    return Number(data.totalDocs) || 0;
  } catch {
    return 0;
  }
}
