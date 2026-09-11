import { adminUrl, internalNotice } from "@/core/lib/email-template";
import { aParis } from "@/modules/marketing/lib/due-emails";
import { stepDueDate } from "@/modules/marketing/lib/journey";
import { TIMEZONE as PARIS } from "@/modules/marketing/lib/scheduling";

/**
 * « Vous avez une action à faire sur cette phase de test. »
 *
 * Six étapes du parcours attendent le PARTENAIRE — les quatre relevés d'usage,
 * la session de prise en main, le bilan. Elles portaient une échéance qui ne
 * servait qu'à dessiner la barre d'étapes : personne n'était prévenu le jour
 * venu. Le seul message reçu par un partenaire était le récapitulatif du lundi,
 * qui dit où en sont ses phases — pas ce qu'il doit faire aujourd'hui. Une
 * étape se découvrait donc en ouvrant la fiche, par hasard, et un parcours
 * pouvait rester bloqué des jours sur une action que personne ne réclamait.
 *
 * Le message dit trois choses, dans cet ordre : QUI appeler (avec son numéro),
 * QUOI faire (l'intitulé de l'étape et son détail), et où aller la valider.
 *
 * UN message par parcours, pas par étape. Deux relevés en retard sur le même
 * client, c'est un seul appel : deux e-mails feraient croire à deux clients. Et
 * un partenaire qui suit trois phases reçoit trois messages — chacun porte un
 * client, un numéro, un lien, et se traite séparément.
 *
 * `notifiedAt` est posé sur CHAQUE étape annoncée : c'est ce qui empêche le
 * cron horaire de répéter le même message toutes les heures. Une étape n'est
 * donc annoncée qu'une fois ; passé cet envoi, elle reste visible sur la fiche
 * et dans le récapitulatif du lundi.
 */

export type PartnerStep = {
  key?: string | null;
  label?: string | null;
  state?: string | null;
  actor?: string | null;
  detail?: string | null;
  anchor?: string | null;
  offsetDays?: number | null;
  autoValidate?: boolean | null;
  notifiedAt?: string | null;
};

export type StepSkipReason =
  | "not_partner"
  | "already_done"
  | "blocked"
  | "auto"
  | "already_notified"
  | "no_date"
  | "not_due";

export type DueStep = { step: PartnerStep; due: string; lateDays: number };

export type StepDecision = ({ notify: true } & DueStep) | { notify: false; reason: StepSkipReason };

/**
 * Heure d'envoi, à Paris.
 *
 * Une échéance tombe à minuit ; le cron passe toutes les heures. Sans cette
 * condition, l'alerte partait à 1 h du matin — l'heure où l'on est le moins
 * susceptible d'appeler une entreprise, et celle où le message aura été enterré
 * sous le reste au réveil. 8 h, comme le récapitulatif du lundi : c'est le
 * moment où l'on organise sa journée.
 */
const PARTNER_STEP_SEND_HOUR = 8;

export const isPartnerStepHour = (nowMs: number): boolean =>
  aParis(nowMs).heure === PARTNER_STEP_SEND_HOUR;

/**
 * Faut-il annoncer cette étape ?
 *
 * Pure et testée à part : c'est la règle qui décide qu'un partenaire reçoit un
 * message, et elle ne doit pas dépendre de l'ordre des lectures du cron.
 *
 * Une étape BLOQUÉE n'est pas annoncée : quelqu'un a constaté qu'elle ne peut
 * pas se faire, et lui réclamer l'action serait contredire ce constat. Une étape
 * à validation AUTOMATIQUE non plus : elle n'attend personne.
 *
 * Pas de limite de retard, contrairement aux messages du parcours : ceux-là
 * mentent quand ils arrivent tard (« vos accès sont prêts » trois jours après),
 * celui-ci reste vrai — une action en retard est justement celle qu'il faut
 * réclamer.
 */
export const decidePartnerStep = (
  step: PartnerStep,
  ctx: {
    startDate?: string | null;
    endDate?: string | null;
    sessionAt?: string | null;
    nowMs: number;
  },
): StepDecision => {
  if (step.actor !== "partenaire") return { notify: false, reason: "not_partner" };
  if (step.state === "fait") return { notify: false, reason: "already_done" };
  if (step.state === "bloque") return { notify: false, reason: "blocked" };
  if (step.autoValidate === true || step.state === "auto") return { notify: false, reason: "auto" };
  if (step.notifiedAt) return { notify: false, reason: "already_notified" };

  const due = stepDueDate(step, ctx.startDate, ctx.endDate, ctx.sessionAt);
  if (!due) return { notify: false, reason: "no_date" };
  const at = Date.parse(due);
  if (Number.isNaN(at)) return { notify: false, reason: "no_date" };
  if (at > ctx.nowMs) return { notify: false, reason: "not_due" };

  return { notify: true, step, due, lateDays: Math.floor((ctx.nowMs - at) / 86_400_000) };
};

/** Les étapes à annoncer sur ce parcours, dans l'ordre du déroulé. */
export const partnerStepsDue = (
  run: {
    steps?: PartnerStep[] | null;
    startDate?: string | null;
    endDate?: string | null;
    sessionAt?: string | null;
  },
  nowMs: number,
): DueStep[] => {
  const out: DueStep[] = [];
  for (const step of run.steps ?? []) {
    const decision = decidePartnerStep(step, {
      startDate: run.startDate,
      endDate: run.endDate,
      sessionAt: run.sessionAt,
      nowMs,
    });
    if (decision.notify) out.push({ step: decision.step, due: decision.due, lateDays: decision.lateDays });
  }
  return out;
};

/** « aujourd'hui », « en retard de 3 jours » — le délai avant l'intitulé. */
const delay = (lateDays: number): string =>
  lateDays <= 0
    ? "aujourd'hui"
    : lateDays === 1
      ? "depuis hier"
      : `en retard de ${lateDays} jours`;

/**
 * ⚠️ `timeZone` n'est pas décoratif — même règle que les e-mails du parcours.
 *
 * Ce message part d'un cron Vercel, qui tourne en UTC. Sans fuseau explicite,
 * une échéance stockée en fin de journée s'annonçait la VEILLE : « prévue le
 * 8 septembre » pour une étape due le 9. Le partenaire appelle alors son client
 * en croyant être en retard, ou range l'alerte comme périmée.
 */
const frDate = (iso?: string | null): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? null
    : d.toLocaleDateString("fr-FR", { timeZone: PARIS, day: "numeric", month: "long" });
};

export type StepContact = {
  name?: string | null;
  role?: string | null;
  phone?: string | null;
  email?: string | null;
};

export const buildPartnerStepEmail = (args: {
  runId: number | string;
  clientId?: number | string | null;
  clientName?: string | null;
  steps: DueStep[];
  contact?: StepContact | null;
  endDate?: string | null;
  nowMs?: number;
}): { subject: string; html: string; text: string } => {
  const client = args.clientName?.trim() || "un client";
  const count = args.steps.length;
  const now = args.nowMs ?? Date.now();

  const subject =
    count === 1
      ? `${client} — ${args.steps[0].step.label ?? "une étape"} à faire`
      : `${client} — ${count} actions à faire sur la phase de test`;

  /**
   * Le CONTACT en tête, avec son numéro : ces étapes se font au téléphone, et
   * chercher le bon interlocuteur dans la fiche est précisément le travail qu'un
   * message d'alerte doit éviter.
   */
  const who = [args.contact?.name?.trim(), args.contact?.role?.trim()]
    .filter(Boolean)
    .join(" — ");

  const daysLeft =
    args.endDate && !Number.isNaN(Date.parse(args.endDate))
      ? Math.ceil((Date.parse(args.endDate) - now) / 86_400_000)
      : null;

  const rows: [string, string][] = [
    ["Client", client],
    ...(who ? ([["À contacter", who]] as [string, string][]) : []),
    ...(args.contact?.phone?.trim()
      ? ([["Téléphone", args.contact.phone.trim()]] as [string, string][])
      : []),
    ...(args.contact?.email?.trim()
      ? ([["E-mail", args.contact.email.trim()]] as [string, string][])
      : []),
    ...(daysLeft != null
      ? ([
          [
            "Phase de test",
            daysLeft < 0
              ? "terminée"
              : daysLeft === 0
                ? "dernier jour"
                : `${daysLeft} jour${daysLeft > 1 ? "s" : ""} restant${daysLeft > 1 ? "s" : ""}`,
          ],
        ] as [string, string][])
      : []),
  ];

  // Le détail de l'étape dit ce qu'il y a à faire (« se connecter au compte du
  // client et noter ce qu'il constate ») : sans lui, l'intitulé seul oblige à
  // ouvrir la fiche pour comprendre — ce qu'on cherche justement à éviter.
  const lignes = args.steps.map((d) => {
    const quand = delay(d.lateDays);
    const prevu = frDate(d.due);
    const tete = `${d.step.label ?? "Étape"} — ${quand}${prevu && d.lateDays > 0 ? ` (prévue le ${prevu})` : ""}`;
    return d.step.detail?.trim() ? `${tete}\n${d.step.detail.trim()}` : tete;
  });

  const message = lignes.join("\n\n");
  const runUrl = adminUrl(`/collections/journey-runs/${args.runId}`);
  const clientUrl =
    args.clientId != null ? adminUrl(`/collections/partner-clients/${args.clientId}`) : null;

  return {
    subject,
    html: internalNotice({
      audience: "partenaire",
      kicker: "Phase de test",
      heading: count === 1 ? "Une action vous attend" : `${count} actions vous attendent`,
      rows,
      message,
      cta: { label: "Ouvrir le parcours et valider", url: runUrl },
      links: clientUrl ? [{ label: "Fiche client", url: clientUrl }] : [],
    }),
    text: [
      count === 1 ? "Une action vous attend sur une phase de test." : `${count} actions vous attendent sur une phase de test.`,
      "",
      ...rows.map(([k, v]) => `${k} : ${v}`),
      "",
      message,
      "",
      "Valider l'étape :",
      runUrl,
      ...(clientUrl ? ["", "Fiche client :", clientUrl] : []),
    ].join("\n"),
  };
};
