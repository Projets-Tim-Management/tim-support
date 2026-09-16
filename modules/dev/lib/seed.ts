import type { Payload } from "payload";

import { DEV_STATUS_SEED } from "@/modules/dev/lib/devStatus";
import { INTEGRATIONS_SEED } from "@/modules/dev/lib/integrations-seed";

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

/**
 * Sème les fiches des connexions API déjà en service, décrites d'après le
 * code (voir integrations-seed.ts). Même règle que les statuts : rien n'est
 * recréé si la collection contient déjà quelque chose — une fiche supprimée
 * exprès ne doit pas réapparaître au redémarrage suivant.
 */
export async function seedIntegrations(payload: Payload): Promise<void> {
  try {
    const existing = await payload.find({ collection: "integrations", limit: 1, depth: 0, overrideAccess: true });
    if (existing.totalDocs > 0) return;
    for (const doc of INTEGRATIONS_SEED) {
      await payload.create({ collection: "integrations", data: doc as never, overrideAccess: true });
    }
    payload.logger.info(`[dev] ${INTEGRATIONS_SEED.length} fiches de connexion API créées.`);
  } catch (err) {
    payload.logger.error(`[dev] semis des connexions API échoué : ${err}`);
  }
}
