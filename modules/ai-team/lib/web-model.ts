import Anthropic from "@anthropic-ai/sdk";
import type { Payload } from "payload";

import { trackApi } from "@/core/lib/api-health";
import { claudeCostUsd, claudeMaxCostUsd, estimateTokens, usdToEur, WEB_SEARCH_USD, type ClaudeModel, type Usage } from "@/core/lib/ai-pricing";
import type { AdSpendKind } from "@/modules/ads/collections/AdAiUsage";
import { assertAdsBudget, recordAdsUsage } from "@/modules/ads/lib/spend";
import { safeHttpsUrl } from "@/modules/ai-team/lib/format";

/**
 * UN APPEL AU MODÈLE AVEC LE WEB (recherche et lecture de pages, côté
 * serveur d'Anthropic) — la mécanique commune de la veille des agents et de la
 * revue du chef SEO/GEO (qui va lire la page de TIM et celle du numéro 1) :
 *
 *  - le coût MAXIMAL de chaque tour est vérifié avant de partir (tokens au
 *    maximum + pages lues + toutes les recherches permises), sous les plafonds
 *    de la nature de dépense et le budget de l'équipe ;
 *  - un tour mis en pause par le serveur (longue recherche) est renvoyé tel
 *    quel, il reprend — au plus `maxTurns` fois ;
 *  - le coût RÉEL (tokens + recherches) est enregistré, y compris quand
 *    l'appel échoue en route.
 */

export type WebTurn = { content: Anthropic.ContentBlock[]; usage: Usage; searches: number; stopReason: string | null };
export type WebCallInput = { model: ClaudeModel; system: string; messages: Anthropic.MessageParam[]; maxTokens: number; maxSearches: number; maxFetches: number; effort: "low" | "medium" | "high" };
export type WebCall = (input: WebCallInput) => Promise<WebTurn>;

const client = () => new Anthropic({ timeout: 280_000, maxRetries: 1 });

export const callWebModel: WebCall = async ({ model, system, messages, maxTokens, maxSearches, maxFetches, effort }) => {
  const res = await client()
    .messages.stream({
      model,
      max_tokens: maxTokens,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages,
      tools: [
        { type: "web_search_20260209", name: "web_search", max_uses: maxSearches, user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" } },
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: maxFetches },
      ],
      output_config: { effort },
    })
    .finalMessage();
  return {
    content: res.content,
    usage: { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? 0, cacheWrite: res.usage.cache_creation_input_tokens ?? 0 },
    searches: res.usage.server_tool_use?.web_search_requests ?? 0,
    stopReason: res.stop_reason,
  };
};

export type WebRun = { text: string; contents: Anthropic.ContentBlock[][]; stopReason: string | null; searches: number; costEur: number };

export class WebRunError extends Error {
  constructor(
    message: string,
    readonly searches: number,
    readonly costEur: number,
  ) {
    super(message);
    this.name = "WebRunError";
  }
}

export async function runWebModel(
  payload: Payload,
  o: {
    model: ClaudeModel;
    system: string;
    user: string;
    kind: AdSpendKind;
    /** Ce qui s'inscrit au registre des dépenses (« veille web de la semaine (Thomas) »). */
    detail: string;
    now: Date;
    maxTokens?: number;
    maxSearches?: number;
    maxFetches?: number;
    /** Ce que les pages lues peuvent ajouter à l'entrée, au plus (pour le coût maximal). */
    webInputTokens?: number;
    maxTurns?: number;
    effort?: WebCallInput["effort"];
    call?: WebCall;
    /** Levé à la demande expresse de la direction : le plafond du JOUR seulement (lib/spend). */
    overDailyCap?: boolean;
  },
): Promise<WebRun> {
  const maxTokens = o.maxTokens ?? 16_000;
  const maxSearches = o.maxSearches ?? 8;
  const maxFetches = o.maxFetches ?? 4;
  const total: Usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let searches = 0;
  const costUsd = () => claudeCostUsd(o.model, total) + searches * WEB_SEARCH_USD;
  const costEur = () => Math.round(usdToEur(costUsd()) * 10_000) / 10_000;
  const record = (detail: string) => recordAdsUsage(payload, { kind: o.kind, provider: "anthropic", model: o.model, usd: costUsd(), detail, usage: { ...total, webSearches: searches } });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: o.user }];
  const contents: Anthropic.ContentBlock[][] = [];
  let last: WebTurn | null = null;
  try {
    for (let turn = 0; turn < (o.maxTurns ?? 3); turn += 1) {
      const maxEur = usdToEur(claudeMaxCostUsd(o.model, estimateTokens(o.system, JSON.stringify(messages)) + (o.webInputTokens ?? 90_000), maxTokens) + maxSearches * WEB_SEARCH_USD);
      await assertAdsBudget(payload, o.kind, maxEur, o.now, { overDailyCap: o.overDailyCap });
      const input = { model: o.model, system: o.system, messages, maxTokens, maxSearches, maxFetches, effort: o.effort ?? "medium" } as const;
      // Un vrai appel rapporte son sort (API en panne : paiement, clé…) ; un appel simulé (tests) non.
      last = o.call ? await o.call(input) : await trackApi("anthropic", () => callWebModel(input), payload);
      total.input += last.usage.input;
      total.output += last.usage.output;
      total.cacheRead += last.usage.cacheRead;
      total.cacheWrite += last.usage.cacheWrite;
      searches += last.searches;
      contents.push(last.content);
      if (last.stopReason !== "pause_turn") break;
      // Le serveur a mis la recherche en pause : on lui renvoie son tour tel quel, il reprend.
      messages.push({ role: "assistant", content: last.content as unknown as Anthropic.ContentBlockParam[] });
    }
  } catch (e) {
    if (searches || total.input) await record(`${o.detail} — interrompu`).catch(() => null);
    throw new WebRunError(e instanceof Error ? e.message : String(e), searches, costEur());
  }
  await record(`${o.detail} (${searches} recherche${searches > 1 ? "s" : ""})`);
  const text = (last?.content ?? []).filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
  return { text, contents, stopReason: last?.stopReason ?? null, searches, costEur: costEur() };
}

export type WebSource = { url: string; title: string };

/** Les sources réellement citées par les réponses (et, à défaut, celles qui ont été lues). Pure (testée). */
export function sourcesOf(contents: Anthropic.ContentBlock[][]): WebSource[] {
  const cited = new Map<string, string>();
  const seen = new Map<string, string>();
  for (const content of contents) {
    for (const b of content) {
      if (b.type === "text") {
        for (const c of b.citations ?? []) {
          if (c.type === "web_search_result_location") {
            const url = safeHttpsUrl(c.url);
            if (url && !cited.has(url)) cited.set(url, c.title ?? url);
          }
        }
      } else if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
        for (const r of b.content) {
          const url = safeHttpsUrl(r.url);
          if (url && !seen.has(url)) seen.set(url, r.title ?? url);
        }
      }
    }
  }
  const pick = cited.size ? cited : seen;
  return [...pick].slice(0, 20).map(([url, title]) => ({ url, title: title.slice(0, 200) }));
}

/** Le contenu d'une balise de la réponse finale (« <methode>…</methode> »), ou null. Pure. */
export const tagOf = (text: string, name: string): string | null => {
  const m = text.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? m[1].trim() : null;
};
