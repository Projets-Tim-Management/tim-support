import Anthropic from "@anthropic-ai/sdk";
import { jsonSchemaOutputFormat } from "@anthropic-ai/sdk/helpers/json-schema";

import type { Usage } from "@/core/lib/ai-pricing";
import { COPY_SCHEMA, type CopyResult } from "@/modules/ads/lib/copy/prompt";
import { ADS_TEXT_MAX_TOKENS, ADS_TEXT_MODEL } from "@/modules/ads/lib/models";

/**
 * L'appel à Claude pour les textes — le seul endroit qui parle à l'API.
 *
 * Sortie structurée (schéma JSON) : chaque champ arrive à sa place, rien à
 * analyser dans du texte libre. Le système (règles, ton, interdits) est mis en
 * cache. Effort « medium » : c'est le défaut d'Opus 5.5, posé explicitement pour
 * que le coût ne change pas en silence si le défaut change.
 */

export type ModelCall = (input: { system: string; user: string }) => Promise<{ result: CopyResult; usage: Usage }>;

export class CopyModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CopyModelError";
  }
}

export const callClaude: ModelCall = async ({ system, user }) => {
  const client = new Anthropic();
  const res = await client.messages.parse({
    model: ADS_TEXT_MODEL,
    max_tokens: ADS_TEXT_MAX_TOKENS,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: user }],
    output_config: { effort: "medium", format: jsonSchemaOutputFormat(COPY_SCHEMA) },
  });
  const usage: Usage = {
    input: res.usage.input_tokens,
    output: res.usage.output_tokens,
    cacheRead: res.usage.cache_read_input_tokens ?? 0,
    cacheWrite: res.usage.cache_creation_input_tokens ?? 0,
  };
  if (res.stop_reason === "refusal") {
    throw Object.assign(new CopyModelError("Claude a décliné cette génération : reformulez le brief."), { usage });
  }
  if (res.stop_reason === "max_tokens") {
    throw Object.assign(new CopyModelError("Réponse tronquée (limite de sortie atteinte) : réduisez le nombre d'angles."), { usage });
  }
  if (!res.parsed_output) throw Object.assign(new CopyModelError("Réponse illisible : aucun texte n'a été enregistré."), { usage });
  return { result: res.parsed_output as CopyResult, usage };
};
