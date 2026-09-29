import { dayInTz } from "@/modules/ads/lib/sync";
import { MOCK_ACCOUNT_ID } from "@/modules/ads/platforms/meta-mock";

/**
 * Le tableau de bord Publicité (/admin/publicite) — partie PURE, donc testable.
 *
 * Il lit `ad-metrics-daily` (niveau campagne), jamais la régie : un seul
 * chiffre, le même pour tout le monde (plan, §4.6). Dans l'ordre de l'écran :
 * ce qui attend une décision, l'état des comptes, puis les chiffres.
 *
 * Deux choix qui se voient :
 *  - les comptes ARCHIVÉS ne sont pas comptés : ils ne sont plus suivis, et le
 *    compte simulé, une fois archivé, ne doit plus se mêler aux vrais chiffres ;
 *  - seuls les montants en EUROS s'additionnent. Un compte dans une autre
 *    devise est signalé à part, jamais converti en silence.
 */

export const PERIODS = [7, 30, 90] as const;
export type PeriodDays = (typeof PERIODS)[number];

export const periodDays = (raw: unknown): PeriodDays => {
  const n = Number(Array.isArray(raw) ? raw[0] : raw);
  return (PERIODS as readonly number[]).includes(n) ? (n as PeriodDays) : 30;
};

export type DashAccount = {
  id: number | string;
  name?: string | null;
  platform?: string | null;
  externalId?: string | null;
  status?: string | null;
  currency?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  tokenExpiresAt?: string | null;
  /** Masqué par l'API : on sait seulement s'il est posé. */
  systemUserToken?: string | null;
};

export type DashCampaign = {
  id: number | string;
  name?: string | null;
  account?: number | string | { id: number | string } | null;
  platform?: string | null;
  externalId?: string | null;
  status?: string | null;
  objective?: string | null;
  dailyBudget?: number | null;
};

export type DashMetric = {
  account?: number | string | { id: number | string } | null;
  platform?: string | null;
  externalId?: string | null;
  day: string;
  spend?: number | null;
  impressions?: number | null;
  clicks?: number | null;
  leads?: number | null;
};

type Totals = { spend: number; impressions: number; clicks: number; leads: number };

export type AccountAlert = { id: number | string; name: string; tone: "warn" | "bad"; message: string };

export type CampaignRow = {
  id: number | string;
  name: string;
  account: string;
  status: string;
  objective: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number | null;
  leads: number;
  cpl: number | null;
  href: string;
};

export type AdsDashboard = {
  period: { days: PeriodDays; since: string; until: string; prevSince: string; prevUntil: string };
  platforms: string[];
  simulated: boolean;
  accounts: { total: number; active: number; archived: number; otherCurrency: string[] };
  alerts: AccountAlert[];
  lastSyncAt: string | null;
  totals: Totals & { ctr: number | null; cpl: number | null };
  previous: Totals & { covered: boolean };
  daily: { day: string; spend: number; leads: number; clicks: number }[];
  campaigns: CampaignRow[];
};

const idOf = (v: DashMetric["account"]): string | null => (v == null ? null : typeof v === "object" ? String(v.id) : String(v));
const shift = (day: string, delta: number) => new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
const zero = (): Totals => ({ spend: 0, impressions: 0, clicks: 0, leads: 0 });
const add = (t: Totals, m: DashMetric) => {
  t.spend += Number(m.spend) || 0;
  t.impressions += Number(m.impressions) || 0;
  t.clicks += Number(m.clicks) || 0;
  t.leads += Number(m.leads) || 0;
};

/** Ce qu'un compte demande qu'on fasse — du plus bloquant au plus lointain. */
export function accountAlert(a: DashAccount, now: Date): AccountAlert | null {
  const name = a.name ?? String(a.id);
  if (a.status === "archive") return null;
  if (a.status === "expire") return { id: a.id, name, tone: "bad", message: "Jeton expiré : la synchro est arrêtée. Reconnectez le compte, ou posez un jeton d'utilisateur système." };
  if (a.status === "erreur") return { id: a.id, name, tone: "bad", message: `Synchro en erreur${a.lastError ? ` : ${a.lastError}` : "."}` };
  if (a.status === "sans-jeton") return { id: a.id, name, tone: "warn", message: "Aucun jeton : le compte n'est pas encore connecté." };
  if (!a.systemUserToken && a.tokenExpiresAt) {
    const left = Math.ceil((Date.parse(a.tokenExpiresAt) - now.getTime()) / 86_400_000);
    if (left <= 7) return { id: a.id, name, tone: "warn", message: `Jeton OAuth valable encore ${Math.max(left, 0)} jour(s) : reconnectez-le, ou posez un jeton d'utilisateur système.` };
  }
  if (a.lastSyncAt && now.getTime() - Date.parse(a.lastSyncAt) > 36 * 3_600_000) {
    return { id: a.id, name, tone: "warn", message: "Pas de synchro depuis plus de 36 h : les chiffres ci-dessous ne sont plus à jour." };
  }
  return null;
}

export function buildAdsDashboard(input: {
  accounts: DashAccount[];
  campaigns: DashCampaign[];
  metrics: DashMetric[];
  now: Date;
  days: PeriodDays;
  platform?: string | null;
  adminRoute?: string;
}): AdsDashboard {
  const { now, days } = input;
  const admin = input.adminRoute ?? "/admin";
  const until = dayInTz(now, "Europe/Paris");
  const since = shift(until, -(days - 1));
  const prevUntil = shift(since, -1);
  const prevSince = shift(prevUntil, -(days - 1));

  const platforms = [...new Set(input.accounts.filter((a) => a.status !== "archive").map((a) => a.platform ?? "meta"))].sort();
  const inPlatform = (p?: string | null) => !input.platform || (p ?? "meta") === input.platform;

  const followed = input.accounts.filter((a) => a.status !== "archive" && inPlatform(a.platform));
  const euro = followed.filter((a) => (a.currency ?? "EUR").toUpperCase() === "EUR");
  const counted = new Set(euro.map((a) => String(a.id)));
  const accountName = new Map(input.accounts.map((a) => [String(a.id), a.name ?? String(a.id)]));

  const metrics = input.metrics.filter((m) => counted.has(idOf(m.account) ?? ""));
  const current = zero();
  const previous = zero();
  const byDay = new Map<string, Totals>();
  const byCampaign = new Map<string, Totals>();
  let earliest: string | null = null;
  for (const m of metrics) {
    if (!earliest || m.day < earliest) earliest = m.day;
    if (m.day >= since && m.day <= until) {
      add(current, m);
      if (!byDay.has(m.day)) byDay.set(m.day, zero());
      add(byDay.get(m.day)!, m);
      const k = `${idOf(m.account)}|${m.externalId}`;
      if (!byCampaign.has(k)) byCampaign.set(k, zero());
      add(byCampaign.get(k)!, m);
    } else if (m.day >= prevSince && m.day <= prevUntil) {
      add(previous, m);
    }
  }

  // Série continue : un jour sans chiffre est un zéro, pas un trou.
  const daily: AdsDashboard["daily"] = [];
  for (let d = since; d <= until; d = shift(d, 1)) {
    const t = byDay.get(d) ?? zero();
    daily.push({ day: d, spend: round2(t.spend), leads: t.leads, clicks: t.clicks });
  }

  const campaigns: CampaignRow[] = input.campaigns
    .filter((c) => counted.has(idOf(c.account) ?? ""))
    .map((c) => {
      const t = byCampaign.get(`${idOf(c.account)}|${c.externalId}`) ?? zero();
      return {
        id: c.id,
        name: c.name ?? String(c.id),
        account: accountName.get(idOf(c.account) ?? "") ?? "—",
        status: c.status ?? "",
        objective: c.objective ?? "",
        spend: round2(t.spend),
        impressions: t.impressions,
        clicks: t.clicks,
        ctr: t.impressions ? round2((t.clicks / t.impressions) * 100) : null,
        leads: t.leads,
        cpl: t.leads ? round2(t.spend / t.leads) : null,
        href: `${admin}/collections/ad-campaigns/${c.id}`,
      };
    });

  const syncs = followed.map((a) => a.lastSyncAt).filter((s): s is string => Boolean(s)).sort();

  return {
    period: { days, since, until, prevSince, prevUntil },
    platforms,
    simulated: followed.some((a) => a.externalId === MOCK_ACCOUNT_ID),
    accounts: {
      total: input.accounts.filter((a) => inPlatform(a.platform)).length,
      active: followed.length,
      archived: input.accounts.filter((a) => a.status === "archive" && inPlatform(a.platform)).length,
      otherCurrency: followed.filter((a) => !counted.has(String(a.id))).map((a) => `${a.name ?? a.id} (${a.currency})`),
    },
    alerts: followed.map((a) => accountAlert(a, now)).filter((x): x is AccountAlert => x !== null).sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "bad" ? -1 : 1)),
    lastSyncAt: syncs.length ? syncs[syncs.length - 1] : null,
    totals: {
      ...current,
      spend: round2(current.spend),
      ctr: current.impressions ? round2((current.clicks / current.impressions) * 100) : null,
      cpl: current.leads ? round2(current.spend / current.leads) : null,
    },
    // La période précédente n'est comparable que si la synchro la couvrait déjà.
    previous: { ...previous, spend: round2(previous.spend), covered: earliest !== null && earliest <= prevSince },
    daily,
    campaigns,
  };
}

/** Variation en %, `null` quand la période précédente n'est pas couverte ou vaut zéro. */
export const deltaPct = (cur: number, prev: number, covered: boolean): number | null =>
  covered && prev > 0 ? Math.round(((cur - prev) / prev) * 1000) / 10 : null;
