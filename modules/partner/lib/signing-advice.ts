/**
 * Faut-il relancer le client sur sa signature ? La réponse, en une phrase, à
 * partir du DERNIER e-mail qui lui demandait de signer (invitation, document
 * disponible, relance) et de ce que Brevo en a fait.
 *
 * Un conseil, jamais un envoi : la relance reste un geste, avec aperçu, depuis
 * l'onglet « Signature » (voir signing-reminder) — c'est celui qui suit
 * l'affaire qui sait si le client réfléchit ou a oublié.
 */

/** Les e-mails qui demandent au client de signer : ceux après lesquels on attend un geste. */
export const ASKS_TO_SIGN = ["invitation-signature", "document-disponible", "relance-signature"];

/** Délai avant de conseiller une relance : trois jours, le temps de lire et de faire circuler en interne. */
export const RELANCE_AFTER_DAYS = 3;

export type SignedMailState = {
  /** Date d'envoi (ou du dernier évènement Brevo). */
  at: string;
  /** Ce que Brevo en dit : envoye, remis, ouvert, clique, echec… */
  sort: string;
};

export type SigningAdvice = { tone: "ok" | "info" | "warn" | "bad"; text: string };

const DAY = 86_400_000;
const dayLabel = (d: Date) => d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: "Europe/Paris" });

export function signingAdvice(signed: boolean, last: SignedMailState | null, now: Date = new Date()): SigningAdvice {
  if (signed) return { tone: "ok", text: "Le contrat est signé : rien à relancer." };
  if (!last) return { tone: "warn", text: "Aucun e-mail de signature n'est encore parti : ouvrez l'accès du client et invitez-le (onglet « Signature »)." };
  if (last.sort === "echec") {
    return { tone: "bad", text: "Le dernier e-mail a été rejeté par la messagerie du client : vérifiez son adresse, puis renvoyez l'invitation." };
  }
  const sent = Date.parse(last.at);
  const days = Math.floor((now.getTime() - sent) / DAY);
  if (days < RELANCE_AFTER_DAYS) {
    return {
      tone: "info",
      text: `Dernier e-mail ${days === 0 ? "aujourd'hui" : days === 1 ? "hier" : `il y a ${days} jours`} : laissez-lui le temps. Une relance est conseillée à partir du ${dayLabel(new Date(sent + RELANCE_AFTER_DAYS * DAY))} s'il n'a pas signé.`,
    };
  }
  const opened = last.sort === "ouvert" || last.sort === "clique";
  return opened
    ? { tone: "warn", text: `Ouvert, mais pas signé depuis ${days} jours : une relance avec un mot personnel peut débloquer (onglet « Signature » → Relancer).` }
    : { tone: "warn", text: `Pas ouvert depuis ${days} jours : relancez le client (onglet « Signature » → Relancer), ou appelez-le — l'e-mail est peut-être en indésirables.` };
}
