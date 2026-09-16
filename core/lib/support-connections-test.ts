import type { Payload } from "payload";

import { accessTokenFor } from "@/modules/marketing/lib/calendar";

import { isConfigured, SUPPORT_CONNECTIONS, type SupportConnection } from "./support-connections";

/**
 * « Tester » une connexion du support : un vrai appel, le plus léger possible,
 * qui prouve que la clé posée sur Vercel marche — ou dit pourquoi elle ne
 * marche pas (401, quota, injoignable), en clair, avant que quelqu'un ne le
 * découvre sur une fiche client.
 *
 * Rien n'est écrit chez eux, jamais. Chaque test a un délai court : un écran
 * qui attend trente secondes sur un test, c'est un écran qu'on n'utilise plus.
 */
export type TestResult = { ok: boolean; message: string; at: string };

const TIMEOUT_MS = 8000;

const withTimeout = (ms: number) => {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
};

/** Une réponse HTTP en une phrase : 401 → « clé refusée », 429 → « quota ». */
const explain = (res: Response): string =>
  res.status === 401 || res.status === 403
    ? `Clé refusée (${res.status}) : elle est invalide, expirée, ou sans le droit demandé.`
    : res.status === 429
      ? "Quota atteint (429) : trop de requêtes, réessayez plus tard."
      : `Réponse ${res.status} ${res.statusText}`.trim();

const failure = (e: unknown): string =>
  e instanceof Error && e.name === "AbortError" ? `Aucune réponse en ${TIMEOUT_MS / 1000} s.` : `Injoignable : ${(e as Error).message}`;

async function testPennylane(): Promise<Omit<TestResult, "at">> {
  const base = process.env.PENNYLANE_API_BASE || "https://app.pennylane.com/api/external/v2";
  const t = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch(`${base}/customers?limit=1`, {
      headers: { Authorization: `Bearer ${process.env.PENNYLANE_API_TOKEN}`, Accept: "application/json" },
      signal: t.signal,
    });
    if (!res.ok) return { ok: false, message: explain(res) };
    const data = (await res.json()) as { items?: unknown[] };
    return { ok: true, message: `Réponse OK — ${Array.isArray(data.items) ? "des clients sont lisibles" : "le jeton est accepté"}.` };
  } catch (e) {
    return { ok: false, message: failure(e) };
  } finally {
    t.done();
  }
}

async function testBrevo(): Promise<Omit<TestResult, "at">> {
  const t = withTimeout(TIMEOUT_MS);
  try {
    const res = await fetch("https://api.brevo.com/v3/account", {
      headers: { "api-key": process.env.BREVO_API_KEY ?? "", accept: "application/json" },
      signal: t.signal,
    });
    if (!res.ok) return { ok: false, message: explain(res) };
    const data = (await res.json()) as { email?: string; companyName?: string };
    return { ok: true, message: `Compte « ${data.companyName ?? data.email ?? "?"} » reconnu.` };
  } catch (e) {
    return { ok: false, message: failure(e) };
  } finally {
    t.done();
  }
}

async function testInsee(): Promise<Omit<TestResult, "at">> {
  const base = process.env.INSEE_API_BASE || "https://api.insee.fr/api-sirene/3.11";
  const header = process.env.INSEE_API_KEY_HEADER || "X-INSEE-Api-Key-Integration";
  const t = withTimeout(TIMEOUT_MS);
  try {
    const q = encodeURIComponent('denominationUniteLegale:"TIM MANAGEMENT" AND etablissementSiege:true');
    const res = await fetch(`${base}/siret?q=${q}&nombre=1`, {
      headers: { [header]: process.env.INSEE_API_KEY ?? "", Accept: "application/json" },
      signal: t.signal,
    });
    // 404 = « aucun établissement » : la clé a été acceptée, c'est ce qu'on teste.
    if (res.status === 404) return { ok: true, message: "Clé acceptée (recherche sans résultat, ce qui est normal ici)." };
    if (!res.ok) return { ok: false, message: explain(res) };
    return { ok: true, message: "Clé acceptée, la recherche répond." };
  } catch (e) {
    return { ok: false, message: failure(e) };
  } finally {
    t.done();
  }
}

/**
 * Google : pas d'appel « nu » possible, tout passe par une connexion OAuth
 * d'un partenaire. On rafraîchit donc chaque agenda connecté — exactement ce
 * que fait le cron du matin — et on compte ceux qui répondent.
 */
async function testGoogle(payload: Payload): Promise<Omit<TestResult, "at">> {
  const connections = (
    await payload.find({ collection: "calendar-connections", limit: 100, depth: 0, overrideAccess: true })
  ).docs as { id: number | string; provider: string; accountEmail?: string | null }[];
  const google = connections.filter((c) => c.provider === "google");
  if (google.length === 0) return { ok: true, message: "Identifiants posés ; aucun agenda Google connecté à tester pour l'instant." };
  const dead: string[] = [];
  for (const c of google) {
    const token = await accessTokenFor(payload, c as never);
    if (!token) dead.push(c.accountEmail ?? `connexion ${c.id}`);
  }
  return dead.length
    ? { ok: false, message: `${google.length - dead.length}/${google.length} agenda(s) répondent — à reconnecter : ${dead.join(", ")}.` }
    : { ok: true, message: `${google.length} agenda(s) Google répondent.` };
}

async function testAnthropic(): Promise<Omit<TestResult, "at">> {
  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const { AI_MODEL } = await import("./ai-assistant");
  try {
    const client = new Anthropic({ timeout: TIMEOUT_MS, maxRetries: 0 });
    const r = await client.messages.create({ model: AI_MODEL, max_tokens: 16, messages: [{ role: "user", content: "Réponds « ok »." }] });
    return { ok: true, message: `Claude répond (${AI_MODEL}, ${r.usage.input_tokens + r.usage.output_tokens} tokens).` };
  } catch (e) {
    const status = (e as { status?: number }).status;
    return { ok: false, message: status === 401 ? "Clé refusée (401) : invalide ou révoquée." : status === 429 ? "Quota ou plafond atteint (429)." : failure(e) };
  }
}

export async function testConnection(key: SupportConnection["key"], payload: Payload): Promise<TestResult> {
  const def = SUPPORT_CONNECTIONS.find((c) => c.key === key);
  const at = new Date().toISOString();
  if (!def) return { ok: false, message: "Connexion inconnue.", at };
  if (!isConfigured(def)) {
    const missing = def.env.filter((v) => v.required && !process.env[v.name]?.trim()).map((v) => v.name);
    return { ok: false, message: `Variable(s) manquante(s) : ${missing.join(", ")}.`, at };
  }
  const r =
    key === "pennylane"
      ? await testPennylane()
      : key === "brevo"
        ? await testBrevo()
        : key === "insee"
          ? await testInsee()
          : key === "google"
            ? await testGoogle(payload)
            : await testAnthropic();
  return { ...r, at };
}
