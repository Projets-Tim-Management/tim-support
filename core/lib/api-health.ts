import type { Payload } from "payload";

import { SUPPORT_CONNECTIONS } from "@/core/lib/support-connections";

/**
 * LES API EN PANNE, SIGNALÉES (13/11/2026) — « il faudrait que je sois alerté
 * quand on ne peut pas utiliser une API parce que le paiement est insuffisant
 * ou autre ».
 *
 * Chaque appel qui compte rapporte son sort : `reportApiFailure` à l'échec,
 * `reportApiSuccess` à la réussite. Le code classe l'échec :
 *  - « paiement » : crédits épuisés, facturation coupée, carte refusée ;
 *  - « acces »    : clé ou jeton invalide, expiré, révoqué, droit retiré ;
 *  - « passager » : surcharge, délai, coupure réseau — et tout le reste
 *    (requête refusée, réponse inattendue) : pas d'alerte seul ; mais une API
 *    qui échoue 3 fois de suite pendant plus d'une heure devient « autre »
 *    (échecs répétés) et alerte aussi.
 *
 * Une alerte, c'est une ligne dans « API en panne » (une par API), un bandeau
 * en tête de Paramètres › Connexions, et un e-mail à l'équipe (« Connexions :
 * une API ne répond plus ») — au plus un par API et par jour tant que la panne
 * dure. Le premier appel réussi la ferme. Ne lève jamais : signaler une panne
 * ne doit pas en créer une autre.
 */

export type FailureKind = "paiement" | "acces" | "autre" | "passager";

/** Les API suivies : la clé de la connexion (Paramètres › Connexions) ou un compte de réseau, et où régler le problème. */
export const API_PROVIDERS: Record<string, { label: string; fix: string }> = {
  anthropic: { label: "Claude (Anthropic)", fix: "https://console.anthropic.com/settings/billing" },
  openai: { label: "ChatGPT (API OpenAI)", fix: "https://platform.openai.com/settings/organization/billing/overview" },
  perplexity: { label: "Perplexity", fix: "https://console.perplexity.ai" },
  gemini: { label: "Gemini (Google)", fix: "https://aistudio.google.com/apikey" },
  "search-console": { label: "Google Search Console", fix: "https://search.google.com/search-console" },
  "ga4-data": { label: "Google Analytics (GA4)", fix: "https://analytics.google.com" },
  "google-ads": { label: "Google Ads", fix: "https://ads.google.com" },
  pagespeed: { label: "PageSpeed Insights", fix: "https://console.cloud.google.com/apis/credentials" },
  youtube: { label: "YouTube (chaîne TIM)", fix: "/admin/equipe-ia?membre=seo-reseaux" },
  "meta-pages": { label: "Facebook & Instagram (pages)", fix: "/admin/equipe-ia?membre=seo-reseaux" },
};
const connectionOf = (key: string) => SUPPORT_CONNECTIONS.find((c) => c.key === key);
export const providerLabel = (key: string) => API_PROVIDERS[key]?.label ?? connectionOf(key)?.name ?? key;
const providerFix = (key: string) => API_PROVIDERS[key]?.fix ?? connectionOf(key)?.consoleUrl ?? "/admin/connexions-support";

const PAYMENT = /(\b402\b|credit|crédit|billing|factur|insufficient|balance|payment|paiement|paid|quota exceeded|exceeded your current quota|insufficient_quota|billing_disabled|plan and billing|requires a paid|out of funds|card (was )?declined)/i;
const ACCESS = /(\b40[13]\b|unauthori[sz]ed|forbidden|invalid[ _-]?(api[ _-]?)?key|invalid_api_key|api key not valid|invalid_grant|token (has )?(expired|been revoked)|expired token|revoked|oauthexception|session has expired|permission denied|permission_denied|clé refusée|clé invalide|accès refusé|n'a pas le droit|not authorized)/i;
const TRANSIENT = /(\b429\b|rate.?limit|too many requests|overloaded|\b50[0-4]\b|\b529\b|timeout|timed out|aborted|aborterror|econnreset|econnrefused|enotfound|fetch failed|network|socket hang up|injoignable|aucune réponse|quota ou limite atteint|quota dépassé|temporarily unavailable)/i;

/** Le genre d'un échec, d'après son message (et son statut HTTP s'il est connu). Pure (testée). Le paiement passe avant l'accès : « clé refusée — requires paid credits » est un problème de paiement. */
export function classifyFailure(message: string, status?: number | null): FailureKind {
  const m = `${status ?? ""} ${message}`;
  if (status === 402 || PAYMENT.test(m)) return "paiement";
  if (status === 401 || status === 403 || ACCESS.test(m)) return "acces";
  if ((status != null && (status === 429 || status >= 500)) || TRANSIENT.test(m)) return "passager";
  return "autre";
}

const ESCALATE_AFTER = 3;
const ESCALATE_MS = 60 * 60_000;
const EMAIL_EVERY_MS = 24 * 60 * 60_000;

type Row = { id: number | string; provider: string; status?: string; kind?: FailureKind; failures?: number; firstFailedAt?: string; emailedAt?: string | null };

/** Ce que devient la ligne après un échec : son genre, s'il faut alerter, et s'il faut écrire. Pure (testée). */
export function nextFailureState(row: Pick<Row, "status" | "failures" | "firstFailedAt" | "emailedAt"> | null, kind: FailureKind, now: Date) {
  const ongoing = row?.status === "en-panne" || row?.status === "en-observation";
  const failures = (ongoing ? (row?.failures ?? 0) : 0) + 1;
  const firstFailedAt = ongoing && row?.firstFailedAt ? row.firstFailedAt : now.toISOString();
  // Paiement et accès alertent tout de suite ; le reste seulement s'il dure (3 échecs d'affilée, plus d'une heure).
  const repeated = failures >= ESCALATE_AFTER && now.getTime() - Date.parse(firstFailedAt) >= ESCALATE_MS;
  const immediate = kind === "paiement" || kind === "acces";
  const effective: FailureKind = immediate ? kind : repeated ? "autre" : "passager";
  const alert = effective !== "passager";
  const email = alert && (!row?.emailedAt || row.status !== "en-panne" || now.getTime() - Date.parse(row.emailedAt) >= EMAIL_EVERY_MS);
  return { failures, firstFailedAt, kind: effective, status: alert ? ("en-panne" as const) : ("en-observation" as const), email };
}

const isTest = () => process.env.NODE_ENV === "test" || !!process.env.VITEST;
async function resolvePayload(payload?: Payload | null): Promise<Payload | null> {
  if (payload) return payload;
  if (isTest()) return null;
  const { payloadClient } = await import("@/core/payload-client");
  return payloadClient().catch(() => null);
}

/** Ce qu'on sait déjà sain (en mémoire, 5 min) : une réussite ne coûte pas une lecture de la base à chaque appel. */
const healthy = new Map<string, number>();
const HEALTHY_MS = 5 * 60_000;

const statusOf = (err: unknown): number | null => {
  const s = (err as { status?: unknown } | null)?.status;
  return typeof s === "number" ? s : null;
};
const messageOf = (err: unknown) => (err instanceof Error ? err.message : String(err ?? "")).replace(/\s+/g, " ").trim().slice(0, 600);

export async function reportApiFailure(provider: string, err: unknown, payload?: Payload | null): Promise<void> {
  try {
    const p = await resolvePayload(payload);
    if (!p) return;
    healthy.delete(provider);
    const now = new Date();
    const message = messageOf(err);
    const kind = classifyFailure(message, statusOf(err));
    const found = await p.find({ collection: "api-alerts", where: { provider: { equals: provider } }, limit: 1, depth: 0, overrideAccess: true });
    const row = found.docs[0] as unknown as Row | undefined;
    const next = nextFailureState(row ?? null, kind, now);
    const data = { provider, label: providerLabel(provider), kind: next.kind, status: next.status, message, failures: next.failures, firstFailedAt: next.firstFailedAt, lastFailedAt: now.toISOString(), resolvedAt: null, ...(next.email ? { emailedAt: now.toISOString() } : {}) };
    if (row) await p.update({ collection: "api-alerts", id: row.id, data: data as never, overrideAccess: true });
    else await p.create({ collection: "api-alerts", data: data as never, overrideAccess: true });
    if (next.email) await emailAlert(p, provider, next.kind, message, next.firstFailedAt);
  } catch (e) {
    console.warn(`[API en panne] signalement impossible (${provider}) : ${e}`);
  }
}

export async function reportApiSuccess(provider: string, payload?: Payload | null): Promise<void> {
  try {
    const seen = healthy.get(provider);
    if (seen && Date.now() - seen < HEALTHY_MS) return;
    const p = await resolvePayload(payload);
    if (!p) return;
    healthy.set(provider, Date.now());
    const found = await p.find({ collection: "api-alerts", where: { and: [{ provider: { equals: provider } }, { status: { not_equals: "retablie" } }] }, limit: 1, depth: 0, overrideAccess: true });
    const row = found.docs[0] as unknown as Row | undefined;
    if (row) await p.update({ collection: "api-alerts", id: row.id, data: { status: "retablie", resolvedAt: new Date().toISOString(), failures: 0 } as never, overrideAccess: true });
  } catch (e) {
    console.warn(`[API en panne] rétablissement non noté (${provider}) : ${e}`);
  }
}

/** Fait l'appel et rapporte son sort ; l'erreur repart telle quelle. */
export async function trackApi<T>(provider: string, run: () => Promise<T>, payload?: Payload | null): Promise<T> {
  try {
    const out = await run();
    void reportApiSuccess(provider, payload);
    return out;
  } catch (e) {
    void reportApiFailure(provider, e, payload);
    throw e;
  }
}

export const KIND_TEXT: Record<FailureKind, { title: string; todo: string }> = {
  paiement: { title: "paiement insuffisant", todo: "Ajoutez des crédits ou réglez la facturation chez le fournisseur (le lien), puis attendez le prochain appel : l'alerte se ferme toute seule." },
  acces: { title: "clé ou accès refusé", todo: "La clé ou le jeton est invalide, expiré ou révoqué : régénérez-le (le lien), remplacez-le sur Vercel et dans .env.local, ou rebranchez le compte." },
  autre: { title: "échecs répétés", todo: "L'API échoue depuis plus d'une heure. Lisez le message ci-dessous, puis testez la connexion dans Paramètres › Connexions." },
  passager: { title: "incident passager", todo: "Rien à faire pour l'instant." },
};

async function emailAlert(payload: Payload, provider: string, kind: FailureKind, message: string, since: string) {
  const [{ teamRecipients }, { internalNotice, adminUrl }] = await Promise.all([import("@/core/lib/team-emails"), import("@/core/lib/email-template")]);
  const to = await teamRecipients(payload, "connexion-api");
  if (!to.length) return;
  const label = providerLabel(provider);
  const fix = providerFix(provider);
  const fixUrl = fix.startsWith("/admin") ? adminUrl(fix.slice("/admin".length)) : fix;
  const when = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }).format(new Date(since));
  const t = KIND_TEXT[kind];
  await payload.sendEmail({
    to: to.join(","),
    subject: `⚠️ ${label} : ${t.title}`,
    html: internalNotice({
      kicker: "Connexions · API en panne",
      heading: `${label} ne répond plus : ${t.title}`,
      rows: [
        ["API", label],
        ["Depuis", when],
        ["Message du fournisseur", message || "—"],
      ],
      message: t.todo,
      cta: { label: "Régler le problème", url: fixUrl },
      links: [{ label: "Paramètres › Connexions", url: adminUrl("/connexions-support") }],
    }),
    text: `${label} ne répond plus (${t.title}) depuis le ${when}.\n${message}\n\n${t.todo}\n${fixUrl}`,
  });
}

/** Les pannes en cours, pour le bandeau de Paramètres › Connexions. */
export async function openApiAlerts(payload: Payload) {
  const r = await payload.find({ collection: "api-alerts", where: { status: { equals: "en-panne" } }, sort: "-lastFailedAt", limit: 50, depth: 0, overrideAccess: true }).catch(() => null);
  return ((r?.docs ?? []) as unknown as { provider: string; label?: string; kind: FailureKind; message?: string; firstFailedAt?: string; lastFailedAt?: string; failures?: number }[]).map((a) => ({
    provider: a.provider,
    label: a.label || providerLabel(a.provider),
    kind: a.kind,
    message: a.message ?? "",
    since: a.firstFailedAt ?? null,
    fix: providerFix(a.provider),
  }));
}
