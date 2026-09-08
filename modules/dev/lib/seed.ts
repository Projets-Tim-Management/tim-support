import type { Payload } from "payload";

import { DEV_STATUS_SEED } from "@/modules/dev/lib/devStatus";

/**
 * Sème les colonnes du Kanban (les statuts) dans une base vide.
 *
 * Elles sont du CONTENU depuis qu'on peut en créer sans migration : il faut
 * donc bien que quelqu'un pose le jeu de départ, sinon le tableau s'ouvre sans
 * une seule colonne.
 *
 * ⚠️ Base partagée dev/prod : rien n'est recréé si la collection contient déjà
 * quelque chose. Une colonne supprimée exprès ne doit pas réapparaître au
 * redémarrage suivant.
 */
export async function seedDevStatuses(payload: Payload): Promise<void> {
  try {
    const existing = await payload.find({
      collection: "dev-statuses",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    if (existing.totalDocs > 0) return;

    for (const status of DEV_STATUS_SEED) {
      await payload.create({
        collection: "dev-statuses",
        data: status as never,
        overrideAccess: true,
      });
    }
    payload.logger.info(`[dev] ${DEV_STATUS_SEED.length} statuts de départ créés.`);
  } catch (err) {
    payload.logger.error(`[dev] semis des statuts échoué : ${err}`);
  }
}
