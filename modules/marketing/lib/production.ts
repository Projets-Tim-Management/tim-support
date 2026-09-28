import type { Payload, PayloadRequest } from "payload";

import { PRODUCTION_KEY, STEP_TEST_WON } from "@/modules/marketing/lib/journey";
import { withSystemWrite } from "@/modules/marketing/lib/system-write";

/**
 * Ouvre le parcours « Mise en production » d'un client.
 *
 * Appelé quand la fiche passe « En signature » — quel que soit le chemin :
 *  - la phase de test vient d'être gagnée (« Je continue ») : elle est déjà
 *    close, il reste à ouvrir la suite ;
 *  - quelqu'un a passé la fiche « En signature » à la main (Kanban, fiche)
 *    alors qu'une phase de test était ouverte : on la CLÔT d'abord, en
 *    enregistrant la décision « contrat » — c'est ce que le geste veut dire ;
 *  - affaire conclue sans test : rien à clore.
 *
 * Idempotent : une mise en production déjà ouverte est rendue telle quelle.
 * Silencieux sur l'échec (tracé) : la fiche est « En signature » quoi qu'il
 * arrive, le parcours se rattrape en repassant par ce statut.
 */

type Run = {
  id: number | string;
  journeyKey?: string | null;
  steps?: { key?: string; state?: string; doneAt?: string | null }[];
};

const OPEN = ["preparation", "en-cours"];

export async function startProductionJourney(
  payload: Payload,
  clientId: number | string,
  req?: PayloadRequest,
): Promise<{ ok: boolean; runId?: number | string; created?: boolean }> {
  try {
    const open = (
      await payload.find({
        collection: "journey-runs",
        where: { client: { equals: clientId }, status: { in: OPEN } },
        sort: "-createdAt",
        limit: 5,
        depth: 0,
        overrideAccess: true,
        req,
      })
    ).docs as Run[];

    const existing = open.find((r) => r.journeyKey === PRODUCTION_KEY);
    if (existing) return { ok: true, runId: existing.id, created: false };

    // Phase de test encore ouverte : le passage « En signature » VAUT la
    // décision « contrat ». On l'écrit, ce qui la clôt (gagnée).
    const test = open.find((r) => r.journeyKey !== PRODUCTION_KEY);
    if (test) {
      const now = new Date().toISOString();
      await withSystemWrite(req, () =>
        payload.update({
          collection: "journey-runs",
          id: test.id,
          data: {
            decision: "contrat",
            decisionAt: now,
            steps: (test.steps ?? []).map((s) =>
              s.key === STEP_TEST_WON && s.state !== "fait" ? { ...s, state: "fait", doneAt: now } : s,
            ),
          } as never,
          overrideAccess: true,
          req,
        }),
      );
    }

    const template = (
      await payload.find({
        collection: "marketing-journeys",
        where: { key: { equals: PRODUCTION_KEY } },
        limit: 1,
        depth: 0,
        overrideAccess: true,
        req,
      })
    ).docs[0] as { id: number | string } | undefined;
    if (!template) {
      payload.logger.error("[mise en production] modèle introuvable : parcours non ouvert.");
      return { ok: false };
    }

    const run = await payload.create({
      collection: "journey-runs",
      data: { client: clientId, journey: template.id } as never,
      overrideAccess: true,
      req,
    });
    payload.logger.info(`[mise en production] parcours ${run.id} ouvert pour le client ${clientId}.`);
    return { ok: true, runId: run.id, created: true };
  } catch (err) {
    payload.logger.error(`[mise en production] ouverture pour le client ${clientId} échouée : ${err}`);
    return { ok: false };
  }
}
