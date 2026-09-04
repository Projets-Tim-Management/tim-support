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
// v2 : mention d'information RGPD, posée uniquement si le champ est encore vide.
const SEED_VERSION = 2;

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

      const doc = existing.docs[0] as
        | { id: number | string; legalNotice?: string | null; seedVersion?: number | null }
        | undefined;

      if (doc) {
        // Mise à niveau : on COMPLÈTE ce qui est vide, jamais ce qui est écrit.
        // Une mention retouchée en back-office ne doit pas être remplacée par
        // celle du code au prochain démarrage.
        if ((doc.seedVersion ?? 0) < SEED_VERSION && !doc.legalNotice?.trim() && form.legalNotice) {
          await payload.update({
            collection: "forms",
            id: doc.id,
            data: { legalNotice: form.legalNotice, seedVersion: SEED_VERSION } as never,
            overrideAccess: true,
          });
          payload.logger.info(`[formulaires] mention d'information posée sur « ${form.formId} ».`);
        }
        continue;
      }

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
