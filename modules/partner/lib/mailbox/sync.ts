import type { Payload } from "payload";

import {
  captureEmail,
  correspondents,
  findOpportunity,
  stripQuoted,
} from "@/modules/partner/lib/email-capture";
import { freshAccessToken } from "@/modules/partner/lib/mailbox/gmail-auth";
import { getContent, getMetadataBatch, listMessageIds } from "@/modules/partner/lib/mailbox/gmail";

/**
 * Lecture d'une boîte connectée, et rattachement de ce qui concerne un prospect.
 *
 * L'ordre des opérations EST la garantie de confidentialité :
 *
 *   1. on liste les identifiants des messages de la fenêtre ;
 *   2. on descend leurs MÉTADONNÉES — adresses, objet, date ;
 *   3. on cherche une opportunité parmi les adresses ;
 *   4. et seulement alors, pour ceux qui en ont une, on télécharge le contenu.
 *
 * Le reste de la boîte n'est donc jamais lu. Faire l'inverse — tout télécharger
 * puis filtrer — donnerait exactement le même résultat en base et romprait la
 * promesse faite à la personne qui a connecté sa boîte.
 *
 * `dry: true` s'arrête après l'étape 3 : il dit ce qui SERAIT rattaché, sans
 * rien écrire ni même télécharger un seul message.
 */

type Connection = {
  id: number | string;
  accountEmail?: string;
  status?: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
  syncSince?: string | null;
  syncedUpTo?: string | null;
  backfillBefore?: string | null;
  capturedCount?: number | null;
};

export interface MailboxSummary {
  mailbox: string;
  ok: boolean;
  dry: boolean;
  /** Messages examinés (métadonnées seules). */
  scanned: number;
  /** Messages concernant une opportunité connue. */
  matched: number;
  /** Échanges effectivement écrits (0 en lecture à blanc). */
  written: number;
  /** Déjà présents — un Cci ou un passage précédent les avait déjà rattachés. */
  known: number;
  error?: string;
  /** Aperçu de ce qui serait rattaché, pour la lecture à blanc. */
  preview: string[];
  /** Où en est la reprise du passé, une fois le passage terminé. */
  backfillBefore?: string;
  /**
   * La fenêtre du présent a été lue ENTIÈREMENT. Sans cette garantie, avancer
   * le curseur du présent sauterait des messages définitivement.
   */
  presentComplete: boolean;
  /** Le passé est entièrement rattrapé. */
  backfillDone: boolean;
}

/**
 * Plafond par passage.
 *
 * Calibré sur le DÉLAI d'une fonction Vercel (300 s), pas sur le quota Gmail :
 * 400 messages tenaient en local mais frôlaient la limite une fois le contenu
 * des messages retenus téléchargé. Un passage coupé en route ne perd rien — le
 * `Message-ID` écarte les doublons au suivant — mais il ne finit jamais, et la
 * reprise du passé n'avancerait plus. Le cron passe toutes les heures : mieux
 * vaut deux cents messages qui aboutissent que quatre cents qui expirent.
 */
const MAX_PER_RUN = 200;

/**
 * Largeur d'une tranche de reprise du passé.
 *
 * Un mois : assez large pour avancer vite, assez étroit pour qu'une tranche
 * dense (un mois de salon) ne fasse pas exploser le plafond à elle seule. On en
 * enchaîne autant que le plafond le permet dans un même passage.
 */
const SLICE_DAYS = 30;

const daysBefore = (d: Date, n: number) => new Date(d.getTime() - n * 86_400_000);

/**
 * Les fenêtres à lire pendant ce passage, dans l'ordre.
 *
 * Le PRÉSENT d'abord, toujours : un message reçu il y a une heure vaut plus
 * qu'un message d'il y a six mois, et si le plafond est atteint, c'est la
 * reprise du passé qui attend — jamais l'inverse.
 *
 * Le recouvrement d'un jour sur le présent n'est pas une précaution vague :
 * Gmail filtre par JOUR, et un message arrivé pendant le passage précédent
 * serait sinon sauté définitivement. Le `Message-ID` empêche le doublon.
 */
export function windowsFor(conn: Connection, now = new Date()): { since: Date; before?: Date }[] {
  const out: { since: Date; before?: Date }[] = [];
  const floor = conn.syncSince ? new Date(conn.syncSince) : daysBefore(now, 365);

  /**
   * Sans curseur, le présent part de MAINTENANT, jamais du plancher : sinon la
   * première fenêtre couvrirait l'année entière d'un coup — précisément ce que
   * le découpage en tranches existe pour éviter. Le passé, lui, est rattrapé
   * par la reprise, tranche par tranche.
   */
  const upTo = conn.syncedUpTo ? new Date(conn.syncedUpTo) : now;
  out.push({ since: daysBefore(upTo, 1) });

  let before = conn.backfillBefore ? new Date(conn.backfillBefore) : upTo;
  while (before > floor) {
    const since = new Date(Math.max(floor.getTime(), daysBefore(before, SLICE_DAYS).getTime()));
    out.push({ since, before });
    before = since;
  }
  return out;
}

export async function syncMailbox(
  payload: Payload,
  connection: Connection,
  { dry = false, max = MAX_PER_RUN }: { dry?: boolean; max?: number } = {},
): Promise<MailboxSummary> {
  const mailbox = connection.accountEmail ?? String(connection.id);
  const summary: MailboxSummary = {
    mailbox,
    ok: false,
    dry,
    scanned: 0,
    matched: 0,
    written: 0,
    known: 0,
    preview: [],
    backfillDone: false,
    presentComplete: false,
  };

  if (connection.status === "suspendue") {
    return { ...summary, ok: true, error: "suspendue" };
  }

  let token;
  try {
    token = await freshAccessToken(connection);
  } catch (e) {
    return { ...summary, error: `authentification : ${(e as Error).message}` };
  }
  if (!token?.accessToken) return { ...summary, error: "aucun jeton exploitable" };

  const floor = connection.syncSince ? new Date(connection.syncSince) : daysBefore(new Date(), 365);
  const windows = windowsFor(connection);

  const metas = [];
  for (const w of windows) {
    if (metas.length >= max) break;

    const budget = max - metas.length;
    let ids: string[];
    try {
      ids = await listMessageIds(token.accessToken, { ...w, max: budget });
    } catch (e) {
      // Une fenêtre illisible n'annule pas celles déjà lues : ce qui a été
      // trouvé est écrit, et le curseur n'avancera pas au-delà.
      summary.error = (e as Error).message;
      break;
    }

    // Un message illisible n'arrête pas les autres : il sera revu au passage
    // suivant, et l'échec d'un seul ne doit pas priver la fiche des autres.
    metas.push(
      ...(await getMetadataBatch(token.accessToken, ids, (id, e) =>
        payload.logger.warn(`[boîte mail] ${mailbox} : métadonnées de ${id} illisibles (${e}).`),
      )),
    );

    /**
     * La tranche ne compte comme traitée que si on l'a lue ENTIÈREMENT.
     *
     * Quand le plafond du passage tombe au milieu d'une tranche, la liste est
     * tronquée : faire descendre le curseur reviendrait à déclarer lus des
     * messages qu'on n'a jamais vus, et ils ne reviendraient plus jamais. On
     * préfère relire la tranche au passage suivant — la relecture ne coûte
     * rien, le `Message-ID` écarte les doublons, l'oubli est définitif.
     */
    const complete = ids.length < budget;
    if (w.before) {
      if (complete) summary.backfillBefore = w.since.toISOString();
    } else {
      summary.presentComplete = complete;
    }
  }

  for (const meta of metas) {
    summary.scanned += 1;

    const msg = { from: meta.from, to: meta.to, cc: meta.cc };
    const match = await findOpportunity(payload, correspondents(msg));
    if (!match) continue;
    summary.matched += 1;

    if (dry) {
      // On s'arrête AVANT de télécharger : c'est tout l'intérêt de la lecture à
      // blanc — vérifier le tri sans jamais toucher au contenu des messages.
      if (summary.preview.length < 40) {
        summary.preview.push(`${meta.date?.slice(0, 16) ?? "?"} · ${match.matchedOn} · ${meta.subject ?? "(sans objet)"}`);
      }
      continue;
    }

    try {
      const content = await getContent(token.accessToken, meta.id);
      const result = await captureEmail(
        payload,
        {
          ...msg,
          subject: meta.subject,
          text: stripQuoted(content.text),
          attachments: content.attachments.map((name) => ({ name })),
          messageId: meta.messageId,
          date: meta.date,
        },
        // La boîte lue EST notre côté de la conversation : tout ce qui ne part
        // pas d'elle est reçu, quelle que soit l'adresse du correspondant.
        {
          ourAddresses: connection.accountEmail ? [connection.accountEmail] : [],
          source: connection.accountEmail,
        },
      );
      if (result.reason === "ecrit") summary.written += 1;
      else if (result.reason === "deja-connu") summary.known += 1;
    } catch (e) {
      payload.logger.warn(`[boîte mail] ${mailbox} : ${meta.id} non rattaché (${e}).`);
    }
  }

  summary.ok = !summary.error;
  /**
   * « Historique complet » se dit seulement si un curseur EXISTE et a rejoint
   * le plancher. Sans curseur, l'absence de date valait 1970 et le passage se
   * déclarait terminé alors qu'il n'avait rien rattrapé.
   */
  const reached = summary.backfillBefore ?? connection.backfillBefore;
  summary.backfillDone = !summary.error && Boolean(reached) && new Date(reached!) <= floor;
  return summary;
}

/**
 * Met à jour la connexion après un passage.
 *
 * Séparé de la lecture pour que celle-ci reste sans effet de bord et testable —
 * et pour qu'une lecture à blanc ne puisse pas, par construction, marquer une
 * boîte comme synchronisée.
 */
export async function recordSync(
  payload: Payload,
  connection: Connection,
  summary: MailboxSummary,
): Promise<void> {
  await payload
    .update({
      collection: "mailbox-connections",
      id: connection.id,
      data: {
        lastSyncAt: new Date().toISOString(),
        status: summary.ok ? "active" : "erreur",
        lastError: summary.error ?? null,
        capturedCount: (connection.capturedCount ?? 0) + summary.written,
        /**
         * Le présent n'avance que si sa fenêtre a été lue EN ENTIER et que le
         * passage s'est bien terminé.
         *
         * Après une longue coupure, les nouveaux messages peuvent dépasser le
         * plafond du passage : avancer le curseur reviendrait alors à déclarer
         * lus des messages jamais vus. On préfère relire — le `Message-ID`
         * écarte les doublons — plutôt que d'oublier définitivement.
         */
        ...(summary.ok && summary.presentComplete ? { syncedUpTo: new Date().toISOString() } : {}),
        ...(summary.backfillBefore ? { backfillBefore: summary.backfillBefore } : {}),
      } as never,
      overrideAccess: true,
    })
    .catch((e) => payload.logger.error(`[boîte mail] état de ${summary.mailbox} non enregistré : ${e}`));
}
