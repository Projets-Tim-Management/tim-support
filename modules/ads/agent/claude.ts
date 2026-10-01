import Anthropic from "@anthropic-ai/sdk";

import type { Usage } from "@/core/lib/ai-pricing";
import { STEP_MAX_MS } from "@/modules/ads/agent/limits";
import type { AgentModelCall, ModelRequest } from "@/modules/ads/agent/types";

/**
 * L'appel à Claude pour les agents — le seul endroit du moteur qui parle à l'API.
 *
 * - Les instructions système et les outils se mettent en cache (ils ne changent
 *   pas d'un tour à l'autre), ainsi que la fin du dernier message : chaque tour
 *   relit la conversation, le cache la rend peu chère.
 * - Effort « medium » pour Opus et Sonnet 5.5 (réflexion toujours active) ;
 *   Haiku, pour résumer des sources, n'en reçoit pas.
 * - Un délai sous la durée maximale d'une étape : un appel qui traîne échoue
 *   proprement (étape « échouée », reprise au tour suivant) au lieu d'être coupé
 *   avec la fonction, facturé sans être compté.
 */

const client = () => new Anthropic({ timeout: STEP_MAX_MS - 15_000, maxRetries: 1 });

/** La requête envoyée à l'API. Pure — c'est elle qu'on teste. */
export function toApiRequest(req: ModelRequest): Anthropic.MessageCreateParamsNonStreaming {
  const messages = req.messages.map((m, i) => {
    if (i !== req.messages.length - 1 || typeof m.content === "string") return m;
    const blocks = [...m.content];
    const last = blocks.at(-1);
    if (last && last.type !== "thinking" && last.type !== "redacted_thinking") blocks[blocks.length - 1] = { ...last, cache_control: { type: "ephemeral" } } as typeof last;
    return { ...m, content: blocks };
  });
  const tools = req.tools.map((t, i) => (i === req.tools.length - 1 ? { ...t, cache_control: { type: "ephemeral" as const } } : t));
  return {
    model: req.model,
    max_tokens: req.maxTokens,
    system: [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }],
    messages,
    ...(tools.length ? { tools } : {}),
    ...(req.model.startsWith("claude-haiku") ? {} : { output_config: { effort: "medium" } }),
  } as Anthropic.MessageCreateParamsNonStreaming;
}

export const callAgentModel: AgentModelCall = async (req) => {
  const res = await client().messages.create(toApiRequest(req));
  const usage: Usage = {
    input: res.usage.input_tokens,
    output: res.usage.output_tokens,
    cacheRead: res.usage.cache_read_input_tokens ?? 0,
    cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
  };
  return { content: res.content, stopReason: res.stop_reason, usage };
};
