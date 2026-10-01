import type Anthropic from "@anthropic-ai/sdk";

import { finishTool } from "@/modules/ads/agent/roles";
import type { AgentRow, RunRow, StepRow } from "@/modules/ads/agent/types";
import { eur } from "@/modules/ads/lib/spend";

/**
 * La conversation d'un agent, reconstruite à partir de ses étapes (plan
 * Publicité, §9 quater, point 5) — c'est ce qui permet de reprendre après une
 * coupure : rien ne vit en mémoire entre deux étapes.
 *
 * Une étape `modele` fait est un message de l'assistant, blocs de réflexion
 * compris (ils doivent revenir tels quels). Les étapes `outil` qui la suivent
 * forment le message suivant, un `tool_result` par appel. Une étape échouée
 * n'entre pas dans la conversation, ni une réponse VIDE du modèle (l'API
 * refuse un message assistant vide ; le rappel qui la suit suffit). Deux
 * messages de l'utilisateur qui se suivent sont réunis en un seul.
 */

/** Pseudo-outil : le rappel envoyé à un agent qui s'est arrêté sans rendre son travail. */
export const RELANCE = "relance";
const relanceText = (agent: AgentRow) => `Tu t'es arrêté sans rendre de résultat. Appelle « ${finishTool(agent.role)} » avec ce que tu as, ou poursuis ta mission avec tes outils.`;

export type ModelOutput = { content: Anthropic.ContentBlock[]; stopReason: string | null };
export type ToolInput = { toolUseId: string; input: Record<string, unknown> };

const done = (s: StepRow) => s.status === "fait";

function firstMessage(run: RunRow, agent: AgentRow): string {
  return [
    `Mission : ${agent.mission}`,
    `Objectif de la campagne, tel que saisi : « ${run.objective} »`,
    `Ton budget : ${eur(agent.budgetEur)}. Chaque appel est vérifié avant de partir ; au-delà, il est refusé.`,
  ].join("\n");
}

export function buildMessages(run: RunRow, agent: AgentRow, steps: StepRow[]): Anthropic.MessageParam[] {
  const messages: Anthropic.MessageParam[] = [];
  const asBlocks = (c: Anthropic.MessageParam["content"]): Anthropic.ContentBlockParam[] => (typeof c === "string" ? [{ type: "text", text: c }] : c);
  const pushUser = (content: string | Anthropic.ContentBlockParam[]) => {
    const last = messages.at(-1);
    if (last?.role === "user") last.content = [...asBlocks(last.content), ...asBlocks(content)];
    else messages.push({ role: "user", content });
  };
  let results: Anthropic.ToolResultBlockParam[] = [];
  const flush = () => {
    if (results.length) pushUser(results);
    results = [];
  };
  pushUser(firstMessage(run, agent));
  for (const s of steps.filter(done)) {
    if (s.kind === "modele") {
      flush();
      const content = (s.output as ModelOutput).content;
      if (content.length) messages.push({ role: "assistant", content: content as Anthropic.ContentBlockParam[] });
    } else if (s.tool === RELANCE) {
      flush();
      pushUser(relanceText(agent));
    } else {
      const { toolUseId } = s.input as ToolInput;
      const out = s.output as { result: unknown; isError?: boolean };
      results.push({ type: "tool_result", tool_use_id: toolUseId, content: JSON.stringify(out.result), ...(out.isError ? { is_error: true } : {}) });
    }
  }
  flush();
  return messages;
}

/** Ce que l'agent doit faire maintenant. */
export type NextAction =
  | { kind: "resume"; step: StepRow } // une étape ouverte (coupure, ou attente de sous-agents)
  | { kind: "tool"; toolUse: Anthropic.ToolUseBlock }
  | { kind: "call" }
  | { kind: "relance" }
  | { kind: "fail"; reason: string };

export function nextAction(steps: StepRow[], maxTurns: number, maxFailures: number): NextAction {
  const open = steps.find((s) => s.status === "en-cours");
  if (open) return { kind: "resume", step: open };

  // Échecs d'appel consécutifs, en partant de la fin.
  let failures = 0;
  for (let i = steps.length - 1; i >= 0 && steps[i].kind === "modele" && steps[i].status === "echoue"; i--) failures++;
  if (failures >= maxFailures) return { kind: "fail", reason: `${failures} appels au modèle ont échoué de suite.` };

  const lastModelIndex = steps.findLastIndex((s) => s.kind === "modele" && done(s));
  if (lastModelIndex < 0) return { kind: "call" };
  const last = steps[lastModelIndex].output as ModelOutput;
  const answered = new Set(steps.slice(lastModelIndex + 1).filter((s) => s.kind === "outil" && done(s)).map((s) => (s.input as ToolInput | null)?.toolUseId));
  const pending = last.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && !answered.has(b.id));
  if (pending) return { kind: "tool", toolUse: pending };

  const relanced = steps.slice(lastModelIndex + 1).some((s) => s.tool === RELANCE && done(s));
  if (last.stopReason === "tool_use" || relanced) {
    // Toutes les réponses d'outil sont là (ou le rappel a été envoyé) : au modèle.
    const turns = steps.filter((s) => s.kind === "modele" && done(s)).length;
    return turns >= maxTurns ? { kind: "fail", reason: `${maxTurns} tours sans rendre de résultat.` } : { kind: "call" };
  }
  if (last.stopReason === "refusal") return { kind: "fail", reason: "Le modèle a décliné cette mission." };
  // Arrêt sans « terminer » : un rappel, une seule fois.
  const alreadyRelanced = steps.some((s) => s.tool === RELANCE && done(s));
  return alreadyRelanced ? { kind: "fail", reason: "Arrêté deux fois sans rendre de résultat." } : { kind: "relance" };
}
