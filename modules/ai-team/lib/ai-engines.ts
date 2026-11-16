import Anthropic from "@anthropic-ai/sdk";

import { claudeCostUsd, WEB_SEARCH_USD } from "@/core/lib/ai-pricing";
import { safeHttpsUrl } from "@/modules/ai-team/lib/format";
import { sourcesOf } from "@/modules/ai-team/lib/web-model";

/**
 * LES IA QU'INTERROGE GEORGES (Visibilité IA, équipe SEO/GEO, étape 5,
 * 12/11/2026) — par leurs API, recherche web ACTIVÉE, comme un acheteur qui
 * pose sa question : ChatGPT (OpenAI, Responses + web_search), Perplexity
 * (Agent API + web_search, la Sonar historique est fermée depuis le
 * 27/09/2026), Gemini (generateContent + Google Search) et Claude (Messages +
 * web_search). Aucune consigne système : la question telle qu'un prospect la
 * tape.
 *
 * C'est une APPROXIMATION : l'API n'est pas l'application (pas d'historique,
 * pas de mémoire du compte, un modèle parfois différent) ; on le compense par
 * plusieurs tirages. Google AI Overviews n'est pas mesurable sans outil payant.
 *
 * Une IA n'est interrogée que si sa clé est posée (Claude : la clé Anthropic
 * déjà là). Le modèle se change par une variable ; le coût de chaque appel est
 * calculé sur le prix public du modèle par défaut (prix fort si un autre
 * modèle est posé).
 *
 * Les lectures de réponse sont pures (testées) ; les appels sont ici.
 */

export type EngineKey = "chatgpt" | "perplexity" | "gemini" | "claude";
export type EngineSource = { url: string; title: string; host: string };
export type EngineAnswer = { text: string; sources: EngineSource[]; usd: number; model: string; searches: number };
type Usage = { input: number; output: number };

const TIMEOUT_MS = 90_000;
const MAX_SOURCES = 15;

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return "";
  }
};
/** Une liste de sources propre : https seulement, sans doublon, 15 au plus. */
const cleanSources = (raw: { url?: unknown; title?: unknown; host?: unknown }[]): EngineSource[] => {
  const out = new Map<string, EngineSource>();
  for (const r of raw) {
    const url = safeHttpsUrl(r.url);
    if (!url || out.has(url)) continue;
    const host = String(r.host ?? "").trim().toLowerCase().replace(/^www\./, "") || hostOf(url);
    out.set(url, { url, title: String(r.title ?? host).slice(0, 200), host });
  }
  return [...out.values()].slice(0, MAX_SOURCES);
};
type Json = Record<string, unknown>;
const arr = (v: unknown): Json[] => (Array.isArray(v) ? (v as Json[]) : []);
const n = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/** Les prix publics (USD par million de tokens) des modèles par défaut ; un autre modèle compte au prix fort. */
const PRICES: Record<string, Usage> = {
  "gpt-6-luna": { input: 0.1, output: 0.5 },
  "openai/gpt-5.6-luna": { input: 0.2, output: 1.2 },
  "gemini-3.5-flash-lite": { input: 0.3, output: 2.5 },
};
const FALLBACK_PRICE: Usage = { input: 5, output: 25 };
const tokensUsd = (model: string, u: Usage) => {
  const p = PRICES[model] ?? FALLBACK_PRICE;
  return (u.input * p.input + u.output * p.output) / 1_000_000;
};
/** Prix d'une recherche : OpenAI 10 $ / 1 000 ; Perplexity 2,50 $ / 1 000 ; Gemini 14 $ / 1 000 (après 5 000 gratuites par mois — compté au prix fort). */
const SEARCH_USD = { chatgpt: 0.01, perplexity: 0.0025, gemini: 0.014 } as const;

/* ─── Lectures des réponses (pures) ─────────────────────────────────────── */

/** OpenAI Responses : le texte des messages, les citations url_citation (et les sources consultées). */
export function readOpenAi(json: Json, model: string): EngineAnswer {
  const output = arr(json.output);
  const parts = output.filter((o) => o.type === "message").flatMap((o) => arr(o.content).filter((c) => c.type === "output_text"));
  const text = parts.map((c) => String(c.text ?? "")).join("\n");
  const cited = parts.flatMap((c) => arr(c.annotations).filter((a) => a.type === "url_citation"));
  const consulted = output.filter((o) => o.type === "web_search_call").flatMap((o) => arr((o.action as Json | undefined)?.sources));
  const searches = output.filter((o) => o.type === "web_search_call").length;
  const usage = (json.usage ?? {}) as Json;
  const usd = tokensUsd(model, { input: n(usage.input_tokens), output: n(usage.output_tokens) }) + searches * SEARCH_USD.chatgpt;
  return { text, sources: cleanSources(cited.length ? cited : consulted), usd, model, searches };
}

/** Perplexity Agent API : le texte des messages ; les sources sont dans les « search_results ». Le coût, quand il est rendu, fait foi. */
export function readPerplexity(json: Json, model: string): EngineAnswer {
  const output = arr(json.output);
  const text = output
    .filter((o) => o.type === "message")
    .flatMap((o) => arr(o.content).filter((c) => c.type === "output_text"))
    .map((c) => String(c.text ?? ""))
    .join("\n");
  const blocks = output.filter((o) => o.type === "search_results");
  const results = blocks.length ? blocks.flatMap((b) => arr(b.results)) : arr(json.results);
  const usage = (json.usage ?? {}) as Json;
  const searches = n(((usage.tool_calls_details as Json | undefined)?.search_web as Json | undefined)?.invocation) || blocks.length;
  const reported = n((usage.cost as Json | undefined)?.total_cost);
  const usd = reported || tokensUsd(model, { input: n(usage.input_tokens), output: n(usage.output_tokens) }) + searches * SEARCH_USD.perplexity;
  return { text: text || String(json.output_text ?? ""), sources: cleanSources(results), usd, model, searches };
}

/** Gemini generateContent : le texte, et les sources de l'ancrage Google (l'adresse est un renvoi Google, le titre est le domaine). */
export function readGemini(json: Json, model: string): EngineAnswer {
  const cand = arr(json.candidates)[0] ?? {};
  const text = arr((cand.content as Json | undefined)?.parts)
    .map((p) => String(p.text ?? ""))
    .join("");
  const meta = (cand.groundingMetadata ?? {}) as Json;
  const chunks = arr(meta.groundingChunks).map((c) => (c.web ?? {}) as Json);
  const searches = arr(meta.webSearchQueries).length;
  const usage = (json.usageMetadata ?? {}) as Json;
  const usd = tokensUsd(model, { input: n(usage.promptTokenCount), output: n(usage.candidatesTokenCount) + n(usage.thoughtsTokenCount) }) + searches * SEARCH_USD.gemini;
  return { text, sources: cleanSources(chunks.map((w) => ({ url: w.uri, title: w.title, host: /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(w.title ?? "")) ? w.title : undefined }))), usd, model, searches };
}

/* ─── Appels ───────────────────────────────────────────────────────────── */

async function postJson(url: string, headers: Record<string, string>, body: unknown, fetcher: typeof fetch, label: string): Promise<Json> {
  const res = await fetcher(url, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(TIMEOUT_MS) });
  const json = (await res.json().catch(() => ({}))) as Json;
  if (!res.ok) {
    const err = json.error as Json | string | undefined;
    const detail = typeof err === "string" ? err : String(err?.message ?? "");
    throw new Error(res.status === 401 || res.status === 403 ? `${label} : clé refusée${detail ? ` — ${detail.slice(0, 200)}` : ""}.` : res.status === 429 ? `${label} : quota ou limite atteint.` : `${label} : erreur ${res.status}${detail ? ` — ${detail.slice(0, 200)}` : ""}.`);
  }
  return json;
}

type Engine = {
  key: EngineKey;
  label: string;
  /** La variable de la clé (la connexion du support). */
  env: string;
  provider: string;
  model: () => string;
  /** Le coût maximal plausible d'une question (dollars), vérifié au budget avant de partir. */
  maxUsd: number;
  ask: (question: string, fetcher: typeof fetch) => Promise<EngineAnswer>;
};

const env = (name: string) => process.env[name]?.trim() ?? "";

export const ENGINES: Engine[] = [
  {
    key: "chatgpt",
    label: "ChatGPT",
    env: "OPENAI_API_KEY",
    provider: "openai",
    model: () => env("OPENAI_VISIBILITY_MODEL") || "gpt-6-luna",
    maxUsd: 0.06,
    async ask(question, fetcher) {
      const model = this.model();
      const json = await postJson(
        "https://api.openai.com/v1/responses",
        { Authorization: `Bearer ${env("OPENAI_API_KEY")}` },
        { model, input: question, tools: [{ type: "web_search", user_location: { type: "approximate", country: "FR" } }], include: ["web_search_call.action.sources"] },
        fetcher,
        "ChatGPT",
      );
      return readOpenAi(json, model);
    },
  },
  {
    key: "perplexity",
    label: "Perplexity",
    env: "PERPLEXITY_API_KEY",
    provider: "perplexity",
    model: () => env("PERPLEXITY_VISIBILITY_MODEL") || "openai/gpt-5.6-luna",
    maxUsd: 0.04,
    async ask(question, fetcher) {
      const model = this.model();
      const json = await postJson(
        "https://api.perplexity.ai/v1/agent",
        { Authorization: `Bearer ${env("PERPLEXITY_API_KEY")}` },
        { model, input: question, tools: [{ type: "web_search", user_location: { country: "FR" } }] },
        fetcher,
        "Perplexity",
      );
      return readPerplexity(json, model);
    },
  },
  {
    key: "gemini",
    label: "Gemini",
    env: "GEMINI_API_KEY",
    provider: "google",
    model: () => env("GEMINI_VISIBILITY_MODEL") || "gemini-3.5-flash-lite",
    maxUsd: 0.1,
    async ask(question, fetcher) {
      const model = this.model();
      const json = await postJson(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        { "x-goog-api-key": env("GEMINI_API_KEY") },
        { contents: [{ parts: [{ text: question }] }], tools: [{ google_search: {} }] },
        fetcher,
        "Gemini",
      );
      return readGemini(json, model);
    },
  },
  {
    key: "claude",
    label: "Claude",
    env: "ANTHROPIC_API_KEY",
    provider: "anthropic",
    model: () => "claude-sonnet-5-5",
    maxUsd: 0.3,
    async ask(question) {
      const model = "claude-sonnet-5-5" as const;
      const res = await new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 1 }).messages.create({
        model,
        max_tokens: 4000,
        messages: [{ role: "user", content: question }],
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3, user_location: { type: "approximate", country: "FR", timezone: "Europe/Paris" } }],
      });
      const searches = res.usage.server_tool_use?.web_search_requests ?? 0;
      const usd = claudeCostUsd(model, { input: res.usage.input_tokens, output: res.usage.output_tokens, cacheRead: res.usage.cache_read_input_tokens ?? 0, cacheWrite: res.usage.cache_creation_input_tokens ?? 0 }) + searches * WEB_SEARCH_USD;
      const text = res.content.filter((b): b is Anthropic.TextBlock => b.type === "text").map((b) => b.text).join("");
      return { text, sources: cleanSources(sourcesOf([res.content])), usd, model, searches };
    },
  },
];

export const ENGINE_LABEL: Record<EngineKey, string> = { chatgpt: "ChatGPT", perplexity: "Perplexity", gemini: "Gemini", claude: "Claude" };

/** Les IA dont la clé est posée, dans l'ordre d'importance (part de marché en France). */
export const activeEngines = () => ENGINES.filter((e) => env(e.env));

/* ─── « Tester » sur l'écran des connexions : une question minimale, sans recherche ─── */

const ping = async (url: string, headers: Record<string, string>, body: unknown, label: string) => {
  await postJson(url, headers, body, fetch, label);
  return `${label} répond : la clé est valide.`;
};
export const pingOpenAi = () => ping("https://api.openai.com/v1/responses", { Authorization: `Bearer ${env("OPENAI_API_KEY")}` }, { model: ENGINES[0].model(), input: "Réponds OK.", max_output_tokens: 16 }, "ChatGPT (API OpenAI)");
export const pingPerplexity = () => ping("https://api.perplexity.ai/v1/agent", { Authorization: `Bearer ${env("PERPLEXITY_API_KEY")}` }, { model: ENGINES[1].model(), input: "Réponds OK.", max_output_tokens: 16 }, "Perplexity");
export const pingGemini = () =>
  ping(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(ENGINES[2].model())}:generateContent`, { "x-goog-api-key": env("GEMINI_API_KEY") }, { contents: [{ parts: [{ text: "Réponds OK." }] }], generationConfig: { maxOutputTokens: 16 } }, "Gemini");
