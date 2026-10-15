import { after } from "next/server";
import type { CollectionAfterChangeHook } from "payload";

import { processGa4Steps } from "@/modules/analytics/lib/ga4-mp";

/** Une étape a-t-elle pu bouger ? Le statut a changé, ou le CA payé d'une affaire gagnée (la signature attendait peut-être son montant). Pure. */
export function ga4MayBeDue(doc: { clientStatus?: string | null; caPaye?: number | null; _status?: string | null }, previous: { clientStatus?: string | null; caPaye?: number | null } | null | undefined, operation: string): boolean {
  if (doc._status === "draft") return false;
  if (operation === "create") return true;
  return previous?.clientStatus !== doc.clientStatus || (doc.clientStatus === "actif" && Number(previous?.caPaye ?? 0) !== Number(doc.caPaye ?? 0));
}

/**
 * Après l'enregistrement d'une opportunité : envoie à GA4 les étapes dues
 * (voir ga4-mp.ts). L'envoi part APRÈS la réponse (`after`), une fois
 * l'enregistrement validé en base : il ne le ralentit ni ne le bloque, et il
 * lit la fiche telle qu'elle est vraiment. Hors d'une requête (script, import),
 * il n'y a pas d'« après » : la reprise horaire s'en charge.
 */
export const sendGa4Steps: CollectionAfterChangeHook = ({ doc, previousDoc, operation, req }) => {
  if (!ga4MayBeDue(doc, previousDoc, operation)) return doc;
  const id = Number(doc.id);
  try {
    after(() => processGa4Steps(req.payload, id).then(() => undefined));
  } catch {
    // Pas de requête en cours : la tâche planifiée reprendra cette opportunité.
  }
  return doc;
};
