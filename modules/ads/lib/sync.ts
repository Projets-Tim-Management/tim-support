import type { Payload } from "payload";

import { decryptSecret } from "@/core/lib/secrets";
import { isSyncable, statusFromTokens, type AccountStatus } from "@/modules/ads/lib/accounts";
import { isAllowedAccount } from "@/modules/ads/lib/allowlist";
import { MOCK_ACCOUNT_ID } from "@/modules/ads/platforms/meta-mock";
import { AdTokenError, type AdPlatform, type Level, type MetricRow } from "@/modules/ads/platforms/types";

/**
 * Synchro quotidienne d'un compte publicitaire (plan Publicité, §4.6).
 *
 * Campagnes, puis chiffres jour par jour aux trois niveaux, sur une FENÊTRE de
 * 7 jours : la régie corrige ses chiffres plusieurs jours après coup (clics
 * invalides, conversions tardives), on réécrit donc la semaine à chaque passage.
 * Une ligne inchangée n'est pas réécrite.
 *
 * Un compte à la fois, et un compte en erreur n'arrête pas les autres (D10).
 * Un jeton refusé passe le compte « expiré » (il faut le reconnecter) ; toute
 * autre erreur le passe « en erreur » avec le message, sur sa fiche.
 */

export const SYNC_DAYS = 7;
export const TOKEN_ALERT_DAYS = 7;
export const LEVELS: Level[] = ["campaign", "adset", "ad"];

/** Le jour AAAA-MM-JJ d'un instant, dans le fuseau du compte — le jour tel que la régie le compte. */
export function dayInTz(at: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  } catch {
    // Fuseau inconnu de l'environnement : Paris, celui de TIM.
    return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
  }
}

const shiftDay = (day: string, delta: number): string =>
  new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);

/** Les 7 derniers jours, aujourd'hui compris (chiffres partiels, complétés au passage suivant). */
export function syncWindow(now: Date, timeZone: string, days = SYNC_DAYS): { since: string; until: string } {
  const until = dayInTz(now, timeZone);
  return { since: shiftDay(until, -(days - 1)), until };
}

/**
 * Qui synchronise quoi. La base est PARTAGÉE entre dev et production : sans
 * cette règle, un poste en données simulées écrirait des chiffres inventés sur
 * un vrai compte, et le cron de production enverrait à Meta le jeton factice du
 * compte simulé.
 */
export type SyncDecision = "ok" | "archive" | "simule-hors-mode-simule" | "reel-en-mode-simule" | "hors-liste";

export function syncDecision(
  acc: { status?: string | null; externalId?: string | null },
  mockMode: boolean,
  env: Record<string, string | undefined> = process.env,
): SyncDecision {
  if (!isSyncable(acc)) return "archive";
  const simulated = acc.externalId === MOCK_ACCOUNT_ID;
  if (simulated && !mockMode) return "simule-hors-mode-simule";
  if (!simulated && mockMode) return "reel-en-mode-simule";
  // Un compte entré avant la liste, ou retiré depuis, n'est plus lu.
  if (!simulated && !isAllowedAccount(acc.externalId, env)) return "hors-liste";
  return "ok";
}

export type RawAccount = {
  id: number | string;
  name?: string | null;
  platform?: string | null;
  externalId?: string | null;
  status?: string | null;
  currency?: string | null;
  timezone?: string | null;
  token?: string | null;
  systemUserToken?: string | null;
  tokenExpiresAt?: string | null;
  tokenAlertSentAt?: string | null;
};

/** Le jeton à utiliser, en clair : le jeton système prime (il n'expire pas). */
export const usableToken = (a: RawAccount): string | null => decryptSecret(a.systemUserToken) ?? decryptSecret(a.token);

/** L'alerte J-7 est-elle due ? Seulement pour un jeton OAuth, une fois par échéance. */
export function tokenAlertDue(a: RawAccount, now: Date): boolean {
  if (a.systemUserToken || !a.token || !a.tokenExpiresAt || a.tokenAlertSentAt) return false;
  const left = Date.parse(a.tokenExpiresAt) - now.getTime();
  return left > 0 && left <= TOKEN_ALERT_DAYS * 86_400_000;
}

export const metricKey = (level: string, externalId: string, day: string) => `${level}|${externalId}|${day}`;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Derniers chiffres d'une campagne sur la fenêtre, pour la liste et les cartes. */
export function campaignKpis(rows: MetricRow[], window: { since: string; until: string }) {
  const sum = (k: "spend" | "impressions" | "clicks" | "leads") => rows.reduce((s, r) => s + r[k], 0);
  const spend = round2(sum("spend"));
  const leads = sum("leads");
  const clicks = sum("clicks");
  const impressions = sum("impressions");
  return {
    ...window,
    spend,
    impressions,
    clicks,
    leads,
    cpl: leads ? round2(spend / leads) : null,
    ctr: impressions ? round2((clicks / impressions) * 100) : null,
  };
}

export type SyncResult = {
  id: number | string;
  name: string;
  decision: SyncDecision;
  status?: AccountStatus;
  campaigns?: number;
  written?: number;
  unchanged?: number;
  error?: string;
};

const METRIC_FIELDS = ["name", "campaignExternalId", "spend", "impressions", "clicks", "leads"] as const;

/** Une colonne `numeric` revient parfois en chaîne : « 12.3 » et 12.3 sont la même valeur. */
export const sameValue = (a: unknown, b: unknown): boolean =>
  (a ?? null) === (b ?? null) || (typeof b === "number" && a != null && a !== "" && Number(a) === b);

/**
 * Synchronise UN compte. `platform` est l'adaptateur déjà choisi par l'appelant
 * (réel ou simulé, voir syncDecision). Ne lève jamais : l'erreur est écrite sur
 * la fiche et renvoyée dans le résultat.
 */
export async function syncAccount(payload: Payload, acc: RawAccount, platform: AdPlatform, now: Date): Promise<SyncResult> {
  const base = { id: acc.id, name: acc.name ?? String(acc.id), decision: "ok" as const };
  const setAccount = (data: Record<string, unknown>) =>
    payload.update({ collection: "ad-accounts", id: acc.id, data, overrideAccess: true });

  const status = statusFromTokens(acc, now);
  if (status !== "connecte") {
    const error = status === "expire" ? "Jeton OAuth échu : reconnectez le compte, ou posez un jeton d'utilisateur système." : "Aucun jeton : connectez le compte.";
    await setAccount({ status, lastError: error });
    return { ...base, status, error };
  }

  const token = usableToken(acc);
  if (!token) {
    const error = "Jeton illisible (PAYLOAD_SECRET changé ?) : reconnectez le compte.";
    await setAccount({ status: "erreur", lastError: error });
    return { ...base, status: "erreur", error };
  }

  const ctx = { externalId: acc.externalId ?? "", token, currency: acc.currency, timezone: acc.timezone };
  const platformKey = acc.platform ?? platform.key;
  const window = syncWindow(now, acc.timezone || "Europe/Paris");

  try {
    // 1. Campagnes — miroir de la régie.
    const campaigns = await platform.listCampaigns(ctx);
    const existingCampaigns = await payload.find({
      collection: "ad-campaigns",
      where: { and: [{ platform: { equals: platformKey } }, { externalId: { in: campaigns.map((c) => c.externalId) } }] },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });
    const campaignIds = new Map(existingCampaigns.docs.map((d) => [d.externalId, d.id]));

    // 2. Chiffres, trois niveaux.
    const byLevel = await Promise.all(LEVELS.map((level) => platform.fetchMetrics(ctx, window, level)));
    const rows = byLevel.flat().filter((r) => r.externalId && r.day >= window.since && r.day <= window.until);

    const existing = await payload.find({
      collection: "ad-metrics-daily",
      where: { and: [{ account: { equals: acc.id } }, { day: { greater_than_equal: window.since } }, { day: { less_than_equal: window.until } }] },
      pagination: false,
      depth: 0,
      overrideAccess: true,
    });
    const known = new Map(existing.docs.map((d) => [metricKey(d.level, d.externalId, d.day), d as unknown as Record<string, unknown>]));

    let written = 0;
    let unchanged = 0;
    for (const r of rows) {
      const data = { name: r.name, campaignExternalId: r.campaignExternalId, spend: r.spend, impressions: r.impressions, clicks: r.clicks, leads: r.leads };
      const prev = known.get(metricKey(r.level, r.externalId, r.day));
      if (prev) {
        if (METRIC_FIELDS.every((f) => sameValue(prev[f], data[f]))) {
          unchanged++;
          continue;
        }
        await payload.update({ collection: "ad-metrics-daily", id: prev.id as number, data, overrideAccess: true });
      } else {
        await payload.create({
          collection: "ad-metrics-daily",
          data: { ...data, day: r.day, account: acc.id as number, platform: platformKey, level: r.level, externalId: r.externalId, currency: acc.currency ?? null },
          overrideAccess: true,
        });
      }
      written++;
    }

    // 3. Les campagnes, avec leurs derniers chiffres consolidés.
    const campaignRows = byLevel[0];
    for (const c of campaigns) {
      const data = {
        account: acc.id as number,
        platform: platformKey,
        externalId: c.externalId,
        name: c.name,
        objective: c.objective,
        status: c.status,
        externalStatus: c.externalStatus,
        dailyBudget: c.dailyBudget,
        lastSyncAt: now.toISOString(),
        kpis: campaignKpis(campaignRows.filter((r) => r.externalId === c.externalId), window),
      };
      const id = campaignIds.get(c.externalId);
      if (id != null) await payload.update({ collection: "ad-campaigns", id, data, overrideAccess: true });
      else await payload.create({ collection: "ad-campaigns", data, overrideAccess: true });
    }

    await setAccount({ status: "connecte", lastSyncAt: now.toISOString(), lastError: null });
    return { ...base, status: "connecte", campaigns: campaigns.length, written, unchanged };
  } catch (e) {
    const expired = e instanceof AdTokenError;
    const error = (e as Error).message || "Erreur inconnue";
    await setAccount({ status: expired ? "expire" : "erreur", lastError: error }).catch(() => null);
    return { ...base, status: expired ? "expire" : "erreur", error };
  }
}
