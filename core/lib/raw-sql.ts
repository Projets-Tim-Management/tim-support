import type { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

/**
 * Exécuter une requête SQL brute sur la base de Payload — pour ce qui doit se
 * jouer en UNE requête conditionnelle (un verrou, un compteur, un geste qui
 * n'arrive qu'une fois) : lire puis écrire laisserait passer deux requêtes
 * simultanées.
 */
export type SqlRows = { rows?: Record<string, unknown>[] } | Record<string, unknown>[];

export const rowsOf = (r: SqlRows): Record<string, unknown>[] => (Array.isArray(r) ? r : (r.rows ?? []));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const execSql = (payload: Payload, q: ReturnType<typeof sql>) => (payload.db as any).drizzle.execute(q) as Promise<SqlRows>;
