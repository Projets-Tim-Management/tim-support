import { cached, httpError, missingEnv, type SourceResult } from "@/modules/analytics/lib/seo-cache";

/**
 * ChatGPT Ads en LECTURE — ce que lit Sarah, cheffe ChatGPT Ads de l'équipe IA
 * (étape 5.5, 12/11/2026), et ce que la fiche des canaux prend comme vraie
 * dépense ChatGPT.
 *
 * L'API annonceur d'OpenAI (https://api.ads.openai.com/v1) : une clé par
 * compte publicitaire, créée dans le Gestionnaire de publicités (Paramètres).
 * ⚠️ OpenAI ne documente pas de clé « lecture seule » : ce module ne fait QUE
 * des GET. Une clé de CONVERSION (Conversions › Clés de conversion) ne lit
 * rien — elle servira à renvoyer les leads qualifiés.
 *
 * Pas de données sur les conversations où les annonces apparaissent : Sarah
 * juge par campagne ; le lead qualifié, c'est la fiche des canaux qui le dit.
 *
 * Lu en direct, gardé 3 heures. `buildOpenAiAds` est pur (testé).
 */

export const OPENAI_ADS_ENV = ["OPENAI_ADS_API_KEY"];
const BASE = "https://api.ads.openai.com/v1";
const TTL = 3 * 3600_000;

type Row = Record<string, unknown>;
const num = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" ? Number(v) || 0 : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

async function get(path: string, params: [string, string][] = []): Promise<Record<string, unknown>> {
  const q = new URLSearchParams(params);
  const res = await fetch(`${BASE}/${path}${params.length ? `?${q}` : ""}`, {
    headers: { authorization: `Bearer ${process.env.OPENAI_ADS_API_KEY!.trim()}` },
    cache: "no-store",
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    if (res.status === 403) throw new Error("ChatGPT Ads : la clé ne peut pas lire les données publicitaires (une clé de conversion ? il faut la clé d'API annonceur, Paramètres du Gestionnaire de publicités).");
    throw await httpError(res, "ChatGPT Ads");
  }
  return (await res.json()) as Record<string, unknown>;
}

const insights = (since: string, until: string, level: "ad_account" | "campaign", granularity: "none" | "monthly", fields: string[]) =>
  get("ad_account/insights", [
    ["aggregation_level", level],
    ["time_ranges[]", JSON.stringify({ type: "date_range", since, until })],
    ["time_granularity", granularity],
    ["limit", "200"],
    ...fields.map((f): [string, string] => ["fields[]", f]),
  ]);

export type OaCampaign = { id: string; name: string; spend: number; clicks: number; impressions: number; conversions: number; cpc: number | null; costPerConversion: number | null };

export type OpenAiAdsView = {
  account: { name: string; status: string; review: string | null };
  spendByMonth: Record<string, number>;
  last30: { spend: number; clicks: number; impressions: number; conversions: number; cpc: number | null; costPerConversion: number | null };
  campaigns: OaCampaign[];
  findings: string[];
};

const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;
const eur2 = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
/** Le mois (« AAAA-MM ») d'un début de période, en heure de Paris (le fuseau du compte). */
const monthOf = (unixSeconds: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit" }).format(new Date(unixSeconds * 1000)).slice(0, 7);

export function buildOpenAiAds(raw: { account: Row; monthly: Row[]; campaigns: Row[] }): OpenAiAdsView {
  const spendByMonth: Record<string, number> = {};
  for (const r of raw.monthly) {
    const m = monthOf(num(r.start_time));
    spendByMonth[m] = r2((spendByMonth[m] ?? 0) + num(r.spend));
  }
  const campaigns: OaCampaign[] = raw.campaigns
    .map((r) => {
      const spend = r2(num(r.spend));
      const clicks = num(r.clicks);
      const conversions = num(r.conversions);
      return {
        id: String(r.campaign_id ?? ""),
        name: String(r.campaign_name ?? "—"),
        spend,
        clicks,
        impressions: num(r.impressions),
        conversions,
        cpc: clicks ? r2(spend / clicks) : null,
        costPerConversion: conversions ? r2(spend / conversions) : null,
      };
    })
    .sort((a, b) => b.spend - a.spend);
  const spend = r2(campaigns.reduce((s, c) => s + c.spend, 0));
  const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const conversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const last30 = { spend, clicks, impressions: campaigns.reduce((s, c) => s + c.impressions, 0), conversions, cpc: clicks ? r2(spend / clicks) : null, costPerConversion: conversions ? r2(spend / conversions) : null };

  // Les constats de Sarah : ce que la régie dit, et ce qu'elle ne dit pas.
  const findings: string[] = [];
  const review = (raw.account.review as { status?: string } | undefined)?.status ?? null;
  if (review && review !== "approved") findings.push(`La vérification de la marque n'est pas approuvée (« ${review} ») : les annonces ne peuvent pas diffuser.`);
  if (spend > 0 && conversions === 0) findings.push(`Aucune conversion comptée par le pixel ChatGPT pour ${eur(spend)} dépensés en 30 jours : le pixel ou ses événements sont à vérifier (Conversions › Diagnostics).`);
  if (spend > 0 && conversions > 0) {
    findings.push(
      `${eur(spend)} dépensés en 30 jours pour ${clicks} clics (${eur2(last30.cpc ?? 0)} le clic) et ${conversions} conversion${conversions > 1 ? "s" : ""} comptée${conversions > 1 ? "s" : ""} par le pixel ChatGPT (${eur(last30.costPerConversion ?? 0)} chacune). Une conversion du pixel n'est pas un lead qualifié : c'est la fiche des canaux qui juge.`,
    );
  }
  if (campaigns.length === 1 && spend > 0) findings.push("Une seule campagne porte tout le budget : rien à quoi la comparer. Un second angle (une autre campagne ou d'autres annonces) dirait ce qui marche.");
  return { account: { name: String(raw.account.name ?? "—"), status: String(raw.account.status ?? ""), review }, spendByMonth, last30, campaigns, findings };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function loadOpenAiAds(months = 3, now = new Date()): Promise<SourceResult<OpenAiAdsView>> {
  const missing = missingEnv(OPENAI_ADS_ENV);
  if (missing.length) return { status: "missing", missing };
  try {
    return await cached(`oaads:${months}:${iso(now)}:${now.getUTCHours() >> 2}`, TTL, async () => {
      const from = iso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2 * months + 1, 1)));
      const until = iso(now);
      const since30 = iso(new Date(now.getTime() - 29 * 86_400_000));
      const [account, monthly, campaigns] = await Promise.all([
        get("ad_account"),
        // Par mois, l'API refuse les conversions : seule la dépense sert ici.
        insights(from, until, "ad_account", "monthly", ["spend"]),
        insights(since30, until, "campaign", "none", ["campaign_id", "campaign_name", "spend", "impressions", "clicks", "conversions", "cpc"]),
      ]);
      const data = buildOpenAiAds({ account, monthly: (monthly.data as Row[] | undefined) ?? [], campaigns: (campaigns.data as Row[] | undefined) ?? [] });
      return { status: "ok" as const, data, fetchedAt: new Date().toISOString() };
    });
  } catch (e) {
    return { status: "error", message: e instanceof Error ? e.message : String(e) };
  }
}

/** Le test de la page Connexions : le compte, la lecture la plus légère. */
export async function pingOpenAiAds(): Promise<string> {
  const a = await get("ad_account");
  const review = (a.review as { status?: string } | undefined)?.status;
  return `ChatGPT Ads répond : compte « ${String(a.name ?? "?")} » (${String(a.currency_code ?? "?")}, ${String(a.status ?? "?")}${review ? `, marque ${review}` : ""}).`;
}
