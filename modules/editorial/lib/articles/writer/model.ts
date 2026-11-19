import Anthropic from "@anthropic-ai/sdk";
import type { Payload } from "payload";

import { claudeCostUsd, claudeMaxCostUsd, estimateTokens, usdToEur, type ClaudeModel, type Usage } from "@/core/lib/ai-pricing";
import { assertAdsBudget, recordAdsUsage } from "@/modules/ads/lib/spend";

/**
 * UN APPEL À CLAUDE POUR LE RÉDACTEUR D'ARTICLES (étape 5, 18/11/2026), sans
 * recherche web : rédaction, réécriture d'une capsule, relecture de fidélité.
 *
 * Comme tous les appels de l'équipe : coût maximal vérifié AVANT contre le
 * budget de l'équipe SEO/GEO (plafonds du jour et du mois), coût réel inscrit
 * au registre des dépenses APRÈS. En streaming : une rédaction de 32 000 tokens
 * dépasserait sinon le délai d'une requête simple.
 */

export const WRITER_MODEL: ClaudeModel = "claude-opus-5-5";
export const HELPER_MODEL: ClaudeModel = "claude-sonnet-5-5";

export type ModelReply = { text: string; stopReason: string | null; costEur: number };
export type ModelCall = (input: { model: ClaudeModel; system: string; messages: Anthropic.MessageParam[]; maxTokens: number; thinking: boolean }) => Promise<{ text: string; stopReason: string | null; usage: Usage }>;

const client = () => new Anthropic({ timeout: 280_000, maxRetries: 1 });

const callModel: ModelCall = async ({ model, system, messages, maxTokens, thinking }) => {
  const res = await client()
    .messages.stream({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      ...(thinking ? { thinking: { type: "adaptive" } as const } : {}),
    })
    .finalMessage();
  return {
    text: res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join(""),
    stopReason: res.stop_reason,
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? 0, cacheWrite: res.usage.cache_creation_input_tokens ?? 0 },
  };
};

export async function runArticleModel(
  payload: Payload,
  o: { model: ClaudeModel; system: string; messages: Anthropic.MessageParam[]; maxTokens: number; thinking?: boolean; detail: string; now?: Date; call?: ModelCall },
): Promise<ModelReply> {
  const now = o.now ?? new Date();
  const maxEur = usdToEur(claudeMaxCostUsd(o.model, estimateTokens(o.system, JSON.stringify(o.messages)), o.maxTokens));
  await assertAdsBudget(payload, "seo", maxEur, now);
  const res = await (o.call ?? callModel)({ model: o.model, system: o.system, messages: o.messages, maxTokens: o.maxTokens, thinking: o.thinking ?? false });
  const usd = claudeCostUsd(o.model, res.usage);
  await recordAdsUsage(payload, { kind: "seo", provider: "anthropic", model: o.model, usd, detail: o.detail, usage: res.usage }).catch(() => null);
  return { text: res.text, stopReason: res.stopReason, costEur: Math.round(usdToEur(usd) * 10_000) / 10_000 };
}
