import type { Payload, PayloadRequest } from "payload";

/**
 * Ouvre le parcours « Formation » d'un client — ou rend celui qui est ouvert.
 *
 * Deux chemins y mènent : le bouton de l'encart « Formation » de la fiche, et
 * la case « Formation incluse » du passage « En signature ». Idempotent : cocher
 * la case pour un client qui a déjà sa formation ne la duplique pas.
 *
 * Silencieux sur l'échec (tracé) : la bascule « En signature » ne doit jamais
 * échouer pour une formation, qui se rattrape depuis l'encart.
 *
 * ⚠️ Appelée depuis un hook de la fiche, elle s'exécute HORS de sa transaction
 * (pas de `req`) : sous Postgres, une requête en échec annule toute la
 * transaction même si l'erreur est rattrapée — la fiche n'aurait alors pas été
 * enregistrée. L'auteur de l'ouverture est donc passé à part (`openedBy`).
 */
export async function openTraining(
  payload: Payload,
  clientId: number | string,
  opts: { openedBy?: number | string | null; req?: PayloadRequest } = {},
): Promise<{ ok: boolean; trainingId?: number | string; created?: boolean }> {
  const { req, openedBy } = opts;
  try {
    const open = await payload.find({
      collection: "trainings",
      where: { client: { equals: clientId }, status: { equals: "ouvert" } },
      limit: 1,
      depth: 0,
      overrideAccess: true,
      req,
    });
    const existing = open.docs[0] as { id: number | string } | undefined;
    if (existing) return { ok: true, trainingId: existing.id, created: false };

    const training = await payload.create({
      collection: "trainings",
      data: { client: clientId, ...(openedBy != null ? { openedBy } : {}) } as never,
      overrideAccess: true,
      req,
    });
    payload.logger.info(`[formation] parcours ${training.id} ouvert pour le client ${clientId}.`);
    return { ok: true, trainingId: training.id, created: true };
  } catch (err) {
    payload.logger.error(`[formation] ouverture pour le client ${clientId} échouée : ${err}`);
    return { ok: false };
  }
}
