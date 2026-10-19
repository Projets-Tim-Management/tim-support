import { after } from "next/server";
import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, Payload } from "payload";

import { potentialOf, refreshPotentials, relId, requestersOf, type Requester } from "@/modules/dev/lib/potential";

/**
 * Le potentiel d'un développement suit ses demandeurs (voir lib/potential.ts).
 */

/** Développement : les demandeurs ont pu changer — on recalcule avant d'écrire. */
export const setPotential: CollectionBeforeChangeHook = async ({ data, req }) => {
  // Un déplacement sur le Kanban n'envoie que le statut et le rang : rien à recalculer.
  if (data?.opportunities === undefined) return data;
  const ids = (Array.isArray(data.opportunities) ? data.opportunities : [data.opportunities])
    .map(relId)
    .filter((id): id is number => id != null);
  const scores = await requestersOf(req.payload, ids, new Date(), req);
  return { ...data, ...potentialOf(ids.map((id) => scores.get(id)).filter((r): r is Requester => Boolean(r))) };
};

/**
 * APRÈS la réponse (`after`) : le hook tourne dans la transaction de
 * l'enregistrement, et l'écriture sur les développements n'a pas à la
 * ralentir. Hors requête (script), la tâche de nuit rattrapera.
 */
function later(payload: Payload, clientId: number | null) {
  if (clientId == null) return;
  try {
    after(() =>
      refreshPotentials(payload, [clientId]).catch((e) =>
        payload.logger.error({ err: e, msg: `[potentiel] recalcul impossible pour l'opportunité ${clientId}` }),
      ),
    );
  } catch {
    // Pas de requête en cours : rien à faire ici.
  }
}

/** Opportunité : un changement de statut change son %. Jamais un brouillon. */
export const refreshPotentialOnStatus: CollectionAfterChangeHook = ({ doc, previousDoc, req }) => {
  if (doc._status !== "draft" && previousDoc?.clientStatus !== doc.clientStatus) later(req.payload, relId(doc.id));
  return doc;
};

/** Historique : un échange (tâche faite, e-mail) change le % de son opportunité. */
export const refreshPotentialOnActivity: CollectionAfterChangeHook = ({ doc, req }) => {
  if (doc.type === "tache" || doc.type === "email") later(req.payload, relId(doc.client));
  return doc;
};
