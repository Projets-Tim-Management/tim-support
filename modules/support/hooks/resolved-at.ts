import type { CollectionBeforeChangeHook } from "payload";

/**
 * Horodate le passage d'un ticket au statut « Résolu » (champ `resolvedAt`).
 * Sert de point de départ à la purge des pièces jointes après 30 jours
 * (voir app/(frontend)/api/cron/cleanup-tickets). Réinitialisé si le ticket
 * est ré-ouvert (statut ≠ résolu).
 */
export const stampResolvedAt: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  const status = data.status ?? originalDoc?.status;
  if (status === "resolved") {
    if (!(data.resolvedAt ?? originalDoc?.resolvedAt)) {
      data.resolvedAt = new Date().toISOString();
    }
    // Résolu → ne réclame plus d'action (retire les badges), sauf si l'appelant
    // force explicitement la valeur (ex. réponse client concomitante).
    if (data.needsAttention === undefined) data.needsAttention = false;
    if (data.unreadClientReply === undefined) data.unreadClientReply = false;
  } else if (status) {
    data.resolvedAt = null;
  }
  return data;
};
