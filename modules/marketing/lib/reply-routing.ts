/**
 * Routage des réponses aux e-mails d'un parcours.
 *
 * Les messages du parcours partent de `support@…`. Sans en-tête `Reply-To`, une
 * réponse du client tombe dans cette boîte et n'existe nulle part dans le
 * logiciel : personne ne sait qu'un prospect en test a répondu.
 *
 * On pose donc une adresse de réponse dédiée, `run-<id>@REPLY_DOMAIN`, sur le
 * même principe que les tickets (`ticket-<n>@…`). Brevo Inbound Parsing POSTe le
 * message reçu sur /api/inbound-email, qui reconnaît le motif et raccroche la
 * réponse à un ticket lié au parcours.
 *
 * Sans `REPLY_DOMAIN`, aucune adresse n'est posée : mieux vaut une réponse dans
 * la boîte support qu'une réponse envoyée à un domaine qui n'écoute pas.
 */

/** Adresse de réponse d'un parcours, ou `undefined` si le domaine n'est pas configuré. */
export const journeyReplyTo = (runId: number | string): string | undefined => {
  const domain = process.env.REPLY_DOMAIN;
  return domain ? `run-${runId}@${domain}` : undefined;
};

/**
 * Id du parcours porté par l'un des destinataires, s'il y en a un.
 *
 * Insensible à la casse (les serveurs de messagerie ne préservent pas
 * forcément la casse de la partie locale) et tolérant aux formes
 * `Nom <run-12@…>` déjà aplaties en adresses par l'appelant.
 */
export const extractJourneyRunId = (recipients: string[]): number | null => {
  for (const r of recipients) {
    const m = /run-(\d+)@/i.exec(r);
    if (m) return Number(m[1]);
  }
  return null;
};

/**
 * Adresse de réponse d'un TICKET, jumelle de la précédente.
 *
 * Elle était fabriquée en ligne aux deux endroits qui en posent une, sans garde
 * sur le numéro. Or `number` est attribué par un hook : un ticket relu au mauvais
 * moment n'en porte pas, et l'en-tête devenait « ticket-undefined@… » — une
 * adresse que le webhook entrant ne rattache à rien. La réponse du client
 * disparaissait, alors que sans en-tête elle serait au moins arrivée au support.
 *
 * `undefined` plutôt qu'une adresse approximative, donc : c'est la même règle
 * que pour le domaine absent, et pour la même raison.
 */
export const ticketReplyTo = (number: number | null | undefined): string | undefined => {
  const domain = process.env.REPLY_DOMAIN;
  return domain && number ? `ticket-${number}@${domain}` : undefined;
};

/**
 * Numéro de ticket porté par l'un des destinataires, s'il y en a un.
 *
 * Vit ici, avec la fonction qui FABRIQUE l'adresse : les deux moitiés du couple
 * ne peuvent alors plus diverger sans que le test s'en aperçoive.
 */
export const extractTicketNumber = (recipients: string[]): number | null => {
  for (const r of recipients) {
    const m = /ticket-(\d+)@/i.exec(r);
    if (m) return Number(m[1]);
  }
  return null;
};
