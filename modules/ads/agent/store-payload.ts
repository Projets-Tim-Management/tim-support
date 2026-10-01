import { sql } from "@payloadcms/db-postgres";
import type { Payload } from "payload";

import type { Usage } from "@/core/lib/ai-pricing";
import { execSql as exec, rowsOf } from "@/core/lib/raw-sql";
import { StepConflictError, type AgentRow, type AgentStore, type Id, type RunRow, type StepRow } from "@/modules/ads/agent/types";

/**
 * Le stockage du moteur d'agents dans la base (collections `ad-agent-runs`,
 * `ad-agents`, `ad-agent-steps`, `ad-decisions`), écrit par le serveur seul
 * (`overrideAccess` : ces collections sont fermées à l'API, même pour un admin).
 *
 * Le verrou d'un passage se pose, se prolonge et se rend en UNE requête SQL
 * conditionnelle : lire puis écrire (ce que fait `payload.update`) laisserait
 * deux exécutions le prendre ensemble. La date d'expiration posée sert de
 * jeton : seul celui qui la détient peut prolonger ou rendre.
 */

const ZERO: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const idOf = (v: unknown): Id => (v && typeof v === "object" ? (v as { id: Id }).id : (v as Id));
const usage = (u: unknown): Usage => ({ ...ZERO, ...((u as Partial<Usage> | null) ?? {}) });


const toRun = (d: Record<string, unknown>): RunRow => ({
  id: d.id as Id,
  campaign: idOf(d.campaign),
  objective: String(d.objective ?? ""),
  status: d.status as RunRow["status"],
  budgetEur: Number(d.budgetEur ?? 0),
  costEur: Number(d.costEur ?? 0),
  tokens: usage(d.tokens),
  summary: (d.summary as string | null) ?? null,
  error: (d.error as string | null) ?? null,
});

const toAgent = (d: Record<string, unknown>): AgentRow => ({
  id: d.id as Id,
  run: idOf(d.run),
  parent: d.parent == null ? null : idOf(d.parent),
  depth: Number(d.depth ?? 0),
  role: d.role as AgentRow["role"],
  status: d.status as AgentRow["status"],
  mission: String(d.mission ?? ""),
  tools: Array.isArray(d.tools) ? (d.tools as string[]) : [],
  model: d.model as AgentRow["model"],
  budgetEur: Number(d.budgetEur ?? 0),
  spentEur: Number(d.spentEur ?? 0),
  tokens: usage(d.tokens),
  result: d.result ?? null,
  error: (d.error as string | null) ?? null,
  createdAt: String(d.createdAt),
});

const toStep = (d: Record<string, unknown>): StepRow => ({
  id: d.id as Id,
  run: idOf(d.run),
  agent: idOf(d.agent),
  seq: Number(d.seq),
  kind: d.kind as StepRow["kind"],
  tool: (d.tool as string | null) ?? null,
  status: d.status as StepRow["status"],
  line: String(d.line ?? ""),
  input: d.input ?? null,
  output: d.output ?? null,
  idempotencyKey: String(d.idempotencyKey),
  costEur: Number(d.costEur ?? 0),
  tokens: d.tokens ? usage(d.tokens) : null,
  startedAt: String(d.startedAt ?? d.createdAt),
});

/** Une clé d'idempotence déjà prise : Postgres refuse (23505), Payload le relaie en erreur de validation « unique ». */
const isUniqueViolation = (e: unknown): boolean => {
  const err = e as { code?: string; cause?: { code?: string }; message?: string; data?: { errors?: { path?: string }[] } };
  return err.code === "23505" || err.cause?.code === "23505" || Boolean(err.data?.errors?.some((x) => x.path === "idempotencyKey")) || /unique|duplicate/i.test(err.message ?? "");
};

export function payloadAgentStore(payload: Payload): AgentStore {
  const common = { overrideAccess: true, depth: 0 } as const;
  return {
    async getRun(id) {
      return toRun((await payload.findByID({ collection: "ad-agent-runs", id, ...common })) as never);
    },
    async updateRun(id, patch) {
      await payload.update({ collection: "ad-agent-runs", id, data: patch as never, ...common });
    },
    async acquireLease(runId, until, now) {
      const rows = rowsOf(
        await exec(
          payload,
          sql`UPDATE "ad_agent_runs" SET "lease_until" = ${until.toISOString()}::timestamptz
              WHERE "id" = ${Number(runId)} AND ("lease_until" IS NULL OR "lease_until" < ${now.toISOString()}::timestamptz) RETURNING "id"`,
        ),
      );
      return rows.length === 1;
    },
    async renewLease(runId, held, until) {
      const rows = rowsOf(
        await exec(
          payload,
          sql`UPDATE "ad_agent_runs" SET "lease_until" = ${until.toISOString()}::timestamptz
              WHERE "id" = ${Number(runId)} AND "lease_until" = ${held.toISOString()}::timestamptz RETURNING "id"`,
        ),
      );
      return rows.length === 1;
    },
    async releaseLease(runId, held) {
      await exec(payload, sql`UPDATE "ad_agent_runs" SET "lease_until" = NULL WHERE "id" = ${Number(runId)} AND "lease_until" = ${held.toISOString()}::timestamptz`);
    },
    async listAgents(runId) {
      const r = await payload.find({ collection: "ad-agents", where: { run: { equals: runId } }, sort: "createdAt", pagination: false, ...common });
      return (r.docs as never[]).map(toAgent);
    },
    async createAgent(data) {
      return toAgent((await payload.create({ collection: "ad-agents", data: { ...data, spentEur: 0 } as never, ...common })) as never);
    },
    async updateAgent(id, patch) {
      await payload.update({ collection: "ad-agents", id, data: patch as never, ...common });
    },
    async listSteps(agentId) {
      const r = await payload.find({ collection: "ad-agent-steps", where: { agent: { equals: agentId } }, sort: "seq", pagination: false, ...common });
      return (r.docs as never[]).map(toStep);
    },
    async createStep(data) {
      try {
        return toStep((await payload.create({ collection: "ad-agent-steps", data: data as never, ...common })) as never);
      } catch (e) {
        if (isUniqueViolation(e)) throw new StepConflictError(data.idempotencyKey);
        throw e;
      }
    },
    async updateStep(id, patch) {
      await payload.update({ collection: "ad-agent-steps", id, data: patch as never, ...common });
    },
    async createDecision(data) {
      const d = await payload.create({ collection: "ad-decisions", data: data as never, ...common });
      return d.id as Id;
    },
    async listDecisions(runId, kind) {
      const r = await payload.find({ collection: "ad-decisions", where: { and: [{ run: { equals: runId } }, { kind: { equals: kind } }] }, sort: "createdAt", pagination: false, ...common });
      return (r.docs as unknown as Record<string, unknown>[]).map((d) => ({
        id: d.id as Id,
        campaign: idOf(d.campaign),
        run: idOf(d.run),
        agent: idOf(d.agent),
        step: idOf(d.step),
        kind: d.kind as never,
        status: d.status as never,
        rationale: String(d.rationale ?? ""),
        after: d.after ?? null,
        guardrail: (d.guardrail as string | null) ?? null,
      }));
    },
  };
}
