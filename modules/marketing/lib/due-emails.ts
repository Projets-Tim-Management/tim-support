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

/**
 * Les envois qui dépendent d'un FAIT, pas seulement d'une date.
 *
 * Une relance n'a de sens que tant que la chose reste à faire. Envoyée après
 * coup, elle ne se contente pas d'être inutile : elle apprend au client que nos
 * messages ne regardent pas ce qu'il a fait, et lui donne une bonne raison de ne
 * plus lire les suivants. La même règle vaut pour l'invitation initiale — un
 * client qui a réservé dès le premier jour n'a pas à recevoir « réservez votre
 * créneau » une semaine plus tard.
 *
 * Table plutôt que `if` dans le cron : c'est ici qu'on lit, d'un coup d'œil, ce
 * que chaque message exige pour partir.
 */
export type SendFacts = {
  /** Créneau de prise en main réservé (date ISO) ou non. */
  sessionAt?: string | null;
  /** État du dossier de démarrage côté fiche client. */
  onboardingStatus?: string | null;
  /** Nombre d'accès de test créés. */
  credentialCount?: number;
};

const DOSSIER_DONE = ["transmis", "valide"];

export const SEND_CONDITIONS: Record<string, (f: SendFacts) => boolean> = {
  // Invitation et relance : inutiles dès qu'un créneau existe.
  "prise-en-main": (f) => !f.sessionAt,
  "relance-creneau": (f) => !f.sessionAt,
  // Relance dossier : inutile dès qu'il est transmis (a fortiori validé).
  "relance-dossier": (f) => !DOSSIER_DONE.includes(f.onboardingStatus ?? ""),
  // Remise des accès : ils doivent exister (règle historique, reprise ici).
  [ACCESS_EMAIL_KEY]: (f) => accessEmailReady(f.credentialCount ?? 0),
};

/**
 * L'envoi est-il encore justifié ? `true` pour tout message sans condition —
 * l'absence de règle ne doit jamais bloquer un envoi.
 */
export const shouldStillSend = (key: string | null | undefined, facts: SendFacts): boolean =>
  key && SEND_CONDITIONS[key] ? SEND_CONDITIONS[key](facts) : true;

// ─── Cadences calées sur l'heure de Paris ────────────────────────────────────

/**
 * Jour et heure à PARIS, lus en une fois.
 *
 * Tout ce qui se répète ici se compare en heure locale, jamais en UTC : le
 * décalage change deux fois par an, et une comparaison en UTC ferait glisser
 * chaque cadence d'une heure au printemps — assez pour tomber systématiquement
 * à côté du bon passage horaire.
 */
const aParis = (ms: number): { jour: string; heure: number } => {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Paris",
    weekday: "short",
    hour: "2-digit",
    hour12: false,
  }).formatToParts(new Date(ms));
  return {
    jour: parts.find((p) => p.type === "weekday")?.value ?? "",
    heure: Number(parts.find((p) => p.type === "hour")?.value),
  };
};

/**
 * L'alerte qui accompagne un envoi RETENU.
 *
 * Le cron retient « Vos accès TIM sont prêts » tant qu'aucun identifiant
 * n'existe, et prévient l'équipe — sans quoi la rétention serait silencieuse et
 * personne ne créerait les comptes. Mais l'alerte partait à chaque passage :
 * cron horaire × 36 h de rattrapage = jusqu'à trente-six e-mails à tous les
 * admins pour un seul client. On apprend vite à les fermer sans les lire.
 *
 * Elle se cale donc sur l'HEURE de l'envoi qu'elle remplace : elle dit « ce
 * message devait partir maintenant », ce qui est à la fois son sens exact et,
 * le cron passant une fois par heure, sa garantie d'unicité — une par jour tant
 * que la rétention dure, soit le rythme d'avant la bascule en cron horaire.
 */
export const isRetentionAlertDue = (
  nowMs: number,
  scheduledAt: string | null | undefined,
): boolean => {
  if (!scheduledAt) return false;
  const prevu = Date.parse(scheduledAt);
  if (Number.isNaN(prevu)) return false;

  const maintenant = aParis(nowMs);
  return Number.isFinite(maintenant.heure) && maintenant.heure === aParis(prevu).heure;
};

// ─── Récapitulatif hebdomadaire du partenaire ────────────────────────────────

/** Clé du récapitulatif, partagée entre le modèle, le cron et le test. */
export const PARTNER_RECAP_KEY = "recap-partenaire";

/**
 * Le seul message RÉCURRENT du parcours — et donc le seul dont la
 * non-duplication ne peut pas reposer sur `sentAt`.
 *
 * Le marquer l'empêcherait de repartir la semaine suivante : c'est justement ce
 * qui le distingue des autres. Sa cadence tient donc entièrement à cette
 * condition, et il faut qu'elle soit exacte.
 *
 * ⚠️ Tester le seul JOUR ne suffit pas depuis que le cron est horaire (il l'est
 * devenu pour honorer les `sendHour` des envois datés). « Sommes-nous lundi ? »
 * reste vrai vingt-quatre fois, et chaque partenaire recevait vingt-quatre fois
 * le même récapitulatif. Rien en base ne pouvait le montrer — faute, encore, de
 * marquage.
 *
 * On compare donc le jour ET l'heure, en heure de PARIS. Le cron passant une
 * fois par heure, exactement un passage par lundi satisfait la condition, quelle
 * que soit la saison — un décalage codé en dur aurait raté six mois sur douze.
 *
 * @param sendHour heure déclarée dans le modèle (« HH:mm »), pour que déplacer
 *                 le récapitulatif se fasse à un seul endroit.
 */
export const isPartnerRecapDue = (nowMs: number, sendHour: string): boolean => {
  const { jour, heure } = aParis(nowMs);
  return jour === "Mon" && Number.isFinite(heure) && heure === Number(sendHour.split(":")[0]);
};
