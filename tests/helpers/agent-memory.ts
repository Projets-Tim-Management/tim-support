import type Anthropic from "@anthropic-ai/sdk";
import { vi } from "vitest";

import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import { StepConflictError, type AgentRow, type AgentStore, type Id, type ModelRequest, type ModelResponse, type NewDecision, type RunRow, type StepRow } from "@/modules/ads/agent/types";

/**
 * Aides partagées par les tests de l'agent de campagne (moteur, outils) : un
 * stockage en mémoire fidèle au contrat d'AgentStore, et un faux modèle qui
 * rejoue un scénario par mission.
 */

// ─── Un stockage en mémoire, fidèle au contrat d'AgentStore ─────────────────

const ZERO = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export function memoryStore() {
  let id = 0;
  let clock = 0; // createdAt strictement croissant, comme en base
  const runs = new Map<Id, RunRow & { leaseUntil?: Date | null; finishedAt?: string }>();
  const agents: AgentRow[] = [];
  const steps: StepRow[] = [];
  const decisions: (NewDecision & { id: Id })[] = [];
  const stamp = () => new Date(Date.UTC(2026, 9, 5, 8, 0, 0) + clock++).toISOString();
  const store: AgentStore = {
    async getRun(i) {
      return { ...runs.get(i)! };
    },
    async updateRun(i, patch) {
      Object.assign(runs.get(i)!, patch);
    },
    async acquireLease(i, until, now) {
      const r = runs.get(i)!;
      if (r.leaseUntil && r.leaseUntil >= now) return false;
      r.leaseUntil = until;
      return true;
    },
    async renewLease(i, held, until) {
      const r = runs.get(i)!;
      if (r.leaseUntil?.getTime() !== held.getTime()) return false;
      r.leaseUntil = until;
      return true;
    },
    async releaseLease(i, held) {
      const r = runs.get(i)!;
      if (r.leaseUntil?.getTime() === held.getTime()) r.leaseUntil = null;
    },
    async listAgents(run) {
      return agents.filter((a) => a.run === run).map((a) => ({ ...a }));
    },
    async createAgent(data) {
      const a: AgentRow = { ...data, id: ++id, spentEur: 0, tokens: { ...ZERO }, createdAt: stamp() };
      agents.push(a);
      return { ...a };
    },
    async updateAgent(i, patch) {
      Object.assign(agents.find((a) => a.id === i)!, patch);
    },
    async listSteps(agent) {
      return steps.filter((s) => s.agent === agent).sort((a, b) => a.seq - b.seq).map((s) => ({ ...s }));
    },
    async createStep(data) {
      if (steps.some((s) => s.idempotencyKey === data.idempotencyKey)) throw new StepConflictError(data.idempotencyKey);
      const s: StepRow = { ...data, id: ++id, costEur: 0, startedAt: stamp() };
      steps.push(s);
      return { ...s };
    },
    async updateStep(i, patch) {
      Object.assign(steps.find((s) => s.id === i)!, patch);
    },
    async createDecision(d) {
      const row = { ...d, id: ++id };
      decisions.push(row);
      return row.id;
    },
    async listDecisions(run, kind) {
      return decisions.filter((d) => d.run === run && d.kind === kind);
    },
  };
  const newRun = (budgetEur = 5) => {
    const r: RunRow = { id: ++id, campaign: 77, objective: "Des démos auprès des PME du BTP", status: "en-cours", budgetEur, costEur: 0, tokens: { ...ZERO } };
    runs.set(r.id, r);
    return r;
  };
  const newRoot = async (run: RunRow) =>
    store.createAgent({ run: run.id, parent: null, depth: 0, role: "orchestrateur", status: "en-cours", mission: "Préparer la campagne", tools: [...ROLE_TOOLS.orchestrateur, "terminer"], model: "claude-opus-5-5", budgetEur: run.budgetEur });
  return { store, runs, agents, steps, decisions, newRun, newRoot };
}

// ─── Un faux modèle : un scénario par mission ───────────────────────────────

export const toolCall = (id: string, name: string, input: Record<string, unknown>) => ({ type: "tool_use", id, name, input }) as Anthropic.ContentBlock;
export const say = (text: string) => ({ type: "text", text, citations: null }) as Anthropic.ContentBlock;
export const reply = (stopReason: string, ...content: Anthropic.ContentBlock[]): ModelResponse => ({ content, stopReason, usage: { input: 1_000, output: 500, cacheRead: 0, cacheWrite: 0 } });

/** Chaque appel reçoit la réponse suivante du scénario dont la clé figure dans la mission. */
export function scripted(scenarios: Record<string, ModelResponse[]>) {
  const calls: ModelRequest[] = [];
  const model = vi.fn(async (req: ModelRequest) => {
    calls.push(req);
    const first = String(req.messages[0].content);
    const key = Object.keys(scenarios).find((k) => first.includes(k));
    const next = key ? scenarios[key].shift() : undefined;
    if (!next) throw new Error(`Scénario épuisé pour : ${first.slice(0, 60)}`);
    return next;
  });
  return { model, calls };
}


/** Un port qui ne doit pas servir dans ce test : tout appel échoue en le disant. */
export const unusedPort = <T extends object>(label: string): T =>
  new Proxy({} as T, {
    get: (_t, name) => () => {
      throw new Error(`${label}.${String(name)} appelé alors que ce test ne s'en sert pas`);
    },
  });
