import type Anthropic from "@anthropic-ai/sdk";

import type { ClaudeModel, Usage } from "@/core/lib/ai-pricing";
import type { RunStatus } from "@/modules/ads/collections/AdAgentRuns";
import type { AgentRole, AgentStatus } from "@/modules/ads/collections/AdAgents";
import type { DecisionKind, DecisionStatus } from "@/modules/ads/collections/AdDecisions";

/**
 * Les formes que manipule le moteur d'agents (plan Publicité, §9 quater, point 5).
 *
 * Le moteur ne connaît pas Payload : il parle à un `AgentStore`. En production,
 * c'est la base (collections `ad-agent-runs`, `ad-agents`, `ad-agent-steps`,
 * `ad-decisions`) ; en test, une mémoire. Même chose pour le modèle et le
 * budget global : tout ce qui sort du processus passe par `AgentDeps`.
 */

export type Id = number | string;

export type RunRow = {
  id: Id;
  campaign: Id;
  objective: string;
  status: RunStatus;
  budgetEur: number;
  costEur: number;
  tokens: Usage;
  summary?: string | null;
  error?: string | null;
};

export type AgentRow = {
  id: Id;
  run: Id;
  parent: Id | null;
  depth: number;
  role: AgentRole;
  status: AgentStatus;
  mission: string;
  tools: string[];
  model: ClaudeModel;
  budgetEur: number;
  spentEur: number;
  tokens: Usage;
  result?: unknown;
  error?: string | null;
  createdAt: string;
};

export type StepStatus = "en-cours" | "fait" | "echoue";

export type StepRow = {
  id: Id;
  run: Id;
  agent: Id;
  seq: number;
  kind: "modele" | "outil";
  tool: string | null;
  status: StepStatus;
  line: string;
  input: unknown;
  output: unknown;
  idempotencyKey: string;
  costEur: number;
  tokens?: Usage | null;
  startedAt: string;
};

export type NewAgent = Omit<AgentRow, "id" | "createdAt" | "spentEur" | "tokens" | "result" | "error">;
export type NewStep = Omit<StepRow, "id" | "costEur" | "tokens">;
export type NewDecision = {
  campaign: Id;
  run: Id;
  agent: Id;
  step: Id;
  kind: DecisionKind;
  status: DecisionStatus;
  rationale: string;
  after?: unknown;
  guardrail?: string | null;
};

/** Deux exécutions ont voulu écrire la même étape : la seconde s'arrête (clé d'idempotence unique). */
export class StepConflictError extends Error {
  constructor(key: string) {
    super(`Étape déjà écrite par une autre exécution : ${key}`);
    this.name = "StepConflictError";
  }
}

export interface AgentStore {
  getRun(id: Id): Promise<RunRow>;
  updateRun(id: Id, patch: Partial<Omit<RunRow, "id">> & { finishedAt?: string }): Promise<void>;
  /**
   * Pose le verrou si personne ne le tient (ou s'il a expiré). Atomique. La
   * date d'expiration posée SERT DE JETON : seul celui qui la détient peut
   * prolonger ou rendre le verrou — une exécution dont le verrou a expiré et
   * été repris ne libère pas celui de l'autre.
   */
  acquireLease(runId: Id, until: Date, now: Date): Promise<boolean>;
  /** Prolonge le verrou SI on le tient encore (`held`) ; faux sinon. */
  renewLease(runId: Id, held: Date, until: Date): Promise<boolean>;
  /** Rend le verrou SI on le tient encore. */
  releaseLease(runId: Id, held: Date): Promise<void>;
  /** Dans l'ordre de création. */
  listAgents(runId: Id): Promise<AgentRow[]>;
  createAgent(data: NewAgent): Promise<AgentRow>;
  updateAgent(id: Id, patch: Partial<Omit<AgentRow, "id">>): Promise<void>;
  /** Dans l'ordre des rangs. */
  listSteps(agentId: Id): Promise<StepRow[]>;
  /** Lève `StepConflictError` si la clé d'idempotence existe déjà. */
  createStep(data: NewStep): Promise<StepRow>;
  updateStep(id: Id, patch: Partial<Omit<StepRow, "id">> & { finishedAt?: string }): Promise<void>;
  createDecision(data: NewDecision): Promise<void>;
}

export type ModelRequest = {
  model: ClaudeModel;
  system: string;
  messages: Anthropic.MessageParam[];
  tools: Anthropic.Tool[];
  maxTokens: number;
};

export type ModelResponse = { content: Anthropic.ContentBlock[]; stopReason: string | null; usage: Usage };

export type AgentModelCall = (req: ModelRequest) => Promise<ModelResponse>;

export interface GlobalBudget {
  /** Lève `AdsBudgetError` si le coût maximal ne tient pas dans le plafond global des agents (jour, mois). */
  assert(maxEur: number, now: Date): Promise<void>;
  record(entry: { run: Id; agent: Id; campaign: Id; model: ClaudeModel; usd: number; usage: Usage; detail: string }): Promise<void>;
}

export type AgentDeps = { store: AgentStore; model: AgentModelCall; budget: GlobalBudget; now: () => Date };
