import { createHmac } from "node:crypto";

import { metaAccountState } from "@/modules/ads/lib/access-verdict";
import {
  AdTokenError,
  type AccountContext,
  type AccessReport,
  type AccountState,
  type CreativeMedia,
  type NewAdSet,
  type NewCampaign,
  type NewCreative,
  type ObjectRef,
  type VideoState,
  type TargetingKind,
  type TargetingOption,
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

type GraphError = { error?: { message?: string; code?: number; error_subcode?: number; type?: string; error_user_msg?: string } };

/** Euros (devise du compte) → montant Graph : en centièmes, sauf devises sans centimes. Pure. */
export function toMetaAmount(amount: number, currency?: string | null): number {
  return ZERO_DECIMAL.has((currency ?? "").toUpperCase()) ? Math.round(amount) : Math.round(amount * 100);
}

/** Où va chaque format : le 9:16 en Stories et Reels ; le 4:5 (sinon le 1:1) dans les fils. Pure. */
export const STORY_SPEC = {
  publisher_platforms: ["facebook", "instagram", "messenger"],
  facebook_positions: ["story", "facebook_reels"],
  instagram_positions: ["story", "reels"],
  messenger_positions: ["story"],
};
export const FEED_SPEC = {
  publisher_platforms: ["facebook", "instagram"],
  facebook_positions: ["feed", "marketplace", "video_feeds", "search"],
  instagram_positions: ["stream", "explore", "profile_feed"],
};

/**
 * La créa chez Meta : un asset_feed_spec dont les règles de personnalisation
 * par placement envoient chaque format à sa place (« optimization_type :
 * PLACEMENT »). Un seul format : il sert partout. Pure.
 */
export function metaCreativeSpec(c: NewCreative): Record<string, unknown> {
  const label = (m: CreativeMedia) => ({ name: `f${m.format}` });
  const assets = c.media.map((m) =>
    c.kind === "video" ? { video_id: m.video!.id, ...(m.video!.thumbnailUrl ? { thumbnail_url: m.video!.thumbnailUrl } : {}), adlabels: [label(m)] } : { hash: m.image!.hash, adlabels: [label(m)] },
  );
  const story = c.media.find((m) => m.format === "9x16");
  const feed = c.media.find((m) => m.format === "4x5") ?? c.media.find((m) => m.format === "1x1");
  const key = c.kind === "video" ? "video_label" : "image_label";
  const rules = [
    ...(feed ? [{ customization_spec: FEED_SPEC, [key]: label(feed), priority: 1 }] : []),
    ...(story ? [{ customization_spec: STORY_SPEC, [key]: label(story), priority: 2 }] : []),
  ];
  return {
    name: c.name,
    object_story_spec: { page_id: c.pageId, ...(c.instagramId ? { instagram_user_id: c.instagramId } : {}) },
    asset_feed_spec: {
      [c.kind === "video" ? "videos" : "images"]: assets,
      bodies: [{ text: c.body }],
      titles: [{ text: c.title }],
      ...(c.description ? { descriptions: [{ text: c.description }] } : {}),
      ...(c.link ? { link_urls: [{ website_url: c.link }] } : {}),
      call_to_action_types: [c.cta],
      ad_formats: [c.kind === "video" ? "SINGLE_VIDEO" : "SINGLE_IMAGE"],
      ...(c.media.length > 1 && rules.length ? { asset_customization_rules: rules, optimization_type: "PLACEMENT" } : {}),
    },
    ...(c.urlTags ? { url_tags: c.urlTags } : {}),
  };
}
type Page<T> = { data?: T[]; paging?: { next?: string } } & GraphError;

/** Codes Graph d'un jeton invalide, expiré ou révoqué. */
const TOKEN_CODES = new Set([190, 102]);

export function createMetaPlatform(cfg: MetaConfig): AdPlatform {
  const base = `https://graph.facebook.com/${cfg.version}`;

  /**
   * `appsecret_proof` accompagne chaque appel fait avec un jeton : c'est ce que
   * Meta exige quand l'app active « Exiger la clé secrète », et ce qui rend un
   * jeton volé inutilisable sans le secret de l'app.
   */
  const url = (path: string, params: Record<string, string>) => {
    const u = new URL(`${base}/${path.replace(/^\//, "")}`);
    for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
    // Pas de preuve avec le jeton de l'APPLICATION (« id|secret ») : elle n'a de sens que pour un jeton d'utilisateur.
    if (params.access_token && cfg.appSecret && !params.access_token.includes("|")) {
      u.searchParams.set("appsecret_proof", createHmac("sha256", cfg.appSecret).update(params.access_token).digest("hex"));
    }
    return u.toString();
  };

  async function get<T>(target: string, init?: RequestInit): Promise<T> {
    const res = await cfg.fetch(target, { headers: { Accept: "application/json" }, ...init });
    const body = (await res.json().catch(() => ({}))) as T & GraphError;
    if (!res.ok || body.error) {
      const e = body.error ?? {};
      // Le message « utilisateur » de Meta dit ce qu'il faut corriger (« budget trop bas »…) : on le garde.
      const msg = `Meta ${e.code ?? res.status} : ${e.message ?? res.statusText ?? "erreur inconnue"}${e.error_user_msg ? ` — ${e.error_user_msg}` : ""}`;
      if (TOKEN_CODES.has(e.code ?? -1) || (e.type === "OAuthException" && res.status === 401)) throw new AdTokenError(msg);
      throw new Error(msg);
    }
    return body;
  }

  /** L'état du compte publicitaire, lu en direct (un compte se ferme seul après 56 jours sans dépense). */
  async function accountState(acc: AccountContext): Promise<AccountState> {
    const r = await get<{ account_status?: number }>(url(acc.externalId, { access_token: acc.token, fields: "account_status" }));
    return metaAccountState(r.account_status);
  }

  /** Écriture : formulaire, objets en JSON, jeton et preuve dans le corps (jamais dans l'adresse). */
  async function post<T>(path: string, token: string, params: Record<string, unknown>): Promise<T> {
    const body = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) body.set(k, typeof v === "string" ? v : JSON.stringify(v));
    body.set("access_token", token);
    if (cfg.appSecret) body.set("appsecret_proof", createHmac("sha256", cfg.appSecret).update(token).digest("hex"));
    return get<T>(`${base}/${path.replace(/^\//, "")}`, { method: "POST", body, headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" } });
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
    capabilities: ["lecture", "creation", "upload-crea", "statut", "budget"],

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

    /**
     * Les droits du jeton (debug_token, interrogé avec le jeton de l'application)
     * et ce qu'il ouvre : Pages (avec leur compte Instagram professionnel),
     * comptes Instagram liés au compte publicitaire, pixels. Une liste qui ne
     * se lit pas (droit manquant) reste vide : le rapport dit ce qui manque.
     */
    /** La recherche de ciblage de Meta : intérêts (adinterest), métiers (adworkposition), régions (adgeolocation). */
    async searchTargeting(acc: AccountContext, kind: TargetingKind, query: string, country = "FR"): Promise<TargetingOption[]> {
      type Raw = { id?: string; key?: string; name?: string; audience_size_lower_bound?: number; audience_size?: number; path?: string[]; country_code?: string };
      const params: Record<string, string> =
        kind === "interet"
          ? { type: "adinterest", q: query, limit: "15" }
          : kind === "metier"
            ? { type: "adworkposition", q: query, limit: "15" }
            : { type: "adgeolocation", q: query, location_types: JSON.stringify(["region"]), country_code: country, limit: "15" };
      const r = await get<{ data?: Raw[] }>(url("search", { ...params, access_token: acc.token }));
      return (r.data ?? []).map((x) => ({
        id: String(x.id ?? x.key ?? ""),
        name: x.name ?? "",
        audience: x.audience_size_lower_bound ?? x.audience_size ?? null,
        path: x.path?.length ? x.path.join(" › ") : (x.country_code ?? null),
      })).filter((x) => x.id && x.name);
    },

    async createCampaign(acc: AccountContext, c: NewCampaign): Promise<string> {
      const r = await post<{ id: string }>(`${acc.externalId}/campaigns`, acc.token, {
        name: c.name,
        objective: c.objective,
        status: "PAUSED",
        special_ad_categories: [],
        buying_type: "AUCTION",
        // Le budget vit sur chaque ensemble : la part que le plan lui donne.
        is_adset_budget_sharing_enabled: false,
      });
      return r.id;
    },

    async createAdSet(acc: AccountContext, a: NewAdSet): Promise<string> {
      const r = await post<{ id: string }>(`${acc.externalId}/adsets`, acc.token, {
        name: a.name,
        campaign_id: a.campaignId,
        daily_budget: toMetaAmount(a.dailyBudget, acc.currency),
        billing_event: a.billingEvent,
        optimization_goal: a.optimizationGoal,
        bid_strategy: "LOWEST_COST_WITHOUT_CAP",
        targeting: a.targeting,
        promoted_object: a.promotedObject ?? undefined,
        destination_type: a.destinationType ?? undefined,
        status: "PAUSED",
      });
      return r.id;
    },

    async uploadImage(acc: AccountContext, fileUrl: string, name: string): Promise<{ hash: string }> {
      const res = await cfg.fetch(fileUrl);
      if (!res.ok) throw new Error(`Image illisible (${res.status}) : ${fileUrl}`);
      const bytes = Buffer.from(await res.arrayBuffer()).toString("base64");
      const r = await post<{ images?: Record<string, { hash: string }> }>(`${acc.externalId}/adimages`, acc.token, { bytes, name });
      const hash = Object.values(r.images ?? {})[0]?.hash;
      if (!hash) throw new Error("Meta n'a pas rendu d'empreinte pour l'image.");
      return { hash };
    },

    async uploadVideo(acc: AccountContext, fileUrl: string, name: string): Promise<{ id: string }> {
      // Meta va chercher le fichier à son adresse (notre stockage public) : rien ne transite par la fonction.
      const r = await post<{ id: string }>(`${acc.externalId}/advideos`, acc.token, { file_url: fileUrl, name });
      return { id: r.id };
    },

    async videoState(acc: AccountContext, id: string): Promise<VideoState> {
      const v = await get<{ status?: { video_status?: string; processing_phase?: { error?: { message?: string } } } }>(url(id, { access_token: acc.token, fields: "status" }));
      const status = v.status?.video_status;
      if (status === "error") return { ready: false, error: v.status?.processing_phase?.error?.message ?? "Traitement de la vidéo en échec chez Meta.", thumbnailUrl: null };
      if (status !== "ready") return { ready: false, error: null, thumbnailUrl: null };
      const t = await get<{ data?: { uri?: string; is_preferred?: boolean }[] }>(url(`${id}/thumbnails`, { access_token: acc.token }));
      const thumb = (t.data ?? []).find((x) => x.is_preferred) ?? t.data?.[0];
      return { ready: true, error: null, thumbnailUrl: thumb?.uri ?? null };
    },

    async createCreative(acc: AccountContext, c: NewCreative): Promise<string> {
      return (await post<{ id: string }>(`${acc.externalId}/adcreatives`, acc.token, metaCreativeSpec(c))).id;
    },

    async createAd(acc: AccountContext, a: { name: string; adSetId: string; creativeId: string }): Promise<string> {
      return (await post<{ id: string }>(`${acc.externalId}/ads`, acc.token, { name: a.name, adset_id: a.adSetId, creative: { creative_id: a.creativeId }, status: "PAUSED" })).id;
    },

    async adPreview(acc: AccountContext, adId: string, format: string): Promise<string> {
      const r = await get<{ data?: { body?: string }[] }>(url(`${adId}/previews`, { access_token: acc.token, ad_format: format }));
      return r.data?.[0]?.body ?? "";
    },

    async setStatus(acc: AccountContext, ref: ObjectRef, status: "active" | "pause"): Promise<void> {
      await post(ref.externalId, acc.token, { status: status === "active" ? "ACTIVE" : "PAUSED" });
    },

    async setBudget(acc: AccountContext, ref: ObjectRef, amount: number): Promise<void> {
      await post(ref.externalId, acc.token, { daily_budget: toMetaAmount(amount, acc.currency) });
    },

    accountState,

    async checkAccess(acc: AccountContext): Promise<AccessReport> {
      type Debug = { data?: { scopes?: string[]; is_valid?: boolean } };
      const debug = await get<Debug>(url("debug_token", { input_token: acc.token, access_token: `${cfg.appId}|${cfg.appSecret}` }));
      if (debug.data?.is_valid === false) throw new AdTokenError("Meta : jeton invalide ou révoqué.");
      const soft = async <T>(p: Promise<T[]>): Promise<T[]> => p.catch(() => []);
      type RawPage = { id: string; name?: string; instagram_business_account?: { id: string; username?: string } };
      type RawIg = { id: string; username?: string };
      type RawPixel = { id: string; name?: string };
      const [pages, ig, pixels, account] = await Promise.all([
        soft(all<RawPage>(url("me/accounts", { access_token: acc.token, fields: "id,name,instagram_business_account{id,username}", limit: "100" }))),
        soft(all<RawIg>(url(`${acc.externalId}/instagram_accounts`, { access_token: acc.token, fields: "id,username", limit: "100" }))),
        soft(all<RawPixel>(url(`${acc.externalId}/adspixels`, { access_token: acc.token, fields: "id,name", limit: "100" }))),
        accountState(acc).catch(() => undefined),
      ]);
      const igOfPages = pages.flatMap((p) => (p.instagram_business_account ? [{ id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? p.instagram_business_account.id }] : []));
      const instagram = [...igOfPages, ...ig.map((i) => ({ id: i.id, username: i.username ?? i.id }))].filter((x, i, arr) => arr.findIndex((y) => y.id === x.id) === i);
      return {
        scopes: debug.data?.scopes ?? [],
        pages: pages.map((p) => ({ id: p.id, name: p.name ?? p.id, instagram: p.instagram_business_account ? { id: p.instagram_business_account.id, username: p.instagram_business_account.username ?? p.instagram_business_account.id } : null })),
        instagram,
        pixels: pixels.map((p) => ({ id: p.id, name: p.name ?? p.id })),
        account,
      };
    },
  };
}
