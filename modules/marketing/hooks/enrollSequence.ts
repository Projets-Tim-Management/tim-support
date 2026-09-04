import type { CollectionAfterChangeHook } from "payload";

import { besoinsOf, enrollInSequence } from "@/modules/marketing/lib/enroll";
import { sequenceForLossReason, type SequenceDoc } from "@/modules/marketing/lib/sequences";

/**
 * Ouvre — ou ferme — une séquence de relance quand une opportunité change d'état.
 *
 * Enrôlement à l'ENTRÉE dans « Perdue », arrêt à la SORTIE. Le déclencheur est
 * la transition, jamais l'état courant : c'est ce qui garantit que le stock
 * d'affaires déjà perdues ne part pas d'un coup le jour de la mise en service.
 *
 * Silencieux par construction. Aucune erreur ici ne doit empêcher
 * d'enregistrer une fiche : on ne refuse pas de clore une affaire parce qu'un
 * envoi futur n'a pas pu être planifié.
 */

const LOST = "perdue";

export const enrollSequence: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  const { payload } = req;
  const was = (previousDoc as { clientStatus?: string } | undefined)?.clientStatus;
  const now = (doc as { clientStatus?: string }).clientStatus;
  if (was === now) return doc;

  try {
    // ── Sortie de « Perdue » : on arrête ce qui tourne ──────────────────────
    if (was === LOST && now !== LOST) {
      const running = await payload.find({
        collection: "sequence-runs",
        where: { and: [{ client: { equals: doc.id } }, { status: { equals: "en-cours" } }] },
        limit: 10,
        depth: 0,
        overrideAccess: true,
        req,
      });
      for (const run of running.docs) {
        await payload.update({
          collection: "sequence-runs",
          id: run.id,
          data: { status: "arretee", stopReason: "statut-change" } as never,
          overrideAccess: true,
          req,
        });
      }
      if (running.docs.length) {
        payload.logger.info(
          `[séquence] ${running.docs.length} séquence(s) arrêtée(s) : l'opportunité ${doc.id} sort de « Perdue ».`,
        );
      }
      return doc;
    }

    // ── Entrée dans « Perdue » : on enrôle ──────────────────────────────────
    if (now !== LOST) return doc;

    // Les séquences vivent en base : c'est là qu'on lit quel motif ouvre quoi,
    // et avec quels messages. Le code n'en connaît aucune.
    const models = await payload.find({
      collection: "sequences",
      where: { active: { equals: true } },
      limit: 20,
      depth: 0,
      overrideAccess: true,
    });
    const sequence = sequenceForLossReason(
      models.docs as SequenceDoc[],
      (doc as { lossReason?: string }).lossReason,
    );
    if (!sequence) return doc;

    const email = String((doc as { email?: string }).email ?? "").trim().toLowerCase();
    if (!email) {
      payload.logger.info(`[séquence] opportunité ${doc.id} perdue sans e-mail : aucune relance.`);
      return doc;
    }

    const refus = await enrollInSequence(payload, {
      clientId: doc.id,
      email,
      sequence,
      besoins: await besoinsOf(payload, (doc as { formSubmission?: unknown }).formSubmission),
      req,
    });

    payload.logger.info(
      refus
        ? `[séquence] aucune relance pour l'opportunité ${doc.id} : ${refus}.`
        : `[séquence] « ${sequence.label} » ouverte pour ${email} (opportunité ${doc.id}).`,
    );
  } catch (err) {
    // Journalisé, jamais bloquant : clore une affaire ne doit pas échouer parce
    // qu'une relance n'a pas pu être planifiée.
    payload.logger.error(`[séquence] enrôlement de l'opportunité ${doc.id} échoué : ${err}`);
  }

  return doc;
};
