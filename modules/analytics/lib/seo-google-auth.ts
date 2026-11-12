import { importPKCS8, SignJWT } from "jose";

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

export async function googleAccessToken(): Promise<string> {
  if (token && token.exp > Date.now() + 60_000) return token.value;
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
  });
  if (!res.ok) throw await httpError(res, "Google (jeton du compte de service)");
  const j = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: j.access_token, exp: Date.now() + j.expires_in * 1000 };
  return token.value;
}
