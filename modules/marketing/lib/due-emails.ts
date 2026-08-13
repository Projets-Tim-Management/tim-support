/**
 * Qui doit partir maintenant, et qui ne doit surtout pas.
 *
 * Fonction PURE, isolée du cron : décider d'envoyer un message à un prospect est
 * la partie du système où une erreur se voit — et elle ne se teste pas si elle
 * est mêlée à des appels réseau.
 *
 * Quatre règles, toutes fondées sur le même principe : mieux vaut ne rien
 * envoyer qu'envoyer à contretemps.
 */

/** Parcours clos : plus rien ne part. Un test perdu ne reçoit pas « votre test se termine ». */
export const CLOSED_STATUSES = ["gagne", "perdu", "annule"];

/**
 * Au-delà de ce retard, l'envoi est abandonné plutôt que rattrapé.
 *
 * 36 h couvre une panne d'une nuit ou un week-end de cron manqué. Au-delà, le
 * message ment : « vos accès sont prêts » trois jours après le démarrage, ou
 * « votre test se termine dans 5 jours » alors qu'il en reste deux. Un silence
 * se rattrape par un appel ; un message faux se rattrape mal.
 */
export const LATE_GRACE_HOURS = 36;

export type DueReason =
  | "run_closed"
  | "already_sent"
  | "no_date"
  | "not_due"
  | "too_late"
  | "no_template";

export type DueDecision = { send: true } | { send: false; reason: DueReason };

export type ScheduledEmail = {
  key?: string | null;
  scheduledAt?: string | null;
  sentAt?: string | null;
  audience?: string | null;
};

export function decideEmail(
  mail: ScheduledEmail,
  runStatus: string | null | undefined,
  nowMs: number,
  hasTemplate: (key: string) => boolean,
): DueDecision {
  if (!mail.key || !hasTemplate(mail.key)) return { send: false, reason: "no_template" };
  // Le statut prime sur tout le reste : un parcours clos ne parle plus.
  if (runStatus && CLOSED_STATUSES.includes(runStatus)) return { send: false, reason: "run_closed" };
  if (mail.sentAt) return { send: false, reason: "already_sent" };
  // Date vidée = « ne pas envoyer », choix explicite pris dans la barre d'étapes.
  if (!mail.scheduledAt) return { send: false, reason: "no_date" };

  const at = Date.parse(mail.scheduledAt);
  if (Number.isNaN(at)) return { send: false, reason: "no_date" };
  if (at > nowMs) return { send: false, reason: "not_due" };
  if (nowMs - at > LATE_GRACE_HOURS * 3_600_000) return { send: false, reason: "too_late" };

  return { send: true };
}

/**
 * Les accès ne partent que s'ils EXISTENT.
 *
 * « acces-prets » annonce des identifiants et invite à s'en servir le jour même.
 * L'envoyer alors que TIM n'a pas encore créé les comptes produit exactement la
 * mauvaise première impression, un lundi matin, devant les équipes réunies. On
 * retient donc l'envoi et on alerte TIM — le message repartira dès que les accès
 * seront là, dans la fenêtre de rattrapage.
 */
export const ACCESS_EMAIL_KEY = "acces-prets";

export const accessEmailReady = (credentialCount: number): boolean => credentialCount > 0;
