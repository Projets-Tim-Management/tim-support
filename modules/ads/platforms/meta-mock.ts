import type {
  AccountContext,
  AccountSnapshot,
  AdPlatform,
  CampaignSnapshot,
  DateRange,
  Level,
  MetricRow,
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
 */

export const MOCK_ACCOUNT_ID = "act_000000000000";
export const MOCK_TOKEN = "jeton-simule";

const CAMPAIGNS = [
  { id: "120000000000000001", name: "Pointage BTP — formulaire instantané", objective: "leads", status: "active", budget: 40 },
  { id: "120000000000000002", name: "Planning chantiers — trafic LP", objective: "trafic", status: "active", budget: 25 },
  { id: "120000000000000003", name: "Notoriété — vidéo conducteurs de travaux", objective: "notoriete", status: "en-pause", budget: 15 },
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

export function createMockMetaPlatform(): AdPlatform {
  return {
    key: "meta",
    label: "Meta",
    capabilities: ["lecture"],

    async connect(): Promise<{ token: string; expiresAt: Date }> {
      return { token: MOCK_TOKEN, expiresAt: new Date(Date.now() + 60 * 86_400_000) };
    },

    async listAccounts(): Promise<AccountSnapshot[]> {
      return [{ externalId: MOCK_ACCOUNT_ID, name: "TIM — compte simulé", currency: "EUR", timezone: "Europe/Paris" }];
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
            rows.push({ level, externalId: c.id, name: c.name, campaignExternalId: c.id, day, ...m });
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
            rows.push({ level, externalId: id, name: `${c.name} · ${label}`, campaignExternalId: c.id, day, spend: spend[i], impressions: impressions[i], clicks: clicks[i], leads: leads[i] });
          }
        }
      }
      return rows;
    },
  };
}
