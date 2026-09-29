import {
  AdTokenError,
  type AccountContext,
  type AccountSnapshot,
  type AccountToken,
  type AdPlatform,
  type CampaignSnapshot,
  type CampaignStatus,
  type DateRange,
  type Level,
  type MetricRow,
  type Objective,
} from "@/modules/ads/platforms/types";

/**
 * Adaptateur Meta (Facebook / Instagram) — LECTURE SEULE en phase 0.
 *
 * Marketing API, par l'API Graph. Aucune méthode d'écriture n'est déclarée :
 * `capabilities` ne dit que « lecture », et c'est ce qui empêchera, plus tard,
 * de confier à un agent un outil que la régie n'a pas.
 *
 * Tout ce qui parle au réseau passe par `fetch` injecté : les tests rejouent
 * de vraies réponses Graph sans rien appeler.
 */

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export type MetaConfig = {
  appId: string;
  appSecret: string;
  /** Version de l'API Graph. Meta en retire une tous les ~2 ans : réglable sans déploiement de code. */
  version: string;
  fetch: Fetch;
  now: () => Date;
};

/** v26.0, sortie le 29/07/2026 — à confirmer dans le changelog Meta à la création de l'app. */
export const META_DEFAULT_VERSION = "v26.0";

/**
 * Ce qui compte comme un lead chez Meta. `lead` est l'agrégat (formulaires
 * instantanés ET pixel) ; les deux autres n'en sont que le détail, pris à défaut
 * — les additionner à `lead` compterait chaque lead deux fois.
 */
const LEAD_AGGREGATE = "lead";
const LEAD_PARTS = ["onsite_conversion.lead_grouped", "offsite_conversion.fb_pixel_lead"];

/** Devises sans centimes : Meta y exprime les budgets en unités, pas en centièmes. */
const ZERO_DECIMAL = new Set(["JPY", "KRW", "CLP", "COP", "CRC", "HUF", "ISK", "PYG", "TWD", "VND", "IDR"]);

const OBJECTIVES: Record<string, Objective> = {
  OUTCOME_LEADS: "leads",
  LEAD_GENERATION: "leads",
  OUTCOME_TRAFFIC: "trafic",
  LINK_CLICKS: "trafic",
  OUTCOME_AWARENESS: "notoriete",
  BRAND_AWARENESS: "notoriete",
  REACH: "notoriete",
};

export const metaObjective = (raw?: string | null): Objective => OBJECTIVES[raw ?? ""] ?? "autre";

/** L'état CONFIGURÉ (`status`), pas l'état de diffusion : une campagne active en cours de revue reste active. */
export function metaStatus(raw?: string | null): CampaignStatus {
  switch (raw) {
    case "ACTIVE":
      return "active";
    case "PAUSED":
      return "en-pause";
    case "ARCHIVED":
    case "DELETED":
      return "terminee";
    default:
      return "active";
  }
}

/** Montant Graph (chaîne en centièmes) → montant en devise du compte. */
export function metaAmount(raw: unknown, currency?: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return ZERO_DECIMAL.has((currency ?? "").toUpperCase()) ? n : n / 100;
}

type Action = { action_type?: string; value?: string };

export function metaLeads(actions?: Action[] | null): number {
  if (!actions?.length) return 0;
  const agg = actions.find((a) => a.action_type === LEAD_AGGREGATE);
  if (agg) return Number(agg.value) || 0;
  return actions.filter((a) => LEAD_PARTS.includes(a.action_type ?? "")).reduce((s, a) => s + (Number(a.value) || 0), 0);
}

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; type?: string } };
type Page<T> = { data?: T[]; paging?: { next?: string } } & GraphError;

/** Codes Graph d'un jeton invalide, expiré ou révoqué. */
const TOKEN_CODES = new Set([190, 102]);

export function createMetaPlatform(cfg: MetaConfig): AdPlatform {
  const base = `https://graph.facebook.com/${cfg.version}`;

  const url = (path: string, params: Record<string, string>) => {
    const u = new URL(`${base}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    return u.toString();
  };

  async function get<T>(target: string): Promise<T> {
    const res = await cfg.fetch(target, { headers: { Accept: "application/json" } });
    const body = (await res.json().catch(() => ({}))) as T & GraphError;
    if (!res.ok || body.error) {
      const e = body.error ?? {};
      const msg = `Meta ${e.code ?? res.status} : ${e.message ?? res.statusText ?? "erreur inconnue"}`;
      if (TOKEN_CODES.has(e.code ?? -1) || (e.type === "OAuthException" && res.status === 401)) throw new AdTokenError(msg);
      throw new Error(msg);
    }
    return body;
  }

  /** Suit `paging.next` jusqu'au bout. Plafonné : une boucle infinie chez Meta ne doit pas tenir une fonction Vercel. */
  async function all<T>(first: string, maxPages = 50): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = first;
    for (let i = 0; next && i < maxPages; i++) {
      const page: Page<T> = await get<Page<T>>(next);
      out.push(...(page.data ?? []));
      next = page.paging?.next;
    }
    return out;
  }

  return {
    key: "meta",
    label: "Meta",
    capabilities: ["lecture"],

    /**
     * Code OAuth → jeton court → jeton longue durée (~60 jours). Meta ne donne
     * pas de jeton de rafraîchissement : l'échéance est gardée pour l'alerte J-7.
     */
    async connect(code: string, redirectUri: string): Promise<AccountToken> {
      const app = { client_id: cfg.appId, client_secret: cfg.appSecret };
      const short = await get<{ access_token: string }>(url("oauth/access_token", { ...app, redirect_uri: redirectUri, code }));
      const long = await get<{ access_token: string; expires_in?: number }>(
        url("oauth/access_token", { ...app, grant_type: "fb_exchange_token", fb_exchange_token: short.access_token }),
      );
      return {
        token: long.access_token,
        expiresAt: long.expires_in ? new Date(cfg.now().getTime() + long.expires_in * 1000) : null,
      };
    },

    async listAccounts(token: string): Promise<AccountSnapshot[]> {
      type Raw = { id: string; name?: string; currency?: string; timezone_name?: string };
      const rows = await all<Raw>(url("me/adaccounts", { access_token: token, fields: "id,name,currency,timezone_name", limit: "100" }));
      return rows.map((r) => ({
        externalId: r.id,
        name: r.name ?? r.id,
        currency: r.currency ?? "EUR",
        timezone: r.timezone_name ?? "Europe/Paris",
      }));
    },

    async listCampaigns(acc: AccountContext): Promise<CampaignSnapshot[]> {
      type Raw = { id: string; name?: string; objective?: string; status?: string; effective_status?: string; daily_budget?: string };
      const rows = await all<Raw>(
        url(`${acc.externalId}/campaigns`, {
          access_token: acc.token,
          fields: "id,name,objective,status,effective_status,daily_budget",
          limit: "200",
        }),
      );
      return rows.map((r) => ({
        externalId: r.id,
        name: r.name ?? r.id,
        objective: metaObjective(r.objective),
        status: metaStatus(r.status),
        externalStatus: r.effective_status ?? r.status ?? "",
        dailyBudget: metaAmount(r.daily_budget, acc.currency),
      }));
    },

    async fetchMetrics(acc: AccountContext, range: DateRange, level: Level): Promise<MetricRow[]> {
      type Raw = {
        date_start: string;
        campaign_id?: string;
        campaign_name?: string;
        adset_id?: string;
        adset_name?: string;
        ad_id?: string;
        ad_name?: string;
        spend?: string;
        impressions?: string;
        clicks?: string;
        actions?: Action[];
      };
      const rows = await all<Raw>(
        url(`${acc.externalId}/insights`, {
          access_token: acc.token,
          level,
          time_range: JSON.stringify(range),
          time_increment: "1",
          fields: "campaign_id,campaign_name,adset_id,adset_name,ad_id,ad_name,spend,impressions,clicks,actions",
          limit: "500",
        }),
      );
      return rows.map((r) => ({
        level,
        externalId: (level === "ad" ? r.ad_id : level === "adset" ? r.adset_id : r.campaign_id) ?? "",
        name: (level === "ad" ? r.ad_name : level === "adset" ? r.adset_name : r.campaign_name) ?? "",
        campaignExternalId: r.campaign_id ?? "",
        day: r.date_start,
        // La dépense des insights est déjà en unités (« 12.34 »), pas en centièmes.
        spend: Number(r.spend) || 0,
        impressions: Number(r.impressions) || 0,
        clicks: Number(r.clicks) || 0,
        leads: metaLeads(r.actions),
      }));
    },
  };
}
