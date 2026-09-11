import type { CollectionBeforeChangeHook } from "payload";

/**
 * Le fil d'un ticket ne PERD jamais de message à l'enregistrement.
 *
 * Le fil est écrit par des routes (réponse du support, e-mail entrant) qui le
 * relisent toujours à jour. La fiche du back-office, elle, le garde en mémoire
 * tel qu'il était à son ouverture — il est caché, personne ne le touche, mais
 * Payload le renvoie quand même en entier à chaque « Sauvegarder ». Répondre
 * depuis la vue du ticket puis changer le statut et enregistrer renvoyait donc
 * l'ANCIEN fil, et la réponse qu'on venait d'envoyer disparaissait de
 * l'historique. Constaté sur le ticket #59321 le 11/09/2026.
 *
 * Règle : un message présent en base et absent de ce qu'on enregistre est
 * REMIS — à sa place dans l'ordre chronologique. Les nouveaux messages passent,
 * les corrections sur un message existant aussi ; seule la disparition est
 * refusée. Un retrait volontaire n'existe pas dans le logiciel : la purge des
 * pièces jointes (cleanup-tickets) garde les lignes et vide leurs fichiers.
 */
type Message = { id?: string | number | null; sentAt?: string | null; [k: string]: unknown };

export const keepMessagesOnSave = (
  incoming: Message[] | null | undefined,
  original: Message[] | null | undefined,
): Message[] | null | undefined => {
  if (!Array.isArray(incoming) || !Array.isArray(original) || original.length === 0) return incoming;
  const present = new Set(incoming.map((m) => (m?.id != null ? String(m.id) : null)).filter(Boolean));
  const missing = original.filter((m) => m?.id != null && !present.has(String(m.id)));
  if (missing.length === 0) return incoming;
  const at = (m: Message) => (m.sentAt ? Date.parse(m.sentAt) : 0) || 0;
  return [...incoming, ...missing].sort((a, b) => at(a) - at(b));
};

export const keepMessages: CollectionBeforeChangeHook = ({ data, originalDoc }) => {
  if (!data || !("messages" in data)) return data;
  data.messages = keepMessagesOnSave(
    data.messages as Message[] | null | undefined,
    originalDoc?.messages as Message[] | null | undefined,
  );
  return data;
};

/**
 * Les drapeaux « à traiter » ne se TOUCHENT jamais depuis une fiche.
 *
 * `needsAttention` et `unreadClientReply` sont cachés dans le back-office : ce
 * sont des faits que posent les routes (e-mail entrant → allumé ; réponse du
 * support → éteint) et la résolution (voir stampResolvedAt). Mais la fiche les
 * garde en mémoire tels qu'ils étaient à son ouverture, et les renvoie à chaque
 * « Sauvegarder » — dans les deux sens :
 *  - répondre depuis la vue du ticket (drapeaux éteints) puis enregistrer la
 *    fiche les RALLUMAIT : la notification restait là (#59321, 11/09/2026) ;
 *  - un e-mail du client arrivé pendant que la fiche est ouverte (drapeaux
 *    allumés) puis un enregistrement les ÉTEIGNAIT : la réponse était enterrée
 *    sans badge.
 *
 * Règle : avec un utilisateur aux commandes, les drapeaux transmis sont
 * IGNORÉS — la base garde les siens. Sans utilisateur (webhook, route de
 * réponse, cron), tout est permis. La résolution éteint toujours (le hook
 * suivant ne le fait que si le champ est absent : c'est justement le cas).
 */
export const keepAttentionFlags = (
  data: Record<string, unknown>,
  original: Record<string, unknown> | null | undefined,
  byUser: boolean,
): Record<string, unknown> => {
  if (!byUser || !original) return data;
  for (const flag of ["needsAttention", "unreadClientReply"] as const) {
    if (flag in data) delete data[flag];
  }
  return data;
};

export const guardAttentionFlags: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  if (!data) return data;
  return keepAttentionFlags(data, originalDoc, Boolean(req.user));
};
