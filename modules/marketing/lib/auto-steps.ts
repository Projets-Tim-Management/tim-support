import type { Payload } from "payload";

/**
 * Arme la validation automatique d'une étape depuis un autre module.
 *
 * Les modules qui constatent un fait (l'accès espace client vient d'être créé,
 * le dossier vient d'être transmis) n'ont pas à connaître la forme des étapes
 * d'un parcours : ils nomment la clé, le hook `armAutoSteps` fait le reste.
 *
 * Silencieux par construction : aucun parcours ouvert, ou une écriture qui
 * échoue, ne doit jamais faire échouer le geste métier qui l'a déclenchée.
 */
const OPEN = ["preparation", "en-cours"];

export async function armAutoStep(
  payload: Payload,
  clientId: number | string,
  stepKey: string,
): Promise<void> {
  try {
    const runs = await payload.find({
      collection: "journey-runs",
      where: { client: { equals: clientId }, status: { in: OPEN } },
      sort: "-createdAt",
      limit: 1,
      depth: 0,
      overrideAccess: true,
    });
    const run = runs.docs[0];
    if (!run) return;

    await payload.update({
      collection: "journey-runs",
      id: run.id,
      // `autoSteps` est un champ virtuel lu puis vidé par armAutoSteps.
      data: { autoSteps: [stepKey] } as never,
      overrideAccess: true,
    });
  } catch (err) {
    payload.logger.error(`[parcours] armement automatique de « ${stepKey} » échoué : ${err}`);
  }
}
