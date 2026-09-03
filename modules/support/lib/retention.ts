/**
 * Rétention des fichiers d'un ticket.
 *
 * Les pièces d'un ticket vivent sur Vercel Blob et s'accumulent : captures
 * d'écran, exports, PDF reçus par e-mail. On les supprime donc un mois après la
 * résolution — le ticket et sa conversation, eux, restent.
 *
 * La durée et la liste des fichiers concernés vivent ICI, pas dans le cron :
 * l'écran l'annonce à l'utilisateur (« purgés 30 jours après la résolution »),
 * et deux valeurs écrites séparément finissent par diverger — l'écran
 * promettrait alors une chose que la purge ne fait pas.
 */

export const TICKET_RETENTION_DAYS = 30;

/** Un ticket, réduit à ce qui porte des fichiers. */
export type PurgeableTicket = {
  attachments?: unknown[];
  messages?: Array<{ attachments?: unknown[] }>;
  documents?: Array<{ file?: unknown }>;
};

/**
 * Tous les médias d'un ticket, dédoublonnés — trois sources, et il ne faut en
 * oublier aucune :
 *
 *  - `attachments` : ce que le demandeur a joint à l'ouverture ;
 *  - `messages[].attachments` : ce qui a circulé dans le fil ;
 *  - `documents[].file` : ce que le support a déposé lui-même.
 *
 * @param relId lit l'identifiant d'un lien Payload, résolu (objet) ou non.
 */
export const ticketMediaIds = (
  ticket: PurgeableTicket,
  relId: (value: unknown) => number | null | undefined,
): number[] => {
  const ids = new Set<number>();
  const ajoute = (value: unknown) => {
    const id = relId(value);
    if (id) ids.add(id);
  };

  (ticket.attachments ?? []).forEach(ajoute);
  (ticket.messages ?? []).forEach((m) => (m.attachments ?? []).forEach(ajoute));
  (ticket.documents ?? []).forEach((d) => ajoute(d.file));

  return [...ids];
};
