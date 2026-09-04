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
}

/** Plafond par passage : une boîte de dix ans ne doit pas bloquer un cron. */
const MAX_PER_RUN = 400;

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

  const since = connection.syncSince ? new Date(connection.syncSince) : new Date(Date.now() - 31_536_000_000);

  let ids: string[];
  try {
    ids = await listMessageIds(token.accessToken, { since, max });
  } catch (e) {
    return { ...summary, error: (e as Error).message };
  }

  // Un message illisible n'arrête pas les autres : il sera revu au passage
  // suivant, et l'échec d'un seul ne doit pas priver la fiche des autres.
  const metas = await getMetadataBatch(token.accessToken, ids, (id, e) =>
    payload.logger.warn(`[boîte mail] ${mailbox} : métadonnées de ${id} illisibles (${e}).`),
  );

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
        { ourAddresses: connection.accountEmail ? [connection.accountEmail] : [] },
      );
      if (result.reason === "ecrit") summary.written += 1;
      else if (result.reason === "deja-connu") summary.known += 1;
    } catch (e) {
      payload.logger.warn(`[boîte mail] ${mailbox} : ${meta.id} non rattaché (${e}).`);
    }
  }

  summary.ok = true;
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
      } as never,
      overrideAccess: true,
    })
    .catch((e) => payload.logger.error(`[boîte mail] état de ${summary.mailbox} non enregistré : ${e}`));
}
