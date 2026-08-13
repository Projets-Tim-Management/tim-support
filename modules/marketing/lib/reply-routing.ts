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
