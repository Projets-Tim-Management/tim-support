import { after } from "next/server";
import type { CollectionAfterChangeHook } from "payload";

import { handleClientChange, reachedSteps, type Ga4Step } from "@/modules/analytics/lib/ga4-mp";

/**
 * Ce que cet enregistrement change pour GA4 : les étapes franchies par un
 * nouveau statut, et s'il faut relancer l'envoi (le CA payé d'une affaire
 * gagnée a bougé : la signature attendait peut-être son montant). Jamais un
 * brouillon. Pure.
 */
export function ga4Change(
  doc: { clientStatus?: string | null; caPaye?: number | null; _status?: string | null },
  previous: { clientStatus?: string | null; caPaye?: number | null } | null | undefined,
  operation: string,
): { steps: Ga4Step[]; poke: boolean } {
  if (doc._status === "draft") return { steps: [], poke: false };
  const moved = operation === "create" || previous?.clientStatus !== doc.clientStatus;
  const steps = moved ? reachedSteps(doc.clientStatus) : [];
  const poke = doc.clientStatus === "actif" && Number(previous?.caPaye ?? 0) !== Number(doc.caPaye ?? 0);
  return { steps, poke };
}

/**
 * Après l'enregistrement d'une opportunité : note les étapes franchies et
 * envoie ce qui est dû (voir ga4-mp.ts). APRÈS la réponse (`after`, qui
 * s'appuie sur `waitUntil` chez Vercel) : l'enregistrement est validé en base,
 * l'envoi ne le ralentit ni ne le bloque. Hors requête (script en ligne de
 * commande), rien n'est noté — ce chemin ne porte pas de lead du site.
 */
export const sendGa4Steps: CollectionAfterChangeHook = ({ doc, previousDoc, operation, req }) => {
  const { steps, poke } = ga4Change(doc, previousDoc, operation);
  if (!steps.length && !poke) return doc;
  const id = Number(doc.id);
  try {
    after(() => handleClientChange(req.payload, id, steps));
  } catch {
    // Pas de requête en cours : rien à faire ici.
  }
  return doc;
};
