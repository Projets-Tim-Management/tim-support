import type { Payload } from "payload";

import { SEEDED_FORMS } from "@/modules/forms/lib/form-schema";

/**
 * Sème les formulaires livrés avec le code au démarrage.
 *
 * ⚠️ Base partagée dev/prod : ce fichier ne fait que CRÉER une définition absente,
 * jamais réécrire une existante — un semis qui « remet à jour » effacerait une
 * correction faite en back-office. `seedVersion` servira le jour où il faudra
 * compléter une définition en place, champ par champ.
 */
const SEED_VERSION = 1;

export async function seedForms(payload: Payload): Promise<void> {
  for (const form of SEEDED_FORMS) {
    try {
      const existing = await payload.find({
        collection: "forms",
        where: { formId: { equals: form.formId } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
      });

      if (existing.docs.length) continue;

      await payload.create({
        collection: "forms",
        data: { ...form, active: true, seedVersion: SEED_VERSION } as never,
        overrideAccess: true,
      });
      payload.logger.info(`[formulaires] définition « ${form.formId} » créée.`);
    } catch (err) {
      // Un semis qui échoue ne doit pas empêcher l'application de démarrer : le
      // formulaire est créable à la main, l'application entière ne l'est pas.
      payload.logger.error(`[formulaires] semis de « ${form.formId} » échoué : ${err}`);
    }
  }
}
