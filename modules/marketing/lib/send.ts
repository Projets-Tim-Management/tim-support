import type { Payload } from "payload";

import { JOURNEY_EMAILS, type JourneyEmailContext } from "@/modules/marketing/lib/emails";
import { buildJourneyContext, type JourneyRunLike } from "@/modules/marketing/lib/journey-context";
import { journeyReplyTo } from "@/modules/marketing/lib/reply-routing";

/**
 * Porte d'entrée unique des e-mails de parcours adressés au client ou au
 * partenaire.
 *
 * Tout passe par ici pour une raison : l'en-tête `Reply-To`. Trois de ces
 * messages demandent explicitement « répondez directement à cet e-mail » — si un
 * seul point d'envoi oublie l'en-tête, cette réponse-là se perd dans la boîte
 * support sans que personne ne sache qu'elle existe.
 *
 * L'envoi marque `sentAt` sur la ligne correspondante du parcours : c'est ce qui
 * empêche le cron quotidien de renvoyer un message déjà parti.
 */

export type SendResult =
  | { sent: true }
  | { sent: false; reason: "no_template" | "no_recipient" | "no_run" | "already_sent" | "send_failed" };

type RunEmailRow = { key?: string; sentAt?: string | null; audience?: string };

/** Parcours OUVERT d'un client, s'il en a un. */
const OPEN = ["preparation", "en-cours"];

export async function findOpenRun(
  payload: Payload,
  clientId: number | string,
): Promise<JourneyRunLike | null> {
  const res = await payload
    .find({
      collection: "journey-runs",
      where: { client: { equals: clientId }, status: { in: OPEN } },
      sort: "-createdAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null);
  return (res?.docs?.[0] as JourneyRunLike | undefined) ?? null;
}

/**
 * Envoie un message du parcours.
 *
 * Le destinataire est DÉDUIT du public de l'envoi (client ou partenaire), jamais
 * passé par l'appelant : c'est ce qui garantit qu'un message destiné au
 * partenaire ne parte pas au client parce qu'un appelant s'est trompé.
 */
export async function sendJourneyEmail(
  payload: Payload,
  args: {
    run: JourneyRunLike;
    key: string;
    /** Complète le contexte calculé (code à usage unique, par exemple). */
    extra?: Partial<JourneyEmailContext>;
    /** Réenvoi volontaire : passe outre le garde-fou « déjà envoyé ». */
    force?: boolean;
  },
): Promise<SendResult> {
  const { run, key, extra, force } = args;

  const template = JOURNEY_EMAILS[key];
  if (!template) return { sent: false, reason: "no_template" };

  // On relit le parcours : `run` peut venir d'un hook et porter un état déjà
  // dépassé, or `sentAt` est précisément ce qu'on ne veut pas lire périmé.
  const fresh = (await payload
    .findByID({ collection: "journey-runs", id: run.id, depth: 0, overrideAccess: true })
    .catch(() => null)) as (JourneyRunLike & { emails?: RunEmailRow[] }) | null;
  if (!fresh) return { sent: false, reason: "no_run" };

  const rows = fresh.emails ?? [];
  const row = rows.find((e) => e.key === key);
  if (row?.sentAt && !force) return { sent: false, reason: "already_sent" };

  const { ctx, clientEmail, partnerEmail } = await buildJourneyContext(payload, fresh);
  const to = row?.audience === "partenaire" ? partnerEmail : clientEmail;
  if (!to) return { sent: false, reason: "no_recipient" };

  const built = template({ ...ctx, ...extra });

  try {
    await payload.sendEmail({
      to,
      subject: built.subject,
      html: built.html,
      text: built.text,
      // Une réponse revient dans le logiciel, rattachée à CE parcours.
      ...(journeyReplyTo(fresh.id) ? { replyTo: journeyReplyTo(fresh.id) } : {}),
    });
  } catch (err) {
    payload.logger.error(`[parcours] envoi de « ${key} » à ${to} échoué : ${err}`);
    return { sent: false, reason: "send_failed" };
  }

  // Le marquage est secondaire : l'e-mail est parti. Un échec ici ne doit pas
  // faire remonter une erreur qui laisserait croire le contraire — au pire le
  // message repartira une fois, ce qui vaut mieux que de croire qu'il est parti.
  if (row) {
    await payload
      .update({
        collection: "journey-runs",
        id: fresh.id,
        data: {
          emails: rows.map((e) => (e.key === key ? { ...e, sentAt: new Date().toISOString() } : e)),
        } as never,
        overrideAccess: true,
      })
      .catch(() => undefined);
  }

  payload.logger.info(`[parcours] « ${key} » envoyé à ${to} (parcours ${fresh.id}).`);
  return { sent: true };
}

/**
 * Marque un envoi comme parti, pour les alertes INTERNES (destinataires admin)
 * qui ne passent pas par `sendJourneyEmail`.
 *
 * Sans ce marquage, la ligne resterait « à envoyer » sur la fiche : l'écran
 * annoncerait un message en attente alors qu'il est déjà dans les boîtes.
 */
export async function markJourneyEmailSent(
  payload: Payload,
  runId: number | string,
  key: string,
): Promise<void> {
  try {
    const fresh = (await payload.findByID({
      collection: "journey-runs",
      id: runId,
      depth: 0,
      overrideAccess: true,
    })) as { emails?: RunEmailRow[] } | null;

    const rows = fresh?.emails ?? [];
    if (!rows.some((e) => e.key === key && !e.sentAt)) return;

    await payload.update({
      collection: "journey-runs",
      id: runId,
      data: {
        emails: rows.map((e) => (e.key === key ? { ...e, sentAt: new Date().toISOString() } : e)),
      } as never,
      overrideAccess: true,
    });
  } catch {
    // Marquage secondaire : l'e-mail, lui, est bien parti.
  }
}

/**
 * Raccourci pour les hooks : « ce client vient de faire X, envoie-lui Y ».
 *
 * Silencieux par construction — comme `armAutoStep`. Aucun parcours ouvert, ou
 * un envoi qui échoue, ne doit faire échouer le geste métier qui l'a déclenché :
 * on ne refuse pas la création d'un compte parce qu'un serveur SMTP tousse.
 */
export async function sendJourneyEmailForClient(
  payload: Payload,
  clientId: number | string,
  key: string,
  extra?: Partial<JourneyEmailContext>,
): Promise<SendResult> {
  try {
    const run = await findOpenRun(payload, clientId);
    if (!run) return { sent: false, reason: "no_run" };
    return await sendJourneyEmail(payload, { run, key, extra });
  } catch (err) {
    payload.logger.error(`[parcours] envoi de « ${key} » au client ${clientId} échoué : ${err}`);
    return { sent: false, reason: "send_failed" };
  }
}

/**
 * Récapitulatif hebdomadaire d'un partenaire.
 *
 * Envoyé UNE fois par partenaire, pas une fois par parcours : le message parle
 * de l'ensemble de ses phases de test, et en recevoir trois le même lundi le
 * pousserait à n'en lire aucun.
 *
 * Il ne passe donc pas par `sendJourneyEmail`, qui raisonne par parcours et
 * marquerait `sentAt` — or ce message est RÉCURRENT : le marquer comme envoyé
 * l'empêcherait de repartir la semaine suivante.
 *
 * Pas de `Reply-To` de parcours non plus : le message en couvre plusieurs, une
 * réponse n'appartiendrait à aucun. Elle arrive au support, ce qui est correct.
 */
export async function sendPartnerWeeklyRecap(
  payload: Payload,
  partner: { id: number | string; email?: string | null },
  runs: Array<{ clientName: string; currentStep?: string | null; endDate?: string | null }>,
): Promise<SendResult> {
  const template = JOURNEY_EMAILS["recap-partenaire"];
  if (!template) return { sent: false, reason: "no_template" };
  if (!partner.email) return { sent: false, reason: "no_recipient" };
  if (runs.length === 0) return { sent: false, reason: "no_run" };

  const today = Date.now();
  const built = template({
    partnerRuns: runs.map((r) => ({
      clientName: r.clientName,
      currentStep: r.currentStep ?? null,
      endDate: r.endDate ?? null,
      daysLeft: r.endDate
        ? Math.ceil((Date.parse(r.endDate) - today) / 86_400_000)
        : null,
    })),
  });

  try {
    await payload.sendEmail({
      to: partner.email,
      subject: built.subject,
      html: built.html,
      text: built.text,
    });
  } catch (err) {
    payload.logger.error(`[parcours] récap hebdo du partenaire ${partner.id} échoué : ${err}`);
    return { sent: false, reason: "send_failed" };
  }

  payload.logger.info(
    `[parcours] récap hebdo envoyé au partenaire ${partner.id} (${runs.length} phase(s)).`,
  );
  return { sent: true };
}
