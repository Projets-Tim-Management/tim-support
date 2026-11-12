import type { Payload } from "payload";

import { channelSpend } from "@/modules/analytics/lib/acquisition";
import { loadExpenses } from "@/modules/analytics/lib/expenses-load";
import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { platformLabel } from "@/modules/ads/lib/platforms";

/**
 * La FICHE DES CANAUX — ce que Yanis (mesure & data) tient et ce que Margaux
 * lit pour recommander à la direction où déplacer le budget (étape 3 de
 * l'organisation SEA, 12/11/2026).
 *
 * Pour chaque canal (Meta, Google Ads, ChatGPT Ads, et le SEO gratuit en point
 * de comparaison), sur une fenêtre et sur la précédente :
 *  - la dépense (relevés Pennylane par poste ; pour Meta, l'API Meta) — le même
 *    calcul que « Analyses → Acquisition » (`channelSpend`) ;
 *  - les leads (formulaires du site, par canal) ;
 *  - les leads QUALIFIÉS : l'opportunité née du lead a atteint « Démo
 *    programmée » ou une étape plus avancée — même perdue ensuite (lu dans le
 *    journal des étapes de l'opportunité, et dans son statut actuel) ;
 *  - les clients signés ;
 *  - le coût de chacun.
 *
 * Le juge d'un canal, c'est le coût par lead qualifié (décision de la direction
 * du 12/11/2026), pas le clic.
 *
 * `buildScorecard` est pur (testé) ; `loadScorecard` lit la base et Pennylane.
 */

type Raw = Record<string, unknown>;
type Id = number | string;
const idOf = (v: unknown): Id | null => (v && typeof v === "object" ? ((v as { id?: Id }).id ?? null) : ((v as Id | null) ?? null));
const r2 = (n: number) => Math.round(n * 100) / 100;

/** Les étapes qui valent « lead qualifié » : la démo, et tout ce qui la suit. */
export const QUALIFIED_STATUSES = ["demo-programmee", "attente-engagement", "en-test", "en-signature", "actif", "resilie"] as const;
/** Les étapes qui valent « client signé » (comme « Analyses → Acquisition »). */
const WON = new Set(["actif", "resilie", "archive"]);
const QUALIFIED = new Set<string>(QUALIFIED_STATUSES);
const QUALIFIED_LABELS = new Set(QUALIFIED_STATUSES.map((s) => clientStatusMeta(s)?.label ?? s));

/** Les canaux de la fiche, et les canaux de formulaire qu'ils regroupent. */
export const SCORE_CHANNELS = [
  { key: "meta", label: "Meta Ads", paid: true, channels: ["meta-facebook", "meta-instagram"], owner: "sea-meta" },
  { key: "google", label: "Google Ads", paid: true, channels: ["sea"], owner: "sea-google" },
  { key: "chatgpt", label: "ChatGPT Ads", paid: true, channels: ["chatgpt"], owner: "sea-chatgpt" },
  { key: "seo", label: "SEO (gratuit)", paid: false, channels: ["seo"], owner: null },
] as const;
export type ScoreChannelKey = (typeof SCORE_CHANNELS)[number]["key"];

/** « Étape : Nouvelle → Démo programmée » : l'opportunité a-t-elle atteint une étape qualifiée ? */
export const reachedQualified = (journalTitle: string): boolean => {
  const m = /^Étape : .* → (.+)$/.exec(journalTitle.trim());
  return Boolean(m && QUALIFIED_LABELS.has(m[1].trim()));
};

export type Figures = {
  spend: number;
  leads: number;
  qualified: number;
  won: number;
  costPerLead: number | null;
  costPerQualified: number | null;
  costPerWon: number | null;
  /** Leads qualifiés / leads, en %. */
  qualifiedRate: number | null;
};

export type ScoreRow = { key: ScoreChannelKey; label: string; paid: boolean; owner: string | null; now: Figures; before: Figures; /** Évolution du coût par lead qualifié, en % (négatif = mieux). */ cpqTrend: number | null };

export type CampaignBudget = { id: Id; name: string; platform: string; status: string; dailyEur: number | null };

export type Scorecard = {
  window: { months: number; from: string; previousFrom: string };
  rows: ScoreRow[];
  /** Le canal payant au lead qualifié le moins cher, s'il y en a un mesurable. */
  best: ScoreChannelKey | null;
  /** Les phrases que la direction lit d'abord (et Margaux aussi). */
  headlines: string[];
  budgets: CampaignBudget[];
  /** Ce qui limite la lecture (journal récent, dépenses absentes…). */
  caveats: string[];
};

const figures = (spend: number, leads: number, qualified: number, won: number): Figures => ({
  spend: r2(spend),
  leads,
  qualified,
  won,
  costPerLead: leads && spend ? r2(spend / leads) : null,
  costPerQualified: qualified && spend ? r2(spend / qualified) : null,
  costPerWon: won && spend ? r2(spend / won) : null,
  qualifiedRate: leads ? Math.round((qualified / leads) * 1000) / 10 : null,
});

const eur = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 0 })} €`;

export function buildScorecard(input: {
  /** Formulaires : id, canal, date. */
  leads: Raw[];
  /** Opportunités nées d'un formulaire : formSubmission, clientStatus. */
  clients: Raw[];
  /** Journal des étapes : client, title. */
  journal: Raw[];
  /** Dépense par canal de formulaire, fenêtre courante et précédente. */
  spendNow: Record<string, number>;
  spendBefore: Record<string, number>;
  budgets: CampaignBudget[];
  months: number;
  now: Date;
  caveats?: string[];
}): Scorecard {
  const from = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() - input.months + 1, 1);
  const previousFrom = Date.UTC(input.now.getUTCFullYear(), input.now.getUTCMonth() - 2 * input.months + 1, 1);

  // Qualifié : statut actuel qualifié, ou une étape qualifiée dans son journal.
  const reached = new Set<string>();
  for (const j of input.journal) if (reachedQualified(String(j.title ?? ""))) reached.add(String(idOf(j.client)));
  const clientOf = new Map<string, { qualified: boolean; won: boolean }>();
  for (const c of input.clients) {
    const sub = idOf(c.formSubmission);
    if (sub == null) continue;
    const status = String(c.clientStatus ?? "");
    clientOf.set(String(sub), { qualified: QUALIFIED.has(status) || reached.has(String(c.id)), won: WON.has(status) });
  }

  const count = (channels: readonly string[], since: number, until: number) => {
    let leads = 0;
    let qualified = 0;
    let won = 0;
    for (const l of input.leads) {
      const t = Date.parse(String(l.createdAt ?? ""));
      if (!(t >= since && t < until) || !channels.includes(String(l.channel ?? ""))) continue;
      leads += 1;
      const c = clientOf.get(String(l.id));
      if (c?.qualified) qualified += 1;
      if (c?.won) won += 1;
    }
    return { leads, qualified, won };
  };
  const sum = (spend: Record<string, number>, channels: readonly string[]) => channels.reduce((s, ch) => s + (spend[ch] ?? 0), 0);

  const rows: ScoreRow[] = SCORE_CHANNELS.map((c) => {
    const a = count(c.channels, from, Number.POSITIVE_INFINITY);
    const b = count(c.channels, previousFrom, from);
    const now = figures(sum(input.spendNow, c.channels), a.leads, a.qualified, a.won);
    const before = figures(sum(input.spendBefore, c.channels), b.leads, b.qualified, b.won);
    const cpqTrend = now.costPerQualified != null && before.costPerQualified ? Math.round(((now.costPerQualified - before.costPerQualified) / before.costPerQualified) * 1000) / 10 : null;
    return { key: c.key, label: c.label, paid: c.paid, owner: c.owner, now, before, cpqTrend };
  });

  const paid = rows.filter((r) => r.paid && r.now.costPerQualified != null).sort((x, y) => x.now.costPerQualified! - y.now.costPerQualified!);
  const best = paid[0]?.key ?? null;
  const headlines: string[] = [];
  if (paid.length) {
    headlines.push(`Le lead qualifié le moins cher vient de ${paid[0].label} : ${eur(paid[0].now.costPerQualified!)}.`);
    for (const r of paid.slice(1)) headlines.push(`${r.label} coûte ${(r.now.costPerQualified! / paid[0].now.costPerQualified!).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} fois plus par lead qualifié (${eur(r.now.costPerQualified!)}).`);
  }
  for (const r of rows.filter((x) => x.paid && x.now.spend > 0 && x.now.qualified === 0)) {
    headlines.push(`${r.label} : ${eur(r.now.spend)} dépensés et aucun lead qualifié sur la période.`);
  }
  const seo = rows.find((r) => r.key === "seo");
  if (seo && seo.now.qualified) headlines.push(`Le SEO apporte ${seo.now.qualified} lead${seo.now.qualified > 1 ? "s" : ""} qualifié${seo.now.qualified > 1 ? "s" : ""} sans dépense publicitaire.`);

  return {
    window: { months: input.months, from: new Date(from).toISOString().slice(0, 10), previousFrom: new Date(previousFrom).toISOString().slice(0, 10) },
    rows,
    best,
    headlines,
    budgets: input.budgets,
    caveats: input.caveats ?? [],
  };
}

/** La fiche, lue en base et chez Pennylane. 3 mois par défaut : assez de leads pour juger. */
export async function loadScorecard(payload: Payload, months = 3, now = new Date()): Promise<Scorecard> {
  const common = { pagination: false, depth: 0, overrideAccess: true } as const;
  const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2 * months + 1, 1)).toISOString();
  const [leads, clients, journal, campaigns, meta, exp] = await Promise.all([
    payload.find({ collection: "form-submissions", where: { createdAt: { greater_than_equal: since } }, ...common, select: { channel: true, createdAt: true } as never }),
    payload.find({ collection: "partner-clients", where: { formSubmission: { exists: true } }, ...common, draft: true, select: { formSubmission: true, clientStatus: true } as never }),
    payload.find({ collection: "client-activities", where: { and: [{ type: { equals: "systeme" } }, { title: { like: "Étape :" } }] }, ...common, select: { client: true, title: true } as never }),
    payload.find({ collection: "ad-campaigns", ...common, select: { name: true, platform: true, status: true, agentBudget: true } as never }),
    payload.find({ collection: "ad-metrics-daily", where: { and: [{ platform: { equals: "meta" } }, { level: { equals: "campaign" } }, { day: { greater_than_equal: since.slice(0, 10) } }] }, ...common, select: { day: true, spend: true } as never }),
    loadExpenses().catch(() => ({ expenses: [], note: "Dépenses Pennylane illisibles." })),
  ]);
  const metaByMonth: Record<string, number> = {};
  for (const r of meta.docs as unknown as { day: string; spend?: number | null }[]) metaByMonth[r.day.slice(0, 7)] = (metaByMonth[r.day.slice(0, 7)] ?? 0) + (r.spend ?? 0);
  const leadsByChannel: Record<string, number> = {};
  for (const d of leads.docs as unknown as Raw[]) leadsByChannel[String(d.channel ?? "")] = (leadsByChannel[String(d.channel ?? "")] ?? 0) + 1;
  const before = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months, 15));
  const spendNow = channelSpend(exp.expenses, metaByMonth, leadsByChannel, months, now);
  const spendBefore = channelSpend(exp.expenses, metaByMonth, leadsByChannel, months, before);
  const caveats = [
    "Le journal des étapes ne couvre que les opportunités suivies depuis sa mise en place : pour les plus anciennes, seul le statut actuel compte.",
    ...(exp.note ? [exp.note] : []),
  ];
  const budgets: CampaignBudget[] = (campaigns.docs as unknown as Raw[]).map((c) => ({
    id: c.id as Id,
    name: String(c.name ?? "Sans nom"),
    platform: platformLabel(c.platform as string),
    status: String(c.status ?? ""),
    dailyEur: typeof (c.agentBudget as { totalDailyEur?: unknown } | undefined)?.totalDailyEur === "number" ? ((c.agentBudget as { totalDailyEur: number }).totalDailyEur) : null,
  }));
  return buildScorecard({
    leads: leads.docs as unknown as Raw[],
    clients: clients.docs as unknown as Raw[],
    journal: journal.docs as unknown as Raw[],
    spendNow,
    spendBefore,
    budgets,
    months,
    now,
    caveats,
  });
}
