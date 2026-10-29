import type {
  AccessReport,
  AccountState,
  NewAdSet,
  NewCampaign,
  NewCreative,
  VideoState,
  TargetingKind,
  TargetingOption,
  AccountContext,
  AccountSnapshot,
  AdPlatform,
  CampaignSnapshot,
  DateRange,
  Level,
  MetricRow,
  ObjectSnapshot,
  ReachRow,
} from "@/modules/ads/platforms/types";

/**
 * Meta SIMULÉ — tant que l'app Meta et son jeton ne sont pas fournis
 * (`ADS_META_MOCK=1`).
 *
 * Déterministe : les mêmes jours donnent les mêmes chiffres, d'un appel à
 * l'autre et d'une machine à l'autre. Une synchro rejouée réécrit donc les
 * mêmes lignes au lieu d'inventer une histoire différente à chaque passage —
 * et les tests peuvent s'y fier.
 *
 * ⚠️ Ces chiffres sont inventés. Tant que ce mode est actif, le tableau de bord
 * et les connexions du support l'affichent en bandeau.
 *
 * ⚠️ Dev et prod partagent la même base : un compte simulé connecté en local
 * existe AUSSI en production. D'où le préfixe « [SIMULÉ] » sur le compte et
 * chaque campagne — pour les reconnaître dans les listes, et les archiver
 * proprement une fois le vrai compte branché.
 */

export const MOCK_PREFIX = "[SIMULÉ]";

export const MOCK_ACCOUNT_ID = "act_000000000000";
export const MOCK_TOKEN = "jeton-simule";

const CAMPAIGNS = [
  { id: "120000000000000001", name: `${MOCK_PREFIX} Pointage BTP — formulaire instantané`, objective: "leads", status: "active", budget: 40 },
  { id: "120000000000000002", name: `${MOCK_PREFIX} Planning chantiers — trafic LP`, objective: "trafic", status: "active", budget: 25 },
  { id: "120000000000000003", name: `${MOCK_PREFIX} Notoriété — vidéo conducteurs de travaux`, objective: "notoriete", status: "en-pause", budget: 15 },
] as const;

const ADSETS_PER_CAMPAIGN = 2;
const ADS_PER_ADSET = 2;

/** Hachage FNV-1a → [0, 1[ : un pseudo-hasard stable pour une clé donnée. */
function unit(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0) / 0x100000000;
}

/** Un identifiant simulé, stable pour une clé (« 1200… » comme chez Meta). */
const mockId = (prefix: string, key: string) => `12${String(Math.floor(unit(`${prefix}:${key}`) * 1e13)).padStart(13, "0")}`;

/** Jours inclus entre deux dates AAAA-MM-JJ. */
export function daysBetween(range: DateRange): string[] {
  const out: string[] = [];
  const end = Date.parse(`${range.until}T00:00:00Z`);
  for (let t = Date.parse(`${range.since}T00:00:00Z`); t <= end; t += 86_400_000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}

/** Les chiffres d'une campagne un jour donné. Une campagne en pause ne dépense rien. */
function campaignDay(c: (typeof CAMPAIGNS)[number], day: string) {
  if (c.status !== "active") return { spend: 0, impressions: 0, clicks: 0, leads: 0 };
  const r = unit(`${c.id}:${day}`);
  const spend = Math.round(c.budget * (0.75 + 0.5 * r) * 100) / 100;
  const impressions = Math.round(spend * (90 + 60 * unit(`${c.id}:${day}:i`)));
  const clicks = Math.round(impressions * (0.008 + 0.012 * unit(`${c.id}:${day}:c`)));
  const leads = c.objective === "leads" ? Math.round(clicks * (0.05 + 0.1 * unit(`${c.id}:${day}:l`))) : 0;
  return { spend, impressions, clicks, leads };
}

/**
 * Répartit un total entier entre `n` parts, sans perte : la somme des parts
 * vaut toujours le total, pour que les niveaux ensemble et annonce retombent
 * exactement sur la campagne.
 */
function split(total: number, n: number, key: string, decimals = 0): number[] {
  const f = 10 ** decimals;
  const weights = Array.from({ length: n }, (_, i) => 0.5 + unit(`${key}:${i}`));
  const sum = weights.reduce((s, w) => s + w, 0);
  const parts = weights.map((w) => Math.floor(((total * f) * w) / sum) / f);
  const rest = Math.round((total - parts.reduce((s, p) => s + p, 0)) * f) / f;
  parts[0] = Math.round((parts[0] + rest) * f) / f;
  return parts;
}

/** Portée, clics vers le site et vues de la page, déduits des impressions et des clics d'une ligne. */
const derived = (impressions: number, clicks: number) => {
  const linkClicks = Math.round(clicks * 0.8);
  return { reach: Math.round(impressions * 0.7), linkClicks, landingViews: Math.round(linkClicks * 0.7) };
};

export function createMockMetaPlatform(): AdPlatform {
  return {
    key: "meta",
    label: "Meta",
    capabilities: ["lecture", "creation", "upload-crea", "statut", "budget"],

    // Écritures simulées : des identifiants stables (même nom → même identifiant), rien n'est gardé.
    createCampaign: async (_a: AccountContext, c: NewCampaign) => mockId("c", c.name),
    createAdSet: async (_a: AccountContext, x: NewAdSet) => mockId("s", `${x.campaignId}:${x.name}`),
    uploadImage: async (_a: AccountContext, url: string) => ({ hash: mockId("h", url) }),
    uploadVideo: async (_a: AccountContext, url: string) => ({ id: mockId("v", url) }),
    videoState: async (): Promise<VideoState> => ({ ready: true, error: null, thumbnailUrl: "https://example.test/vignette.jpg" }),
    createCreative: async (_a: AccountContext, c: NewCreative) => mockId("k", c.name),
    createAd: async (_a: AccountContext, x: { name: string; adSetId: string; creativeId: string }) => mockId("a", `${x.adSetId}:${x.creativeId}`),
    adPreview: async (_a: AccountContext, adId: string, format: string) => `<p>${MOCK_PREFIX} Aperçu de la publicité ${adId} (${format})</p>`,
    setStatus: async () => {},
    setBudget: async () => {},
    sendEvents: async (_a: AccountContext, _pixel: string, events: Record<string, unknown>[]) => ({ received: events.length }),

    async connect(): Promise<{ token: string; expiresAt: Date }> {
      return { token: MOCK_TOKEN, expiresAt: new Date(Date.now() + 60 * 86_400_000) };
    },

    async searchTargeting(_acc: AccountContext, kind: TargetingKind, query: string): Promise<TargetingOption[]> {
      const base = kind === "interet" ? 6003000000000 : kind === "metier" ? 108000000000 : 3000;
      return [0, 1, 2].map((i) => ({ id: String(base + i + Math.floor(unit(`${kind}:${query}`) * 1000) * 10), name: `${MOCK_PREFIX} ${query} ${i + 1}`, audience: 50_000 * (i + 1), path: kind === "region" ? "FR" : null }));
    },

    async checkAccess(): Promise<AccessReport> {
      return {
        scopes: ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "instagram_basic"],
        pages: [{ id: "100000000000001", name: `${MOCK_PREFIX} TIM Management`, instagram: { id: "178400000000001", username: "tim.management.simule" } }],
        instagram: [{ id: "178400000000001", username: "tim.management.simule" }],
        pixels: [{ id: "900000000000001", name: `${MOCK_PREFIX} Pixel du site` }],
        account: { ok: true, code: 1, label: "actif" },
      };
    },

    async accountState(): Promise<AccountState> {
      return { ok: true, code: 1, label: "actif" };
    },

    async listAccounts(): Promise<AccountSnapshot[]> {
      return [{ externalId: MOCK_ACCOUNT_ID, name: `${MOCK_PREFIX} TIM — compte simulé`, currency: "EUR", timezone: "Europe/Paris" }];
    },

    async listCampaigns(): Promise<CampaignSnapshot[]> {
      return CAMPAIGNS.map((c) => ({
        externalId: c.id,
        name: c.name,
        objective: c.objective,
        status: c.status,
        externalStatus: c.status === "active" ? "ACTIVE" : "PAUSED",
        dailyBudget: c.budget,
      }));
    },

    async fetchMetrics(_acc: AccountContext, range: DateRange, level: Level): Promise<MetricRow[]> {
      const rows: MetricRow[] = [];
      for (const day of daysBetween(range)) {
        for (const c of CAMPAIGNS) {
          const m = campaignDay(c, day);
          if (level === "campaign") {
            rows.push({ level, externalId: c.id, name: c.name, campaignExternalId: c.id, day, ...m, ...derived(m.impressions, m.clicks) });
            continue;
          }
          const units = level === "adset" ? ADSETS_PER_CAMPAIGN : ADSETS_PER_CAMPAIGN * ADS_PER_ADSET;
          const k = `${c.id}:${day}:${level}`;
          const [spend, impressions, clicks, leads] = [
            split(m.spend, units, `${k}:s`, 2),
            split(m.impressions, units, `${k}:i`),
            split(m.clicks, units, `${k}:c`),
            split(m.leads, units, `${k}:l`),
          ];
          for (let i = 0; i < units; i++) {
            const id = `${c.id}${level === "adset" ? "-e" : "-a"}${i + 1}`;
            const label = level === "adset" ? `Ensemble ${i + 1}` : `Annonce ${i + 1}`;
            rows.push({ level, externalId: id, name: `${c.name} · ${label}`, campaignExternalId: c.id, day, spend: spend[i], impressions: impressions[i], clicks: clicks[i], leads: leads[i], ...derived(impressions[i], clicks[i]) });
          }
        }
      }
      return rows;
    },

    async listObjects(): Promise<ObjectSnapshot[]> {
      const out: ObjectSnapshot[] = [];
      for (const c of CAMPAIGNS) {
        const status = c.status === "active" ? "ACTIVE" : "PAUSED";
        for (let i = 0; i < ADSETS_PER_CAMPAIGN; i++) {
          out.push({ level: "adset", externalId: `${c.id}-e${i + 1}`, name: `${c.name} · Ensemble ${i + 1}`, campaignExternalId: c.id, adsetExternalId: null, status, effectiveStatus: status, dailyBudget: c.budget / ADSETS_PER_CAMPAIGN, issues: [] });
        }
        for (let i = 0; i < ADSETS_PER_CAMPAIGN * ADS_PER_ADSET; i++) {
          out.push({ level: "ad", externalId: `${c.id}-a${i + 1}`, name: `${c.name} · Annonce ${i + 1}`, campaignExternalId: c.id, adsetExternalId: `${c.id}-e${Math.floor(i / ADS_PER_ADSET) + 1}`, status, effectiveStatus: status, dailyBudget: null, issues: [] });
        }
      }
      return out;
    },

    async fetchReach(acc: AccountContext, range: DateRange, level: Level): Promise<ReachRow[]> {
      const days = daysBetween(range).length;
      const totals = new Map<string, number>();
      for (const r of await this.fetchMetrics(acc, range, level)) totals.set(r.externalId, (totals.get(r.externalId) ?? 0) + r.impressions);
      // Une répétition qui monte avec la durée : ~1,1 par jour de diffusion, plafonnée à 4.
      const frequency = Math.min(4, 1 + days * 0.1);
      return [...totals].map(([externalId, impressions]) => ({ level, externalId, reach: Math.round(impressions / frequency), frequency: Math.round(frequency * 100) / 100 }));
    },
  };
}
