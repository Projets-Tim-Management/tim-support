import { dayKey } from "@/core/lib/dates";
import { escapeRegExp, money, num, round2 as r2 } from "@/core/lib/numbers";
import { periodBounds } from "@/modules/analytics/lib/growth";
import { loadSource, type SourceResult } from "@/modules/analytics/lib/seo-cache";
import { googlePost } from "@/modules/analytics/lib/seo-google-auth";

/**
 * Google Ads en LECTURE — ce que lit Thomas, chef Google Ads de l'équipe IA
 * (étape 5.4, 12/11/2026), et ce que la fiche des canaux prend comme vraie
 * dépense Google.
 *
 * Accès : le compte de service du support (`GSC_SERVICE_ACCOUNT_JSON`), ajouté
 * en « Lecture seule » dans le compte Google Ads ; le projet Google Cloud a
 * l'accès « Explorer » (2 880 opérations par jour). Depuis le 09/09/2026, plus
 * de jeton développeur. Une seule variable : `GOOGLE_ADS_CUSTOMER_ID`.
 *
 * Lu en direct (GAQL), gardé 3 heures. Aucune écriture, aucune table : le
 * pilotage (budgets, mots-clés négatifs) passe par la direction, dans la
 * console Google Ads, via « Vos demandes ».
 *
 * `buildGoogleAds` est pur (testé) ; `loadGoogleAds` interroge l'API.
 */

const GOOGLE_ADS_ENV = ["GOOGLE_ADS_CUSTOMER_ID", "GSC_SERVICE_ACCOUNT_JSON"];
const VERSION_DEFAULT = "v24";
const TTL = 3 * 3600_000;

type Row = Record<string, Record<string, unknown> | undefined>;
const micros = (v: unknown) => Math.round(num(v) / 10_000) / 100;

const customerId = () => (process.env.GOOGLE_ADS_CUSTOMER_ID ?? "").replace(/\D/g, "");

async function search(query: string): Promise<Row[]> {
  const version = process.env.GOOGLE_ADS_API_VERSION?.trim() || VERSION_DEFAULT;
  const login = process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "");
  const url = `https://googleads.googleapis.com/${version}/customers/${customerId()}/googleAds:search`;
  const out: Row[] = [];
  let pageToken: string | undefined;
  do {
    const j = await googlePost<{ results?: Row[]; nextPageToken?: string }>(url, { query, ...(pageToken ? { pageToken } : {}) }, "Google Ads", login ? { headers: { "login-customer-id": login } } : {});
    out.push(...(j.results ?? []));
    pageToken = j.nextPageToken;
  } while (pageToken && out.length < 5000);
  return out;
}

const STATUS_LABELS: Record<string, string> = { ENABLED: "Active", PAUSED: "En pause", REMOVED: "Supprimée" };
const MATCH_LABELS: Record<string, string> = { EXACT: "exact", PHRASE: "expression", BROAD: "large" };

export type GaCampaign = { id: string; name: string; status: string; type: string; dailyBudget: number | null; cost: number; clicks: number; impressions: number; conversions: number; cpc: number | null };
export type GaTerm = { term: string; cost: number; clicks: number; conversions: number; competitor: string | null };
export type GaKeyword = { text: string; match: string; status: string; cost: number; clicks: number; conversions: number; quality: number | null };

export type GoogleAdsView = {
  /** Dépense par mois (« AAAA-MM »), sur la fenêtre demandée : ce que la fiche des canaux prend. */
  spendByMonth: Record<string, number>;
  last30: { cost: number; clicks: number; impressions: number; conversions: number; cpc: number | null };
  campaigns: GaCampaign[];
  searchTerms: GaTerm[];
  keywords: GaKeyword[];
  /** Les actions de conversion actives : sans elles, Google enchérit à l'aveugle. */
  activeConversionActions: number;
  /** Les constats de Thomas, en phrases, les plus importants d'abord. */
  findings: string[];
};

const eur = (n: number) => money(n);

/** Le concurrent suivi dont le nom figure dans la recherche (insensible à la casse et aux accents). */
const fold = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
/** Les expressions des concurrents, compilées une fois (et non par recherche × concurrent). */
const competitorMatcher = (competitors: string[]) => {
  const res = competitors.filter((c) => c.trim().length >= 3).map((c) => ({ c, re: new RegExp(`[^a-z0-9]${escapeRegExp(fold(c))}[^a-z0-9]`) }));
  return (term: string): string | null => {
    const t = ` ${fold(term)} `;
    return res.find((x) => x.re.test(t))?.c ?? null;
  };
};
export const competitorIn = (term: string, competitors: string[]): string | null => competitorMatcher(competitors)(term);

export function buildGoogleAds(raw: { monthly: Row[]; campaigns: Row[]; terms: Row[]; keywords: Row[]; conversionActions: Row[]; competitors: string[] }): GoogleAdsView {
  const spendByMonth: Record<string, number> = {};
  for (const r of raw.monthly) {
    const m = String(r.segments?.month ?? "").slice(0, 7);
    if (m) spendByMonth[m] = r2((spendByMonth[m] ?? 0) + micros(r.metrics?.costMicros));
  }

  const campaigns: GaCampaign[] = raw.campaigns
    .map((r) => {
      const cost = micros(r.metrics?.costMicros);
      const clicks = num(r.metrics?.clicks);
      return {
        id: String(r.campaign?.id ?? ""),
        name: String(r.campaign?.name ?? "—"),
        status: STATUS_LABELS[String(r.campaign?.status)] ?? String(r.campaign?.status ?? ""),
        type: String(r.campaign?.advertisingChannelType ?? "").replace("PERFORMANCE_MAX", "Performance Max").replace("SEARCH", "Réseau de recherche"),
        dailyBudget: r.campaignBudget?.amountMicros != null ? micros(r.campaignBudget.amountMicros) : null,
        cost,
        clicks,
        impressions: num(r.metrics?.impressions),
        conversions: num(r.metrics?.conversions),
        cpc: clicks ? r2(cost / clicks) : null,
      };
    })
    .filter((c) => c.status !== "Supprimée" || c.cost > 0)
    .sort((a, b) => b.cost - a.cost);

  const competitorOf = competitorMatcher(raw.competitors);
  const searchTerms: GaTerm[] = raw.terms
    .map((r) => {
      const term = String(r.searchTermView?.searchTerm ?? "");
      return { term, cost: micros(r.metrics?.costMicros), clicks: num(r.metrics?.clicks), conversions: num(r.metrics?.conversions), competitor: competitorOf(term) };
    })
    .filter((t) => t.term)
    .sort((a, b) => b.cost - a.cost);

  const keywords: GaKeyword[] = raw.keywords
    .map((r) => {
      const k = (r.adGroupCriterion ?? {}) as { keyword?: { text?: string; matchType?: string }; status?: string; qualityInfo?: { qualityScore?: number } };
      return {
        text: String(k.keyword?.text ?? ""),
        match: MATCH_LABELS[String(k.keyword?.matchType)] ?? String(k.keyword?.matchType ?? ""),
        status: STATUS_LABELS[String(k.status)] ?? String(k.status ?? ""),
        cost: micros(r.metrics?.costMicros),
        clicks: num(r.metrics?.clicks),
        conversions: num(r.metrics?.conversions),
        quality: k.qualityInfo?.qualityScore ?? null,
      };
    })
    .filter((k) => k.text)
    .sort((a, b) => b.cost - a.cost);

  const cost = r2(campaigns.reduce((s, c) => s + c.cost, 0));
  const clicks = campaigns.reduce((s, c) => s + c.clicks, 0);
  const conversions = campaigns.reduce((s, c) => s + c.conversions, 0);
  const last30 = { cost, clicks, impressions: campaigns.reduce((s, c) => s + c.impressions, 0), conversions, cpc: clicks ? r2(cost / clicks) : null };
  const activeConversionActions = raw.conversionActions.filter((r) => String(r.conversionAction?.status) === "ENABLED").length;

  // Les constats de Thomas : ce qui demande une décision d'abord.
  const findings: string[] = [];
  if (cost > 0 && conversions === 0) {
    findings.push(
      activeConversionActions
        ? `Aucune conversion remontée en 30 jours pour ${eur(cost)} dépensés, alors que ${activeConversionActions} action(s) de conversion sont actives : le suivi ne remonte pas (balise, import des leads).`
        : `Aucune action de conversion active : Google enchérit à l'aveugle (${eur(cost)} dépensés en 30 jours sans savoir quel clic devient un lead). C'est le premier chantier.`,
    );
  }
  const onCompetitors = searchTerms.filter((t) => t.competitor);
  const competitorCost = r2(onCompetitors.reduce((s, t) => s + t.cost, 0));
  if (competitorCost > 0) {
    const names = [...new Set(onCompetitors.map((t) => t.competitor))].join(", ");
    findings.push(`${eur(competitorCost)} dépensés sur des recherches de concurrents suivis (${names}) : à garder seulement si elles amènent des leads qualifiés.`);
  }
  const wasted = searchTerms.filter((t) => t.conversions === 0 && t.cost >= 15);
  if (wasted.length) findings.push(`${wasted.length} recherche(s) à plus de 15 € sans conversion : ${wasted.slice(0, 4).map((t) => `« ${t.term} » (${eur(t.cost)})`).join(", ")} — candidates aux mots-clés négatifs.`);
  const seenTermCost = r2(searchTerms.reduce((s, t) => s + t.cost, 0));
  if (cost > 0 && seenTermCost < cost * 0.5) findings.push(`Google ne montre que ${eur(seenTermCost)} des ${eur(cost)} de recherches (le reste est masqué) : les constats sur les termes sont partiels.`);
  const lowQ = keywords.filter((k) => k.quality != null && k.quality <= 4 && k.cost > 0);
  if (lowQ.length) findings.push(`${lowQ.length} mot(s)-clé(s) avec un niveau de qualité de 4/10 ou moins : annonces ou page d'arrivée à rapprocher de la recherche.`);

  return { spendByMonth, last30, campaigns, searchTerms: searchTerms.slice(0, 40), keywords: keywords.slice(0, 30), activeConversionActions, findings };
}

const iso = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * Le compte Google Ads : 30 derniers jours en détail, et la dépense mois par
 * mois sur `months` × 2 mois. Ce qui se lit chez Google est gardé 3 heures ;
 * les concurrents s'appliquent APRÈS le cache — une liste modifiée compte tout
 * de suite (relecture du 12/11/2026).
 */
export async function loadGoogleAds(competitors: string[], months = 3, now = new Date()): Promise<SourceResult<GoogleAdsView>> {
  // Le jour de fin est celui de Paris (le fuseau du compte) : entre minuit et 2 h, le jour UTC serait la veille.
  const to = dayKey(now);
  const raw = await loadSource(GOOGLE_ADS_ENV, `gads:${customerId()}:${months}:${to}`, TTL, async () => {
    const from = iso(periodBounds(months, now).prevFrom);
    const [monthly, campaigns, terms, keywords, conversionActions] = await Promise.all([
      search(`SELECT segments.month, metrics.cost_micros FROM customer WHERE segments.date BETWEEN '${from}' AND '${to}'`),
      search("SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, campaign_budget.amount_micros, metrics.cost_micros, metrics.clicks, metrics.impressions, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS"),
      search("SELECT search_term_view.search_term, metrics.cost_micros, metrics.clicks, metrics.conversions FROM search_term_view WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC LIMIT 200"),
      search("SELECT ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, ad_group_criterion.status, ad_group_criterion.quality_info.quality_score, metrics.cost_micros, metrics.clicks, metrics.conversions FROM keyword_view WHERE segments.date DURING LAST_30_DAYS ORDER BY metrics.cost_micros DESC LIMIT 100"),
      search("SELECT conversion_action.name, conversion_action.status FROM conversion_action"),
    ]);
    return { monthly, campaigns, terms, keywords, conversionActions };
  });
  return raw.status === "ok" ? { ...raw, data: buildGoogleAds({ ...raw.data, competitors }) } : raw;
}

/** Le test de la page Connexions : le nom du compte, la requête la plus légère. */
export async function pingGoogleAds(): Promise<string> {
  const r = await search("SELECT customer.descriptive_name, customer.currency_code FROM customer LIMIT 1");
  const c = r[0]?.customer as { descriptiveName?: string; currencyCode?: string } | undefined;
  return `Google Ads répond : compte « ${c?.descriptiveName ?? "?"} » (${customerId()}, ${c?.currencyCode ?? "?"}), en lecture seule.`;
}
