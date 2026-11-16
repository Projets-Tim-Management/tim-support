import type { Payload } from "payload";

import type { Scorecard } from "@/modules/ai-team/lib/scorecard";
import { cached } from "@/modules/analytics/lib/seo-cache";

/**
 * Les lectures que partagent la page Équipe IA, la revue, la conversation, la
 * veille et la photo du lundi (relecture du 12/11/2026 : elles étaient
 * recopiées, et la méthode de chaque agent se lisait en une requête par agent).
 */

const common = { depth: 0, overrideAccess: true } as const;

/** Les concurrents suivis (leurs noms) ; aucun si la lecture échoue. */
export const loadCompetitorNames = (payload: Payload): Promise<string[]> =>
  payload
    .find({ collection: "ad-competitors", pagination: false, ...common, select: { name: true } as never })
    .then((r) => (r.docs as unknown as { name?: string }[]).map((c) => String(c.name ?? "")).filter(Boolean))
    .catch(() => []);

/** La fiche des canaux, gardée 30 minutes (elle lit Pennylane et les régies) ; null si elle échoue. */
export const cachedScorecard = (payload: Payload, now = new Date()): Promise<Scorecard | null> =>
  // Import tardif : la fiche lit elle-même les concurrents ici.
  cached(`scorecard:${now.toISOString().slice(0, 13)}`, 30 * 60_000, () => import("@/modules/ai-team/lib/scorecard").then((m) => m.loadScorecard(payload, 3, now))).catch(() => null);

export type MethodRow = { id: number | string; member: number | string; week: string; createdAt: string; method?: string | null; changes?: string | null; ideas?: unknown; benchmark?: unknown };

/**
 * La dernière méthode faite de chaque agent demandé : une requête par agent,
 * limitée à une ligne, toutes en parallèle — borné quel que soit l'historique.
 * `withText` : avec le texte de la méthode (lourd) ; sinon ce qui sert au score.
 */
export async function latestMethods(payload: Payload, memberIds: (number | string)[], withText = false): Promise<Map<string, MethodRow>> {
  const select = { member: true, week: true, createdAt: true, benchmark: true, ...(withText ? { method: true, changes: true, ideas: true } : {}) };
  const rows = await Promise.all(
    memberIds.map((id) =>
      payload
        .find({ collection: "ai-team-methods", where: { and: [{ member: { equals: id } }, { status: { equals: "faite" } }] }, sort: "-createdAt", limit: 1, ...common, select: select as never })
        .then((r) => r.docs[0] as unknown as MethodRow | undefined)
        .catch(() => undefined),
    ),
  );
  return new Map(memberIds.flatMap((id, i) => (rows[i] ? [[String(id), rows[i]!] as const] : [])));
}

/** Les membres de l'équipe pour ces clés (id, clé, prénom). */
export const membersByKeys = (payload: Payload, keys: string[]) =>
  payload
    .find({ collection: "ai-team-members", where: { key: { in: keys } }, pagination: false, ...common, select: { key: true, name: true } as never })
    .then((r) => r.docs as unknown as { id: number | string; key: string; name: string }[]);

/**
 * UN membre de l'équipe par sa clé (« chef-com », « seo-analyste »…), ou undefined. La lecture qui était recopiée dans
 * chaque rapport, revue et conversation (relecture du 15/11/2026). `select` : seulement ces champs.
 */
export const memberByKey = <T>(payload: Payload, key: string, select?: Record<string, true>): Promise<T | undefined> =>
  payload.find({ collection: "ai-team-members", where: { key: { equals: key } }, limit: 1, depth: 0, overrideAccess: true, ...(select ? { select: select as never } : {}) }).then((r) => r.docs[0] as unknown as T | undefined);
