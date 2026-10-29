import type Anthropic from "@anthropic-ai/sdk";

import type { ClaudeModel, Usage } from "@/core/lib/ai-pricing";
import type { CampaignBudget, Split } from "@/modules/ads/agent/budget";
import type { AcquisitionSummary } from "@/modules/ads/agent/sources/acquisition";
import type { LibraryAd, LibraryQuery } from "@/modules/ads/agent/sources/ad-library";
import type { SitePage } from "@/modules/ads/agent/sources/site";
import type { RunStatus } from "@/modules/ads/collections/AdAgentRuns";
import type { AgentRole, AgentStatus } from "@/modules/ads/collections/AdAgents";
import type { DecisionKind, DecisionStatus } from "@/modules/ads/collections/AdDecisions";
import type { RushForAgent } from "@/modules/ads/lib/design-brief/load";
import type { TargetingKind, TargetingOption } from "@/modules/ads/platforms/types";
import type { DesignIntent } from "@/modules/ads/lib/design-brief/prompt";

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
  /** La photo des consignes et du carnet prise au lancement (agent/notebook.ts). */
  instructionsRead?: unknown;
  learningsRead?: unknown;
  /** Le rythme du passage : la préparation d'un brouillon, ou le suivi d'une campagne en ligne. */
  kind?: "preparation" | "quotidien" | "hebdomadaire" | "mensuel";
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
  /** Les appuis cités, vérifiés contre la photo du passage, texte copié. */
  instructions?: Id[];
  learnings?: Id[];
  citations?: { ref: string; text: string }[];
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
  /** Renvoie l'identifiant de la décision, pour qu'on puisse y renvoyer (répartition en vigueur, fil). */
  createDecision(data: NewDecision): Promise<Id>;
  /** Les décisions d'un passage, d'un type donné, dans l'ordre. */
  listDecisions(runId: Id, kind: DecisionKind): Promise<(NewDecision & { id: Id })[]>;
}

/** Une créa, telle qu'un agent la voit. */
export type CreativeView = {
  id: Id;
  angle: string;
  requestedAngle: string | null;
  status: string;
  publishable: boolean;
  /** Le brief Claude Design est écrit (prompt, formats, rushes). */
  hasBrief: boolean;
  /** Les fichiers finis encore attendus de Charlie (« 9:16 vidéo »…). */
  missingFiles: string[];
  texts: { kind: string; text: string; status: string; reason: string | null }[];
};

/**
 * L'atelier de créas (phase 3a), vu par l'agent. Chaque méthode APPELLE le code
 * de l'atelier (génération, garde-fous, rendu, file « À valider ») : l'agent ne
 * recopie rien. Branché sur Payload au commit 6 ; faux dans les tests.
 */
export interface AtelierPort {
  /** Le brief, le kit de marque et les faits, résumés pour un modèle ; le quota de la semaine. */
  brief(campaign: Id): Promise<{ resume: string; quotaRestant: number }>;
  /** Fait écrire les textes des angles demandés par l'atelier (garde-fous compris). `preCheck` : budget de l'agent. */
  generate(
    campaign: Id,
    req: { run: Id; agent: Id; angles: string[]; toneTest: boolean; preCheck: (maxEur: number) => Promise<void> },
  ): Promise<{ creatives: CreativeView[]; costEur: number }>;
  // Chaque méthode qui touche une créa ne voit que celles de la campagne du passage : une créa d'une autre
  // campagne est introuvable pour l'agent (relecture du 01/10/2026, M3).
  creatives(campaign: Id, ids: Id[]): Promise<CreativeView[]>;
  /** Passe des créas « À valider » ; celles qui ne sont pas publiables restent, avec la raison. */
  submit(campaign: Id, ids: Id[]): Promise<{ submitted: Id[]; skipped: { id: Id; reason: string }[] }>;
  /** Les rushes importés : ce qu'on y voit, les fonctionnalités montrées — de quoi choisir ceux à joindre. */
  rushes(): Promise<RushForAgent[]>;
  /**
   * Écrit le brief Claude Design d'une créa : le serveur assemble le prompt (textes, Base V1, kit,
   * zones sûres, noms de fichiers) autour de l'intention de l'agent. Lève avec la raison d'un refus.
   */
  writeBrief(campaign: Id, creative: Id, req: DesignIntent & { rushes: Id[] }): Promise<{ prompt: string; files: string[] }>;
  campaignBudget(campaign: Id): Promise<CampaignBudget | null>;
  setSplit(campaign: Id, split: Split, decision: Id, at: Date): Promise<void>;
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

/**
 * Les sources du stratège (plan, §9 quater, point 2 ; commit 5) : le site de
 * TIM (domaine en liste blanche), les leads et clients en chiffres anonymes, la
 * bibliothèque publicitaire Meta pour les concurrents suivis.
 */
export interface SourcesPort {
  site(urls?: string[]): Promise<{ pages: SitePage[]; refused: string[]; failed: string[] }>;
  acquisition(months: number): Promise<AcquisitionSummary>;
  /** Les concurrents SUIVIS (ajoutés ou validés par Charlie) — jamais ceux seulement proposés. */
  competitors(): Promise<{ pageId: string; name: string }[]>;
  adLibrary(q: LibraryQuery): Promise<LibraryAd[]>;
  /** Le ciblage officiel de la régie, cherché avec le compte de la campagne (intérêts, métiers, régions). */
  targeting(campaign: Id, kind: TargetingKind, query: string): Promise<TargetingOption[]>;
  /** Le compte de la campagne a-t-il un pixel ? (Optimiser sur les conversions l'exige.) */
  hasPixel(campaign: Id): Promise<boolean>;
  /** Propose un concurrent : il n'entre dans la liste qu'après validation de Charlie. */
  proposeCompetitor(c: { pageId: string; name: string; keywords: string; rationale: string; run: Id }): Promise<"propose" | "deja-connu">;
}

/**
 * Le suivi d'une campagne EN LIGNE (plan, §9 nonies, étape 3) : ce que
 * l'analyste lit (rapport calculé par le code, journal) et ce par quoi il agit
 * — toujours sous les garde-fous de `submitAction`, jamais chez Meta en direct.
 */
export interface SuiviPort {
  report(campaign: Id, days: number): Promise<import("@/modules/ads/lib/followup-report").CampaignReport>;
  /** Les décisions et alertes récentes de la campagne, les plus récentes d'abord. */
  journal(campaign: Id, days: number): Promise<{ decisions: { le: string; type: string; etat: string; quoi: string; pourquoi: string; gardeFou: string | null }[]; alertes: { le: string; type: string; constat: string; close: boolean }[] }>;
  /** Une action, jugée par les garde-fous. Le budget de départ est relu chez nous, jamais pris au modèle. */
  act(
    campaign: Id,
    req: { kind: "budget" | "pause" | "activation"; level: "campaign" | "adset" | "ad"; externalId: string; toEur?: number },
    rationale: string,
    origin: { run: Id; agent: Id; step: Id },
    extra: Record<string, unknown>,
  ): Promise<{ decision: Id; outcome: "executer" | "proposer" | "bloquer"; reasons: string[]; error: string | null; summary: string }>;
  /** Les tests A/B de la campagne : celui en cours et les derniers clos, avec le verdict du code. */
  tests(campaign: Id): Promise<{ id: Id; hypothese: string; dimension: string; metrique: string; etat: string; ouEnEst: string | null; gagnant: string | null; confiance: string | null; variantes: unknown; resultats: unknown; interpretation: string | null; ouvertLe: string }[]>;
  openTest(campaign: Id, t: { hypothesis: string; dimension: string; metric: string; variants: { label: string; ads: string[] }[] }, run: Id): Promise<Id>;
  /** L'interprétation d'un test clos de la campagne, par l'analyste. */
  interpret(campaign: Id, test: Id, text: string): Promise<void>;
  /** Un apprentissage de la campagne, né d'un résultat ; « global » le propose seulement (Charlie valide). */
  learn(campaign: Id, l: { statement: string; confidence: "faible" | "moyenne" | "forte"; global: boolean; decision: Id | null }): Promise<Id>;
}

export type AgentDeps = { store: AgentStore; model: AgentModelCall; budget: GlobalBudget; atelier: AtelierPort; sources: SourcesPort; suivi?: SuiviPort; now: () => Date };
