import type { Payload, PayloadRequest } from "payload";

import { PRODUCTION_KEY } from "@/modules/marketing/lib/journey";
import { withSystemWrite } from "@/modules/marketing/lib/system-write";
import { journeyMailHeaders } from "@/modules/support/lib/brevo";

/**
 * La mémoire des e-mails de SIGNATURE sur le parcours de mise en production.
 *
 * L'invitation, le document disponible, la relance, le code et la copie signée
 * partent au fil des gestes (pas d'un calendrier) : avant, ils ne laissaient
 * aucune trace sur le parcours — impossible de dire, depuis le support, si le
 * client avait reçu son invitation, ni quand, ni s'il fallait le relancer.
 *
 * Chaque envoi porte désormais le marqueur Brevo du parcours (`run-<id>`, voir
 * journeyMailHeaders) et s'y inscrit APRÈS son départ, avec l'heure : l'onglet
 * « E-mails » (parcours et fiche) le montre alors avec ce que Brevo en a fait —
 * remis, ouvert, cliqué, rejeté.
 *
 * Sans parcours de mise en production (une fiche signée hors parcours), l'envoi
 * part quand même, sans marqueur : on n'empêche jamais un e-mail d'exister.
 */

type RunEmailLine = { key?: string | null; subject?: string | null; [k: string]: unknown };
type Run = { id: number | string; emails?: RunEmailLine[] | null };

/** Le parcours de mise en production le plus récent de la fiche, s'il existe. */
export async function productionRunOf(payload: Payload, clientId: number | string, req?: PayloadRequest): Promise<Run | null> {
  try {
    const res = await payload.find({
      collection: "journey-runs",
      where: { and: [{ client: { equals: clientId } }, { journeyKey: { equals: PRODUCTION_KEY } }] },
      sort: "-createdAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
      ...(req ? { req } : {}),
    });
    return (res.docs[0] as Run | undefined) ?? null;
  } catch {
    return null;
  }
}

/**
 * Prépare un e-mail de signature : les en-têtes à joindre à `sendEmail` (le
 * marqueur du parcours), et `record`, à appeler une fois l'e-mail parti.
 *
 * `req` : quand l'envoi se fait DANS une écriture (hook de la fiche), la même
 * requête — sa transaction voit le parcours qu'elle vient de créer, et
 * l'inscription passe pour un constat du logiciel (withSystemWrite), pas pour
 * la saisie d'un partenaire.
 */
export async function signingMail(payload: Payload, clientId: number | string, req?: PayloadRequest) {
  const run = await productionRunOf(payload, clientId, req);
  return {
    mailHeaders: journeyMailHeaders(run?.id),
    /** Inscrit l'envoi sur le parcours (après qu'il est parti). Ne lève jamais. */
    async record(key: string, subject: string, to: string): Promise<void> {
      if (!run) return;
      const line = { key, subject, audience: "client", trigger: "evenement", sentAt: new Date().toISOString(), detail: `Envoyé à ${to}` };
      try {
        await withSystemWrite(req, () =>
          payload.update({
            collection: "journey-runs",
            id: run.id,
            data: { emails: [...(run.emails ?? []), line] } as never,
            overrideAccess: true,
            ...(req ? { req } : {}),
          }),
        );
        run.emails = [...(run.emails ?? []), line];
      } catch (err) {
        payload.logger.error(`[signature] « ${key} » parti mais non inscrit sur le parcours ${run.id} : ${err}`);
      }
    },
  };
}
