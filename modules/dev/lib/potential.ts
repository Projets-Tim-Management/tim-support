import { sql } from "@payloadcms/db-postgres";
import type { Payload, PayloadRequest } from "payload";

import { execSql, rowsOf } from "@/core/lib/raw-sql";
import { potentialOf, relId, type Requester } from "@/modules/dev/lib/potential-shared";
import { signatureScore, WINDOW_DAYS, type ScoreActivity } from "@/modules/partner/lib/signature-score";

export { potentialOf, rankRequesters, relId, type PotentialDetail, type Requester } from "@/modules/dev/lib/potential-shared";

/**
 * Le POTENTIEL d'un développement (Charlie, 19/10/2026) : le % de signature
 * du prospect le plus avancé parmi ceux qui l'attendent. Une fonctionnalité
 * demandée par une entreprise en phase de test passe avant celle qu'un lead
 * froid a évoquée — c'est ce qui aide l'équipe tech à prioriser.
 *
 * Plusieurs demandeurs : on garde le plus gros %, puis, à égalité, le statut
 * le plus avancé. Stocké sur le développement (`potential`, triable) avec la
 * liste des demandeurs (`potentialDetail`), et recalculé :
 *  - à l'enregistrement du développement (les demandeurs ont pu changer) ;
 *  - quand un demandeur change de statut, ou qu'un échange est noté sur sa fiche ;
 *  - chaque nuit, pour la règle du silence (qui avance avec le temps seul).
 * Les développements n'ont pas de brouillons : écrire en SQL ne sera pas
 * écrasé par une version plus ancienne.
 */

const DAY = 86_400_000;

/** Le % de signature de chaque opportunité demandée, lu en base. */
export async function requestersOf(payload: Payload, clientIds: number[], now: Date, req?: PayloadRequest): Promise<Map<number, Requester>> {
  const ids = [...new Set(clientIds)];
  const out = new Map<number, Requester>();
  if (!ids.length) return out;
  const since = new Date(now.getTime() - WINDOW_DAYS * DAY).toISOString();
  const [clients, activities] = await Promise.all([
    payload.find({
      collection: "partner-clients",
      where: { id: { in: ids } },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
      select: { companyName: true, clientStatus: true, createdAt: true },
    }),
    payload.find({
      collection: "client-activities",
      where: {
        and: [
          { client: { in: ids } },
          { type: { in: ["tache", "email"] } },
          { or: [{ occurredAt: { greater_than_equal: since } }, { doneAt: { greater_than_equal: since } }] },
        ],
      },
      depth: 0,
      pagination: false,
      overrideAccess: true,
      req,
      select: { client: true, type: true, taskKind: true, done: true, doneAt: true, occurredAt: true, emailDirection: true },
    }),
  ]);
  const byClient = new Map<number, ScoreActivity[]>();
  for (const a of activities.docs) {
    const id = relId(a.client);
    if (id == null) continue;
    byClient.set(id, [...(byClient.get(id) ?? []), a as ScoreActivity]);
  }
  for (const c of clients.docs) {
    const id = Number(c.id);
    const status = String(c.clientStatus ?? "nouvelle");
    const s = signatureScore(status, byClient.get(id) ?? [], now, c.createdAt);
    out.set(id, { id, company: String(c.companyName ?? "").trim() || `#${id}`, status, score: s.score, explanation: s.explanation });
  }
  return out;
}

/**
 * Recalcule le potentiel des développements demandés par ces opportunités —
 * ou de tous (sans argument, la tâche de nuit).
 */
export async function refreshPotentials(payload: Payload, clientIds?: number[], now = new Date()): Promise<number> {
  if (clientIds && !clientIds.length) return 0;
  const scope = clientIds
    ? sql`AND "parent_id" IN (SELECT "parent_id" FROM "developments_rels"
          WHERE "path" = 'opportunities' AND "partner_clients_id" IN (${sql.join(clientIds.map((id) => sql`${id}`), sql`, `)}))`
    : sql``;
  const rows = rowsOf(
    await execSql(
      payload,
      sql`SELECT "parent_id", "partner_clients_id" FROM "developments_rels"
          WHERE "path" = 'opportunities' AND "partner_clients_id" IS NOT NULL ${scope}`,
    ),
  );
  const byDev = new Map<number, number[]>();
  for (const r of rows) byDev.set(Number(r.parent_id), [...(byDev.get(Number(r.parent_id)) ?? []), Number(r.partner_clients_id)]);
  const scores = await requestersOf(payload, [...byDev.values()].flat(), now);
  for (const [devId, ids] of byDev) {
    const { potential, potentialDetail } = potentialOf(ids.map((id) => scores.get(id)).filter((r): r is Requester => Boolean(r)));
    await execSql(
      payload,
      sql`UPDATE "developments" SET "potential" = ${potential}, "potential_detail" = ${potentialDetail ? JSON.stringify(potentialDetail) : null}::jsonb
          WHERE "id" = ${devId}`,
    );
  }
  // La nuit : un développement qui n'a plus de demandeur n'a plus de potentiel.
  if (!clientIds) {
    await execSql(
      payload,
      sql`UPDATE "developments" SET "potential" = NULL, "potential_detail" = NULL
          WHERE "potential" IS NOT NULL AND "id" NOT IN (SELECT "parent_id" FROM "developments_rels" WHERE "path" = 'opportunities' AND "partner_clients_id" IS NOT NULL)`,
    );
  }
  return byDev.size;
}
