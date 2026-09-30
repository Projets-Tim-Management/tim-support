import type Anthropic from "@anthropic-ai/sdk";

import { canReserve, type AgentLedger } from "@/modules/ads/agent/budget";
import { MAX_AGENTS_PER_RUN, MAX_DEPTH } from "@/modules/ads/agent/limits";
import { CREATABLE_ROLES, ROLE_SUBJECT, ROLE_TOOLS, type CreatableRole } from "@/modules/ads/agent/roles";
import type { AgentDeps, AgentRow, RunRow, StepRow } from "@/modules/ads/agent/types";
import { AGENT_ROLES, type AgentStatus } from "@/modules/ads/collections/AdAgents";
import { ADS_AGENT_MODELS } from "@/modules/ads/lib/models";
import { eur } from "@/modules/ads/lib/spend";

/**
 * Le registre des outils de l'agent (plan Publicité, §9 quater, point 5).
 *
 * Un outil : son contrat pour le modèle (nom, description, schéma), et sa
 * fonction, qui renvoie ce que le modèle lira ET la phrase du fil d'activité —
 * écrite par le code, jamais par un modèle payé pour résumer.
 *
 * Ici, les outils de l'arbre (créer, attendre, terminer) ; ceux qui passent par
 * l'atelier sont dans tools-atelier.ts ; le registre complet, dans registry.ts.
 */

export type ToolContext = { deps: AgentDeps; run: RunRow; agent: AgentRow; agents: AgentRow[]; step: StepRow; ledger: (a: AgentRow) => AgentLedger };

export type ToolOutcome =
  /** `costEur` : ce que l'outil a payé (des textes écrits par l'atelier) — compté dans le budget de l'agent. */
  | { kind: "ok"; output: unknown; line: string; isError?: boolean; costEur?: number }
  /** Pas encore : l'étape reste ouverte et l'agent attend (ses sous-agents). */
  | { kind: "wait" }
  /** L'agent rend son résultat et s'arrête. */
  | { kind: "finish"; output: unknown; line: string; result: unknown };

export type AgentTool = {
  definition: Anthropic.Tool;
  run(ctx: ToolContext, input: Record<string, unknown>): Promise<ToolOutcome>;
};

export const FINISHED: readonly AgentStatus[] = ["termine", "echoue", "arrete"];

export const roleLabel = (role: string) => AGENT_ROLES.find((r) => r.value === role)?.label.toLowerCase() ?? role;
/** Une phrase du fil ne dépasse pas une ligne : au-delà de `n` caractères, elle est coupée. */
export const clip = (s: string, n = 120) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

const refuse = async (ctx: ToolContext, reason: string, after: unknown): Promise<ToolOutcome> => {
  await ctx.deps.store.createDecision({
    campaign: ctx.run.campaign,
    run: ctx.run.id,
    agent: ctx.agent.id,
    step: ctx.step.id,
    kind: "creation-sous-agent",
    status: "bloquee",
    rationale: String((after as { justification?: string }).justification ?? "—"),
    after,
    guardrail: reason,
  });
  return { kind: "ok", isError: true, output: { refus: reason }, line: `${ROLE_SUBJECT[ctx.agent.role]} ne peut pas créer ce sous-agent : ${reason}` };
};

const creerSousAgent: AgentTool = {
  definition: {
    name: "creer_sous_agent",
    description:
      "Crée un sous-agent chargé d'une mission, avec un budget prélevé sur le tien. Il démarre dès qu'une place se libère ; appelle ensuite « attendre_sous_agents » pour lire son résultat.",
    input_schema: {
      type: "object",
      properties: {
        role: { type: "string", enum: [...CREATABLE_ROLES] },
        mission: { type: "string", description: "Ce qu'il doit rendre, précisément." },
        outils: { type: "array", items: { type: "string" }, description: "Facultatif : un sous-ensemble des outils de ce rôle. Vide = tous." },
        budget_eur: { type: "number", description: "Budget en euros, pris sur le tien." },
        justification: { type: "string", description: "Pourquoi ce sous-agent, et pourquoi ce budget." },
      },
      required: ["role", "mission", "budget_eur", "justification"],
    },
  },
  async run(ctx, input) {
    const role = String(input.role) as CreatableRole;
    const mission = String(input.mission ?? "").trim();
    const budgetEur = Math.round(Number(input.budget_eur) * 100) / 100;
    const asked = Array.isArray(input.outils) ? input.outils.map(String) : [];
    const after = { role, mission, budgetEur, outils: asked, justification: String(input.justification ?? "") };

    // Reprise après coupure : l'enfant a pu être créé juste avant que l'étape soit close.
    const already = ctx.agents.find((a) => a.parent === ctx.agent.id && a.role === role && a.mission === mission && a.createdAt >= ctx.step.startedAt);
    if (already) return { kind: "ok", output: { agent: already.id }, line: `${ROLE_SUBJECT[ctx.agent.role]} a créé un ${roleLabel(role)} (${eur(already.budgetEur)}).` };

    if (!CREATABLE_ROLES.includes(role)) return refuse(ctx, `rôle inconnu ou non créable (« ${role} »).`, after);
    if (!mission) return refuse(ctx, "mission vide.", after);
    if (ctx.agent.depth + 1 > MAX_DEPTH) return refuse(ctx, `profondeur maximale atteinte (${MAX_DEPTH} niveaux).`, after);
    const subAgents = ctx.agents.filter((a) => a.depth > 0).length;
    if (subAgents >= MAX_AGENTS_PER_RUN) return refuse(ctx, `${MAX_AGENTS_PER_RUN} sous-agents déjà créés dans ce passage.`, after);
    const allowed = ROLE_TOOLS[role];
    const outside = asked.filter((t) => !allowed.includes(t));
    if (outside.length) return refuse(ctx, `outil(s) non autorisé(s) pour ce rôle : ${outside.join(", ")}.`, after);
    const reserve = canReserve(ctx.ledger(ctx.agent), budgetEur);
    if (reserve !== true) return refuse(ctx, reserve, after);

    const tools = asked.length ? [...new Set([...asked, "terminer"])] : [...allowed];
    const child = await ctx.deps.store.createAgent({
      run: ctx.run.id,
      parent: ctx.agent.id,
      depth: ctx.agent.depth + 1,
      role,
      status: "en-attente",
      mission,
      tools,
      model: ADS_AGENT_MODELS[role],
      budgetEur,
    });
    await ctx.deps.store.createDecision({
      campaign: ctx.run.campaign,
      run: ctx.run.id,
      agent: ctx.agent.id,
      step: ctx.step.id,
      kind: "creation-sous-agent",
      status: "executee",
      rationale: after.justification || "—",
      after: { ...after, agent: child.id, outils: tools },
    });
    return {
      kind: "ok",
      output: { agent: child.id, role, budget_eur: budgetEur, outils: tools },
      line: `${ROLE_SUBJECT[ctx.agent.role]} crée un ${roleLabel(role)} (${eur(budgetEur)}) : « ${clip(mission, 90)} »`,
    };
  },
};

const attendreSousAgents: AgentTool = {
  definition: {
    name: "attendre_sous_agents",
    description: "Attend que tous tes sous-agents aient fini, puis renvoie le résultat (ou l'échec) de chacun.",
    input_schema: { type: "object", properties: {} },
  },
  async run(ctx) {
    const children = ctx.agents.filter((a) => a.parent === ctx.agent.id);
    if (!children.length) return { kind: "ok", isError: true, output: { refus: "Aucun sous-agent à attendre." }, line: `${ROLE_SUBJECT[ctx.agent.role]} n'a aucun sous-agent à attendre.` };
    if (children.some((c) => !FINISHED.includes(c.status))) return { kind: "wait" };
    const failed = children.filter((c) => c.status !== "termine").length;
    return {
      kind: "ok",
      output: children.map((c) => ({ agent: c.id, role: c.role, etat: c.status, resultat: c.result ?? null, erreur: c.error ?? null })),
      line: `${ROLE_SUBJECT[ctx.agent.role]} reprend : ${children.length} sous-agent${children.length > 1 ? "s ont" : " a"} rendu leur travail${failed ? `, dont ${failed} en échec` : ""}.`,
    };
  },
};

const terminer: AgentTool = {
  definition: {
    name: "terminer",
    description: "Rend ton résultat à qui t'a créé, et termine ton travail.",
    input_schema: {
      type: "object",
      properties: {
        resume: { type: "string", description: "Ce que tu rends, en quelques lignes." },
        donnees: { type: "object", description: "Facultatif : le résultat structuré." },
      },
      required: ["resume"],
    },
  },
  async run(ctx, input) {
    const resume = String(input.resume ?? "").trim();
    const result = { resume, donnees: input.donnees ?? null };
    return { kind: "finish", output: { ok: true }, result, line: `${ROLE_SUBJECT[ctx.agent.role]} termine : ${clip(resume || "sans résumé")}` };
  },
};

export const TREE_TOOLS: AgentTool[] = [creerSousAgent, attendreSousAgents, terminer];
