import type { Payload, PayloadRequest } from "payload";

import { baseEmailKey, PRODUCTION_KEY } from "@/modules/marketing/lib/journey";
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

/** L'étape de la mise en production qu'un e-mail sert : il s'affiche sous elle, avec son heure d'envoi. */
export const SIGNING_STEP = {
  invitation: "entreprise",
  devisDisponible: "devis-envoye",
  devisASigner: "devis-signe",
  contratDisponible: "contrat-envoye",
  contratASigner: "contrat-signe",
} as const;

/** L'étape qui attend la signature d'un document : relance, code et copie signée s'y rangent. */
export const signStepOf = (kind: string) => (kind === "contrat" ? SIGNING_STEP.contratASigner : SIGNING_STEP.devisASigner);

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
    /**
     * Inscrit l'envoi sur le parcours (après qu'il est parti), sous son étape :
     * la ligne PRÉVUE par le modèle (même gabarit, même étape, pas encore
     * partie) est datée ; sinon (une deuxième relance, un code) une ligne s'ajoute.
     * Ne lève jamais.
     */
    async record(key: string, subject: string, to: string, stepKey: string): Promise<void> {
      if (!run) return;
      const sentAt = new Date().toISOString();
      const lines = run.emails ?? [];
      const planned = lines.findIndex((l) => baseEmailKey(l.key) === key && l.stepKey === stepKey && !l.sentAt);
      const emails =
        planned >= 0
          ? lines.map((l, i) => (i === planned ? { ...l, subject, sentAt, detail: `Envoyé à ${to}` } : l))
          : [...lines, { key, subject, audience: "client", trigger: "evenement", stepKey, sentAt, detail: `Envoyé à ${to}` }];
      try {
        await withSystemWrite(req, () =>
          payload.update({
            collection: "journey-runs",
            id: run.id,
            data: { emails } as never,
            overrideAccess: true,
            ...(req ? { req } : {}),
          }),
        );
        run.emails = emails;
      } catch (err) {
        payload.logger.error(`[signature] « ${key} » parti mais non inscrit sur le parcours ${run.id} : ${err}`);
      }
    },
  };
}
