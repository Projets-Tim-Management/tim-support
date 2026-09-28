import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

/**
 * Les gestes de signature qui ne doivent se produire qu'UNE fois — envoyer un
 * contrat, consommer un code, compter un essai — se jouent en une seule
 * requête SQL conditionnelle. Lire l'état puis l'écrire (ce que fait
 * `payload.update`) laisse deux requêtes simultanées passer toutes les deux :
 * deux PDF, deux e-mails, ou dix essais de code au lieu de cinq.
 *
 * Tables et colonnes viennent de la liste ci-dessous, jamais de l'appelant.
 */

const CODES = {
  signature: { table: "electronic_signatures", hash: "code_hash", attempts: "attempts" },
  countersign: { table: "client_contracts", hash: "countersign_code_hash", attempts: "countersign_attempts" },
} as const;

export type CodeTarget = keyof typeof CODES;

type Rows = { rows?: Record<string, unknown>[] } | Record<string, unknown>[];
const rowsOf = (r: Rows) => (Array.isArray(r) ? r : (r.rows ?? []));
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const exec = (payload: Payload, q: ReturnType<typeof sql>) => (payload.db as any).drizzle.execute(q) as Promise<Rows>;

/**
 * Compte un essai AVANT de comparer le code. Renvoie le nombre d'essais
 * consommés, ou null si la limite était déjà atteinte (code verrouillé).
 */
export async function spendAttempt(payload: Payload, target: CodeTarget, id: number | string, max: number): Promise<number | null> {
  const { table, attempts } = CODES[target];
  const col = sql.raw(`"${attempts}"`);
  const rows = rowsOf(
    await exec(
      payload,
      sql`UPDATE ${sql.raw(`"${table}"`)} SET ${col} = COALESCE(${col}, 0) + 1
          WHERE id = ${Number(id)} AND COALESCE(${col}, 0) < ${max} RETURNING ${col} AS n`,
    ),
  );
  return rows.length ? Number(rows[0].n) : null;
}

/**
 * Consomme le code : il ne sert qu'une fois. false si une autre requête l'a
 * déjà consommé — la signature est alors en cours ou faite.
 */
export async function consumeCode(payload: Payload, target: CodeTarget, id: number | string): Promise<boolean> {
  const { table, hash } = CODES[target];
  const col = sql.raw(`"${hash}"`);
  const rows = rowsOf(
    await exec(payload, sql`UPDATE ${sql.raw(`"${table}"`)} SET ${col} = NULL WHERE id = ${Number(id)} AND ${col} IS NOT NULL RETURNING id`),
  );
  return rows.length > 0;
}

/**
 * Fait passer un contrat d'un statut à un autre, si et seulement s'il est
 * encore dans le statut attendu. false : quelqu'un l'a fait avant.
 */
export async function moveContractStatus(payload: Payload, id: number | string, from: string, to: string): Promise<boolean> {
  const rows = rowsOf(
    await exec(payload, sql`UPDATE "client_contracts" SET "status" = ${to} WHERE id = ${Number(id)} AND "status" = ${from} RETURNING id`),
  );
  return rows.length > 0;
}
