import type { Payload } from "payload";

import { isSuppressed, unsubscribeHeaders, unsubscribeUrl } from "@/core/lib/email-suppression";
import { besoinsOf, enrollInSequence } from "@/modules/marketing/lib/enroll";
import type { SequenceDoc } from "@/modules/marketing/lib/sequences";
import { buildSequenceEmail, type ThemeDoc } from "@/modules/marketing/lib/sequence-emails";
import { sequenceReplyTo } from "@/modules/marketing/lib/reply-routing";
import { renderSignature, signatureFromPartner, signatureText } from "@/modules/partner/lib/signature";
import { getDomainStatus, getSenders } from "@/modules/support/lib/brevo";

/**
 * Envoi des messages de séquence arrivés à échéance.
 *
 * Un passage quotidien suffit : ces messages sont espacés de deux mois, une
 * heure de décalage n'a aucune importance.
 *
 * Trois garde-fous, dans cet ordre :
 *  1. la liste de suppression est consultée AVANT chaque envoi, pas seulement à
 *     l'enrôlement — quelqu'un peut se désinscrire entre deux messages ;
 *  2. un seul message par séquence et par passage, même si deux sont en retard :
 *     rattraper un retard en envoyant deux fois d'affilée est le meilleur moyen
 *     de se faire signaler comme spam ;
 *  3. un échec d'envoi n'interrompt pas les autres séquences, et le message est
 *     REPRÉSENTÉ le lendemain — une panne d'une heure chez Brevo ne doit pas
 *     faire perdre définitivement un message espacé de deux mois. Ce n'est qu'au
 *     bout d'une semaine de tentatives qu'on renonce.
 */

/**
 * Délai au bout duquel on cesse de représenter un message en échec.
 *
 * Assez long pour couvrir une panne ou une coupure de week-end, assez court pour
 * ne pas réessayer chaque jour jusqu'à la fin des temps sur une adresse qui ne
 * marchera jamais.
 */
const RETRY_DAYS = 7;

type Message = {
  key?: string;
  scheduledAt?: string;
  sentAt?: string | null;
  skipped?: string | null;
};

type SequenceModel = {
  messages?: ThemeDoc[];
  fromEmail?: string;
  signature?: string;
  nextSequence?: unknown;
};

type Run = {
  id: number | string;
  email?: string;
  sequence?: string;
  client?: unknown;
  status?: string;
  messages?: Message[];
};

export interface SendSummary {
  ok: boolean;
  dry: boolean;
  /** Séquences examinées. */
  runs: number;
  sent: string[];
  /** Séquences arrêtées parce que l'adresse s'est désinscrite entre-temps. */
  unsubscribed: string[];
  failed: string[];
  finished: number;
}

/** Prénom du contact, s'il y en a un — le message tient sans. */
async function firstNameOf(payload: Payload, client: unknown): Promise<string | undefined> {
  const id = client && typeof client === "object" ? (client as { id?: unknown }).id : client;
  if (id == null) return undefined;
  const res = await payload
    .find({
      collection: "client-contacts",
      where: { client: { equals: id } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
    })
    .catch(() => null);
  const name = (res?.docs?.[0] as { firstName?: string } | undefined)?.firstName;
  return name?.trim() || undefined;
}

/**
 * Le partenaire de l'opportunité : c'est LUI qui signe.
 *
 * Une relance après une affaire perdue s'adresse à quelqu'un qui a déjà parlé à
 * une personne précise. Signer « L'équipe Tim Management » un message qui dit
 * « on s'était parlé » le contredit dans sa première ligne.
 *
 * La fiche partenaire porte déjà cette signature (bloc « Signature e-mail »),
 * elle est déjà rendue par `renderSignature`, et c'est celle qui part quand un
 * commercial écrit depuis une opportunité. Les séquences lisent la même — il n'y
 * a donc rien à ressaisir, et un numéro corrigé s'applique au message suivant.
 */
async function partnerOf(
  payload: Payload,
  client: { partner?: unknown } | null,
): Promise<Record<string, unknown> | null> {
  const partnerId =
    client?.partner && typeof client.partner === "object"
      ? (client.partner as { id?: unknown }).id
      : client?.partner;
  if (partnerId == null) return null;
  return (await payload
    .findByID({ collection: "partners", id: String(partnerId), depth: 1, overrideAccess: true })
    .catch(() => null)) as Record<string, unknown> | null;
}

/** L'opportunité derrière la séquence — lue une fois, servant à plusieurs choses. */
async function clientOf(payload: Payload, client: unknown) {
  const id = client && typeof client === "object" ? (client as { id?: unknown }).id : client;
  if (id == null) return null;
  return (await payload
    .findByID({ collection: "partner-clients", id: String(id), depth: 0, overrideAccess: true })
    .catch(() => null)) as { id: number | string; partner?: unknown; formSubmission?: unknown } | null;
}

/**
 * Enchaîne sur la séquence suivante, quand la séquence qui s'achève en désigne une.
 *
 * Uniquement à la fin NORMALE : une séquence arrêtée parce que la personne a
 * répondu, s'est désinscrite ou est ressortie de « Perdue » n'enchaîne sur rien.
 * Enchaîner là serait le contraire exact de ce qu'on vient de constater.
 */
async function chainNext(
  payload: Payload,
  next: unknown,
  run: { id: number | string; email?: string },
  client: { id: number | string; formSubmission?: unknown } | null,
): Promise<void> {
  if (!next || typeof next !== "object" || !client) return;
  const model = next as SequenceDoc;
  if (model.active === false) {
    payload.logger.info(`[séquence] enchaînement de ${run.id} ignoré : « ${model.label} » est inactive.`);
    return;
  }

  const refus = await enrollInSequence(payload, {
    clientId: client.id,
    email: run.email ?? "",
    sequence: model,
    besoins: await besoinsOf(payload, client.formSubmission),
  });

  payload.logger.info(
    refus
      ? `[séquence] enchaînement de ${run.id} sur « ${model.label} » abandonné : ${refus}.`
      : `[séquence] ${run.id} terminée, « ${model.label} » ouverte pour ${run.email}.`,
  );
}

/**
 * Adresse d'envoi : celle du partenaire quand elle est réellement utilisable,
 * sinon celle de la séquence.
 *
 * Signer d'un nom et partir d'une autre adresse n'est pas qu'une incohérence
 * d'affichage : la réponse du prospect arrive ailleurs que chez la personne
 * qu'il croit avoir au bout du fil.
 *
 * Le contrôle est le même que pour un envoi manuel — inscrite chez Brevo ET
 * domaine authentifié — parce qu'une adresse dont le domaine n'est pas signé
 * part droit dans les indésirables. Ici, contrairement au composeur, on ne
 * refuse pas : personne n'est devant l'écran pour corriger, et l'adresse de la
 * séquence reste un expéditeur légitime. Le repli est écrit au journal.
 */
async function senderFor(
  fiche: Record<string, unknown> | null,
  fallback: string,
  senders: { email: string }[],
  domains: Map<string, boolean>,
): Promise<string> {
  const own = typeof fiche?.email === "string" ? fiche.email.trim().toLowerCase() : "";
  if (!own.includes("@")) return fallback;
  const known = senders.some((x) => x.email.toLowerCase() === own.toLowerCase());
  if (!known) return fallback;

  const domain = own.split("@")[1]?.toLowerCase() ?? "";
  if (!domains.has(domain)) {
    domains.set(domain, Boolean((await getDomainStatus(domain).catch(() => null))?.authenticated));
  }
  return domains.get(domain) ? own : fallback;
}

export async function sendDueSequenceMessages(
  payload: Payload,
  { dry = false, limit = 200 }: { dry?: boolean; limit?: number } = {},
): Promise<SendSummary> {
  const now = new Date();
  const summary: SendSummary = {
    ok: true,
    dry,
    runs: 0,
    sent: [],
    unsubscribed: [],
    failed: [],
    finished: 0,
  };

  /**
   * Une seule lecture des expéditeurs pour tout le passage : la liste est la
   * même pour tout le monde, et un appel par séquence ferait des centaines de
   * requêtes chez Brevo pour un résultat identique.
   */
  const senders = dry ? [] : await getSenders().catch(() => []);
  const domains = new Map<string, boolean>();

  /**
   * Les modèles, lus UNE FOIS chacun.
   *
   * Deux cents prospects perdus partagent deux séquences : relire le modèle à
   * chaque ligne, en `depth: 1` (donc en résolvant sept images), faisait deux
   * cents requêtes lourdes pour deux résultats.
   */
  const models = new Map<string, SequenceModel | undefined>();
  const modelFor = async (key?: string): Promise<SequenceModel | undefined> => {
    if (!key) return undefined;
    if (!models.has(key)) {
      models.set(
        key,
        await payload
          .find({
            collection: "sequences",
            where: { key: { equals: key } },
            limit: 1,
            // `depth: 1` pour résoudre l'image du hero et la séquence suivante :
            // sans ça on n'aurait que des identifiants, et le message partirait
            // sans visuel sans qu'on sache pourquoi.
            depth: 1,
            overrideAccess: true,
          })
          .then((r) => r.docs[0] as SequenceModel | undefined)
          .catch(() => undefined),
      );
    }
    return models.get(key);
  };

  const res = await payload.find({
    collection: "sequence-runs",
    where: { status: { equals: "en-cours" } },
    limit,
    depth: 0,
    overrideAccess: true,
  });
  summary.runs = res.docs.length;

  for (const raw of res.docs) {
    const run = raw as Run;
    const messages = run.messages ?? [];
    const email = run.email?.trim().toLowerCase();
    if (!email) continue;

    const due = messages.find(
      (m) => !m.sentAt && !m.skipped && m.scheduledAt && new Date(m.scheduledAt) <= now,
    );
    if (!due?.key) continue;

    // Consulté à CHAQUE envoi : une désinscription entre deux messages doit
    // arrêter la séquence, pas seulement empêcher le prochain.
    if (await isSuppressed(payload, email)) {
      summary.unsubscribed.push(email);
      if (!dry) {
        await payload
          .update({
            collection: "sequence-runs",
            id: run.id,
            data: {
              status: "arretee",
              stopReason: "desinscription",
              messages: messages.map((m) => (m === due ? { ...m, skipped: "desinscrit" } : m)),
            } as never,
            overrideAccess: true,
          })
          .catch((e) => payload.logger.error(`[séquence] arrêt de ${run.id} échoué : ${e}`));
      }
      continue;
    }

    if (dry) {
      summary.sent.push(`${email} → ${due.key}`);
      continue;
    }

    const model = await modelFor(run.sequence);
    const themeDoc = model?.messages?.find((m) => m.key === due.key) ?? null;

    const client = await clientOf(payload, run.client);
    const fiche = await partnerOf(payload, client);
    const sig = signatureFromPartner(fiche);
    if (!sig.name) {
      // Le message partira signé « L'équipe Tim Management ». C'est un repli, pas
      // une intention : une fiche partenaire sans nom est à corriger.
      payload.logger.warn(
        `[séquence] ${email} : le partenaire de l'opportunité n'a pas de nom, signature générique.`,
      );
    }

    const mail = buildSequenceEmail(themeDoc, {
      firstName: await firstNameOf(payload, run.client),
      email,
      unsubscribeUrl: unsubscribeUrl(email),
      closing: model?.signature,
      signatureHtml: renderSignature(sig),
      signatureText: signatureText(sig),
    });
    if (!mail) {
      // Thème absent, désactivé ou incomplet : on n'envoie pas un message amputé.
      summary.failed.push(`${email} → thème « ${due.key} » indisponible`);
      continue;
    }

    try {
      const fallbackFrom = model?.fromEmail || process.env.SEQUENCE_FROM || "info@tim-management.fr";
      const from = await senderFor(fiche, fallbackFrom, senders, domains);
      if (from !== fallbackFrom) {
        payload.logger.info(`[séquence] ${email} : envoi depuis ${from} (partenaire).`);
      }

      await payload.sendEmail({
        to: email,
        from,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
        // Une réponse arrête la séquence — encore faut-il qu'elle nous revienne.
        ...(sequenceReplyTo(run.id) ? { replyTo: sequenceReplyTo(run.id) } : {}),
        headers: {
          ...unsubscribeHeaders(email),
          // Tag Brevo : retrouver le sort réel de cet envoi (remis, ouvert, rejeté).
          "X-Mailin-Tag": `seq-${run.id}`,
        },
      });
    } catch (err) {
      summary.failed.push(`${email} → ${due.key} (${(err as Error).message})`);

      /**
       * On n'abandonne QUE si on insiste depuis une semaine.
       *
       * Marquer « échec » au premier essai transformait une panne passagère en
       * perte définitive : le message était rayé, la séquence passait au
       * suivant, et le prospect ne recevait jamais celui-là. Tant qu'on est
       * dans la fenêtre, on ne touche à rien — le passage de demain le
       * représentera tout seul, puisqu'il reste dû.
       */
      const late = Date.now() - new Date(due.scheduledAt ?? 0).getTime();
      if (late < RETRY_DAYS * 86_400_000) {
        payload.logger.warn(`[séquence] « ${due.key} » vers ${email} a échoué, nouvelle tentative demain.`);
        continue;
      }

      await payload
        .update({
          collection: "sequence-runs",
          id: run.id,
          data: {
            messages: messages.map((m) => (m === due ? { ...m, skipped: "echec" } : m)),
          } as never,
          overrideAccess: true,
        })
        .catch(() => {});
      payload.logger.error(
        `[séquence] « ${due.key} » vers ${email} abandonné après ${RETRY_DAYS} jours d'échecs.`,
      );
      continue;
    }

    const updated = messages.map((m) =>
      m === due ? { ...m, sentAt: new Date().toISOString() } : m,
    );
    const done = updated.every((m) => m.sentAt || m.skipped);
    if (done) summary.finished += 1;

    const marked = await payload
      .update({
        collection: "sequence-runs",
        id: run.id,
        data: { messages: updated, ...(done ? { status: "terminee" } : {}) } as never,
        overrideAccess: true,
      })
      .then(() => true)
      .catch((e) => {
        // L'e-mail EST parti : un marquage perdu le ferait repartir demain.
        payload.logger.error(`[séquence] marquage de ${run.id} échoué : ${e}`);
        return false;
      });

    /**
     * L'enchaînement vient APRÈS le marquage, jamais avant : tant que cette
     * séquence est « en cours », la suivante se refuserait elle-même — c'est le
     * garde-fou qui empêche un prospect d'en cumuler deux.
     */
    if (done && marked) {
      await chainNext(payload, model?.nextSequence, { id: run.id, email }, client).catch((e) =>
        payload.logger.error(`[séquence] enchaînement de ${run.id} échoué : ${e}`),
      );
    }

    summary.sent.push(`${email} → ${due.key}`);
    payload.logger.info(`[séquence] « ${due.key} » envoyé à ${email} (séquence ${run.id}).`);
  }

  /**
   * Un échec doit SE VOIR dans le tableau de bord des tâches planifiées.
   *
   * Sans ça le passage répondait 200 quoi qu'il arrive : une clé Brevo expirée
   * aurait fait échouer tous les envois pendant des semaines sans qu'aucun
   * voyant ne s'allume — et ces messages-là ne se rattrapent pas.
   */
  summary.ok = summary.failed.length === 0;

  return summary;
}
