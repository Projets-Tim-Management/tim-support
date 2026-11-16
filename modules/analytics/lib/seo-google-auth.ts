import { importPKCS8, SignJWT } from "jose";

import { reportApiFailure, reportApiSuccess } from "@/core/lib/api-health";
import { httpError } from "@/modules/analytics/lib/seo-cache";

/**
 * Le jeton Google du compte de service `seo-lecture` — UN compte, UNE clé
 * (`GSC_SERVICE_ACCOUNT_JSON`), trois lectures : Search Console, GA4 et
 * Google Ads. Chaque outil n'ouvre que ce que le compte s'est vu accorder chez
 * lui (« Restreint » dans Search Console, « Lecteur » dans GA4, « Lecture
 * seule » dans Google Ads) : le droit `adwords` du jeton n'écrit rien tant que
 * le compte n'a que la lecture.
 */
const SCOPES = ["https://www.googleapis.com/auth/webmasters.readonly", "https://www.googleapis.com/auth/analytics.readonly", "https://www.googleapis.com/auth/adwords"].join(" ");

type ServiceAccount = { client_email: string; private_key: string };

function serviceAccount(): ServiceAccount {
  const raw = process.env.GSC_SERVICE_ACCOUNT_JSON?.trim();
  if (!raw) throw new Error("GSC_SERVICE_ACCOUNT_JSON manquant.");
  // Collée telle quelle, ou en base64 (plus sûr pour une variable Vercel multi-lignes).
  const json = raw.startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const sa = JSON.parse(json) as ServiceAccount;
  if (!sa.client_email || !sa.private_key) throw new Error("GSC_SERVICE_ACCOUNT_JSON : client_email ou private_key absent.");
  return { ...sa, private_key: sa.private_key.replace(/\\n/g, "\n") };
}

let token: { value: string; exp: number } | null = null;
/**
 * Le jeton en cours de fabrication : à froid, l'écran lance une dizaine de
 * lectures Google à la fois — elles attendent ce même jeton au lieu d'en
 * signer chacune un (relecture du 12/11/2026).
 */
let pending: Promise<string> | null = null;

export async function googleAccessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
  return (pending ??= mint().finally(() => (pending = null)));
}

async function mint(): Promise<string> {
  const sa = serviceAccount();
  const now = Math.floor(Date.now() / 1000);
  const assertion = await new SignJWT({ scope: SCOPES })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(sa.client_email)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(await importPKCS8(sa.private_key, "RS256"));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }),
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw await httpError(res, "Google (jeton du compte de service)");
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}

/**
 * Une requête POST authentifiée vers une API Google (Search Console, GA4,
 * Google Ads) : le jeton, le JSON, pas de cache, une limite de temps, et une
 * réponse refusée dite en une phrase. Les trois connecteurs l'écrivaient chacun.
 */
export async function googlePost<T>(url: string, body: unknown, source: string, opts: { headers?: Record<string, string>; timeoutMs?: number } = {}): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: `Bearer ${await googleAccessToken()}`, "content-type": "application/json", ...opts.headers },
    body: JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
  });
  const provider = GOOGLE_PROVIDER[source];
  if (!res.ok) {
    const err = Object.assign(await httpError(res, source), { status: res.status });
    if (provider) void reportApiFailure(provider, err);
    throw err;
  }
  if (provider) void reportApiSuccess(provider);
  return (await res.json()) as T;
}

/** La connexion suivie (API en panne) de chaque lecture Google. */
const GOOGLE_PROVIDER: Record<string, string> = { "Search Console": "search-console", GA4: "ga4-data", "Google Ads": "google-ads" };
