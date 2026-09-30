import type Anthropic from "@anthropic-ai/sdk";

import { claudeCostUsd, claudeMaxCostUsd, estimateTokens, usdToEur, type Usage } from "@/core/lib/ai-pricing";
import { canSpend, type AgentLedger } from "@/modules/ads/agent/budget";
import { buildMessages, nextAction, RELANCE, type ModelOutput, type ToolInput } from "@/modules/ads/agent/conversation";
import { LEASE_MS, MAX_CALL_FAILURES, MAX_CONCURRENT, MAX_STEPS_PER_TICK, MAX_TURNS, STEP_MAX_MS } from "@/modules/ads/agent/limits";
import { ROLE_SUBJECT, systemPrompt } from "@/modules/ads/agent/roles";
import { TOOLS } from "@/modules/ads/agent/registry";
import { clip, FINISHED, type ToolContext } from "@/modules/ads/agent/tools";
import { StepConflictError, type AgentDeps, type AgentRow, type RunRow, type StepRow } from "@/modules/ads/agent/types";
import { ADS_AGENT_MAX_TOKENS } from "@/modules/ads/lib/models";
import { AdsBudgetError } from "@/modules/ads/lib/spend";

/**
 * Le moteur de l'agent de campagne (plan Publicité, §9 quater, point 5).
 *
 * Une ÉTAPE à la fois : un appel au modèle, ou un outil. Chaque étape est écrite
 * « en cours » AVANT d'agir (sa clé d'idempotence réserve la place), puis close
 * après. Une coupure au milieu laisse une étape ouverte, que la reprise rejoue ;
 * deux exécutions simultanées se heurtent à la clé, et la seconde s'arrête.
 *
 * Aucun appel ne part sans que son coût MAXIMAL tienne dans ce qui reste à
 * l'agent, puis dans le plafond global des agents (jour, mois). Le budget d'un
 * parent se réserve pour ses enfants : un enfant fini ne compte plus que ce
 * qu'il a réellement consommé.
 *
 * Ce qu'un agent a dépensé se RECOMPTE à partir de ses étapes (la seule
 * écriture qui porte le coût) : une coupure entre deux écritures ne fait
 * jamais perdre une dépense, elle retarde seulement sa remontée.
 */

const ZERO: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
const add = (a: Usage, b: Usage): Usage => ({ input: a.input + b.input, output: a.output + b.output, cacheRead: a.cacheRead + b.cacheRead, cacheWrite: a.cacheWrite + b.cacheWrite });
const sameUsage = (a: Usage, b: Usage) => a.input === b.input && a.output === b.output && a.cacheRead === b.cacheRead && a.cacheWrite === b.cacheWrite;
const round4 = (n: number) => Math.round(n * 10_000) / 10_000;
const iso = (d: Date) => d.toISOString();

/** Ce qu'un agent a consommé, sous-agents compris : réel pour un enfant fini, réservé pour un enfant en cours. */
function consumption(agent: AgentRow, agents: AgentRow[]): number {
  return agent.spentEur + agents.filter((c) => c.parent === agent.id).reduce((sum, c) => sum + (FINISHED.includes(c.status) ? consumption(c, agents) : c.budgetEur), 0);
}

export function ledgerOf(agent: AgentRow, agents: AgentRow[]): AgentLedger {
  return { budgetEur: agent.budgetEur, spentEur: agent.spentEur, reservedForChildrenEur: consumption(agent, agents) - agent.spentEur };
}

const lineOfModel = (agent: AgentRow, out: ModelOutput): string => {
  const tools = out.content.filter((b) => b.type === "tool_use").map((b) => (b as Anthropic.ToolUseBlock).name);
  const text = out.content.find((b): b is Anthropic.TextBlock => b.type === "text")?.text.trim();
  if (tools.length) return `${ROLE_SUBJECT[agent.role]} décide : ${tools.join(", ")}.`;
  return `${ROLE_SUBJECT[agent.role]} répond${text ? ` : ${clip(text)}` : "."}`;
};

type AdvanceResult = "avance" | "attente" | "fin" | "pause-budget";

/** Dépense et tokens d'un agent, tels que ses étapes les portent. */
function totalsOf(steps: StepRow[]): { spentEur: number; tokens: Usage } {
  return steps.reduce((t, s) => ({ spentEur: round4(t.spentEur + (s.costEur ?? 0)), tokens: add(t.tokens, s.tokens ?? ZERO) }), { spentEur: 0, tokens: ZERO });
}

/** Aligne l'agent sur ses étapes s'il a pris du retard (coupure entre deux écritures). */
async function reconcile(deps: AgentDeps, agent: AgentRow, steps: StepRow[]): Promise<void> {
  const t = totalsOf(steps);
  if (t.spentEur === agent.spentEur && sameUsage(t.tokens, agent.tokens)) return;
  await deps.store.updateAgent(agent.id, t);
  Object.assign(agent, t);
}

async function fail(deps: AgentDeps, agent: AgentRow, reason: string): Promise<AdvanceResult> {
  await deps.store.updateAgent(agent.id, { status: "echoue", error: reason });
  return "fin";
}

async function callModel(deps: AgentDeps, run: RunRow, agent: AgentRow, agents: AgentRow[], steps: StepRow[], existing?: StepRow): Promise<AdvanceResult> {
  const tools = agent.tools.filter((t) => TOOLS[t]).map((t) => TOOLS[t].definition);
  const req = { model: agent.model, system: systemPrompt(agent.role), messages: buildMessages(run, agent, steps), tools, maxTokens: ADS_AGENT_MAX_TOKENS };
  const maxEur = usdToEur(claudeMaxCostUsd(agent.model, estimateTokens(JSON.stringify(req)), ADS_AGENT_MAX_TOKENS));

  const own = canSpend(ledgerOf(agent, agents), maxEur);
  if (own !== true) return fail(deps, agent, `Budget de l'agent épuisé. ${own}`);
  try {
    await deps.budget.assert(maxEur, deps.now());
  } catch (e) {
    if (e instanceof AdsBudgetError) {
      await deps.store.updateRun(run.id, { status: "en-pause-budget", error: e.message });
      return "pause-budget";
    }
    throw e;
  }

  const seq = existing?.seq ?? (steps.at(-1)?.seq ?? -1) + 1;
  const step =
    existing ??
    (await deps.store.createStep({
      run: run.id,
      agent: agent.id,
      seq,
      kind: "modele",
      tool: null,
      status: "en-cours",
      line: `${ROLE_SUBJECT[agent.role]} réfléchit…`,
      input: null,
      output: null,
      idempotencyKey: `${agent.id}:${seq}`,
      startedAt: iso(deps.now()),
    }));

  let res;
  try {
    res = await deps.model(req);
  } catch (e) {
    await deps.store.updateStep(step.id, { status: "echoue", line: `${ROLE_SUBJECT[agent.role]} : appel au modèle en échec (${(e as Error).message}).`, finishedAt: iso(deps.now()) });
    return "avance";
  }

  const usd = claudeCostUsd(agent.model, res.usage);
  const costEur = round4(usdToEur(usd));
  await deps.budget.record({ run: run.id, agent: agent.id, campaign: run.campaign, model: agent.model, usd, usage: res.usage, detail: `${agent.role} — tour ${seq + 1}` });
  const output: ModelOutput = { content: res.content, stopReason: res.stopReason };
  await deps.store.updateStep(step.id, { status: "fait", output, tokens: res.usage, costEur, line: lineOfModel(agent, output), finishedAt: iso(deps.now()) });
  // Le total vient des étapes (celle-ci comprise) ; celui du passage, de ses agents (tickRun).
  await reconcile(deps, agent, [...steps.filter((s) => s.id !== step.id), { ...step, costEur, tokens: res.usage }]);
  return "avance";
}

async function runTool(deps: AgentDeps, run: RunRow, agent: AgentRow, agents: AgentRow[], steps: StepRow[], toolUse: Anthropic.ToolUseBlock, existing?: StepRow): Promise<AdvanceResult> {
  const seq = existing?.seq ?? (steps.at(-1)?.seq ?? -1) + 1;
  const input: ToolInput = { toolUseId: toolUse.id, input: (toolUse.input ?? {}) as Record<string, unknown> };
  const step =
    existing ??
    (await deps.store.createStep({
      run: run.id,
      agent: agent.id,
      seq,
      kind: "outil",
      tool: toolUse.name,
      status: "en-cours",
      line: `${ROLE_SUBJECT[agent.role]} utilise « ${toolUse.name} »…`,
      input,
      output: null,
      idempotencyKey: `${agent.id}:${seq}`,
      startedAt: iso(deps.now()),
    }));

  const tool = agent.tools.includes(toolUse.name) ? TOOLS[toolUse.name] : undefined;
  if (!tool) {
    const reason = `Outil non autorisé pour ce rôle : « ${toolUse.name} ».`;
    await deps.store.updateStep(step.id, { status: "fait", output: { result: { refus: reason }, isError: true }, line: `${ROLE_SUBJECT[agent.role]} : ${reason}`, finishedAt: iso(deps.now()) });
    return "avance";
  }

  const ctx: ToolContext = { deps, run, agent, agents, step, ledger: (a) => ledgerOf(a, agents) };
  const outcome = await tool.run(ctx, input.input);
  if (outcome.kind === "wait") return "attente";
  // Ce que l'outil a payé (des textes écrits par l'atelier) entre dans la dépense de l'agent, par son étape.
  const costEur = outcome.kind === "ok" && outcome.costEur ? round4(outcome.costEur) : 0;
  await deps.store.updateStep(step.id, {
    status: "fait",
    output: { result: outcome.output, ...(outcome.kind === "ok" && outcome.isError ? { isError: true } : {}) },
    line: outcome.line,
    costEur,
    finishedAt: iso(deps.now()),
  });
  if (costEur) await reconcile(deps, agent, [...steps.filter((s) => s.id !== step.id), { ...step, costEur }]);
  if (outcome.kind === "finish") {
    await deps.store.updateAgent(agent.id, { status: "termine", result: outcome.result });
    return "fin";
  }
  return "avance";
}

/** Fait avancer un agent d'UNE étape. */
async function advanceAgent(deps: AgentDeps, run: RunRow, agent: AgentRow, agents: AgentRow[], steps: StepRow[]): Promise<AdvanceResult> {
  await reconcile(deps, agent, steps);
  const action = nextAction(steps, MAX_TURNS, MAX_CALL_FAILURES);
  switch (action.kind) {
    case "fail":
      return fail(deps, agent, action.reason);
    case "call":
      return callModel(deps, run, agent, agents, steps);
    case "tool":
      return runTool(deps, run, agent, agents, steps, action.toolUse);
    case "relance": {
      const seq = (steps.at(-1)?.seq ?? -1) + 1;
      const step = await deps.store.createStep({
        run: run.id,
        agent: agent.id,
        seq,
        kind: "outil",
        tool: RELANCE,
        status: "en-cours",
        line: `${ROLE_SUBJECT[agent.role]} s'est arrêté sans rendre de résultat : rappel envoyé.`,
        input: null,
        output: null,
        idempotencyKey: `${agent.id}:${seq}`,
        startedAt: iso(deps.now()),
      });
      await deps.store.updateStep(step.id, { status: "fait", finishedAt: iso(deps.now()) });
      return "avance";
    }
    case "resume": {
      const open = action.step;
      if (open.kind === "modele") return callModel(deps, run, agent, agents, steps.filter((s) => s !== open), open);
      if (open.tool === RELANCE) {
        await deps.store.updateStep(open.id, { status: "fait", finishedAt: iso(deps.now()) });
        return "avance";
      }
      // Rejouer l'outil avec la MÊME demande : on la retrouve dans le dernier message du modèle.
      const { toolUseId, input } = open.input as ToolInput;
      return runTool(deps, run, agent, agents, steps, { type: "tool_use", id: toolUseId, name: open.tool ?? "", input } as Anthropic.ToolUseBlock, open);
    }
  }
}

export type TickResult = { outcome: "occupe" | "pause-budget" | "en-cours" | "a-valider" | "echoue" | "arrete"; steps: number };

/**
 * Un agent qui attend ses sous-agents (étape d'attente ouverte, ou demandée et
 * pas encore ouverte) ne travaille pas : il ne prend donc pas de place.
 */
function isWaiting(steps: StepRow[]): boolean {
  const next = nextAction(steps, MAX_TURNS, MAX_CALL_FAILURES);
  return (next.kind === "resume" && next.step.tool === "attendre_sous_agents") || (next.kind === "tool" && next.toolUse.name === "attendre_sous_agents");
}

/**
 * Fait avancer un passage tant qu'une étape peut encore tenir avant `deadline`
 * (la fin de la fonction) : jamais une étape qui risquerait d'être coupée en vol.
 *
 * Tient le verrou du passage pendant tout ce temps et le prolonge après chaque
 * étape ; s'il l'a perdu (expiré, repris par une autre exécution), il s'arrête
 * sans rien écrire de plus. Il ne rend que le verrou qu'il tient.
 */
export async function tickRun(deps: AgentDeps, runId: RunRow["id"], deadline: Date): Promise<TickResult> {
  const { store, now } = deps;
  let held = new Date(now().getTime() + LEASE_MS);
  if (!(await store.acquireLease(runId, held, now()))) return { outcome: "occupe", steps: 0 };
  let count = 0;
  let lost = false;
  const finish = async (status: "a-valider" | "echoue", patch: { summary?: string | null; error?: string | null }): Promise<TickResult> => {
    await store.updateRun(runId, { status, ...patch, finishedAt: iso(now()) });
    return { outcome: status, steps: count };
  };
  try {
    while (count < MAX_STEPS_PER_TICK && now().getTime() + STEP_MAX_MS <= deadline.getTime()) {
      const run = await store.getRun(runId);
      if (run.status === "en-pause-budget") return { outcome: "pause-budget", steps: count };
      if (run.status !== "en-cours") return { outcome: run.status, steps: count };
      let agents = await store.listAgents(runId);

      // Le coût et les tokens du passage : la somme de ses agents.
      const totals = agents.reduce((t, a) => ({ costEur: round4(t.costEur + a.spentEur), tokens: add(t.tokens, a.tokens) }), { costEur: 0, tokens: ZERO });
      if (totals.costEur !== run.costEur || !sameUsage(totals.tokens, run.tokens)) await store.updateRun(runId, totals);

      const root = agents.find((a) => a.depth === 0);
      if (!root) return finish("echoue", { error: "Aucun orchestrateur." });
      if (root.status === "termine") return finish("a-valider", { summary: (root.result as { resume?: string } | null)?.resume ?? null });
      if (root.status === "echoue" || root.status === "arrete") return finish("echoue", { error: root.error ?? "L'orchestrateur s'est arrêté." });

      // Un agent fini ne laisse pas tourner ses sous-agents : personne ne lirait leur résultat.
      const stopped = new Set(agents.filter((a) => FINISHED.includes(a.status)).map((a) => a.id));
      for (const a of [...agents].sort((x, y) => x.depth - y.depth)) {
        if (!FINISHED.includes(a.status) && a.parent != null && stopped.has(a.parent)) {
          await store.updateAgent(a.id, { status: "arrete", error: "Arrêté : son parent a fini sans l'attendre." });
          stopped.add(a.id);
        }
      }

      // Les sous-agents en file prennent les places libres. Un agent qui attend ses enfants n'en occupe pas.
      const stepsOf = new Map<AgentRow["id"], StepRow[]>();
      for (const a of agents.filter((x) => x.status === "en-cours")) stepsOf.set(a.id, await store.listSteps(a.id));
      let active = agents.filter((a) => a.depth > 0 && a.status === "en-cours" && !stopped.has(a.id) && !isWaiting(stepsOf.get(a.id) ?? [])).length;
      for (const a of agents.filter((x) => x.status === "en-attente" && !stopped.has(x.id))) {
        if (active >= MAX_CONCURRENT) break;
        await store.updateAgent(a.id, { status: "en-cours" });
        active++;
      }
      agents = await store.listAgents(runId);

      // Les plus profonds d'abord : un parent qui attend ses enfants n'a rien à faire avant eux.
      const runnable = agents.filter((a) => a.status === "en-cours").sort((a, b) => b.depth - a.depth);
      let progressed = false;
      for (const agent of runnable) {
        const steps = stepsOf.get(agent.id) ?? (await store.listSteps(agent.id));
        const r = await advanceAgent(deps, run, agent, agents, steps);
        if (r === "pause-budget") return { outcome: "pause-budget", steps: count };
        if (r === "attente") continue;
        progressed = true;
        count++;
        const next = new Date(now().getTime() + LEASE_MS);
        if (!(await store.renewLease(runId, held, next))) {
          lost = true;
          return { outcome: "occupe", steps: count };
        }
        held = next;
        break; // l'état a changé : on relit tout avant l'étape suivante
      }
      // Plus rien ne peut avancer alors que l'orchestrateur tourne : c'est un blocage, pas une attente.
      if (!progressed) return finish("echoue", { error: "Plus rien n'avance : tous les agents en cours attendent des sous-agents qui ne peuvent pas démarrer." });
    }
    return { outcome: "en-cours", steps: count };
  } catch (e) {
    if (e instanceof StepConflictError) return { outcome: "occupe", steps: count };
    throw e;
  } finally {
    if (!lost) await store.releaseLease(runId, held);
  }
}
