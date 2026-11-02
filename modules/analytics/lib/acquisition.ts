import { countByMonth, delta, periodBounds, type Delta } from "@/modules/analytics/lib/growth";
import type { Expense } from "@/modules/analytics/lib/expenses";
import { CHANNELS, channelLabel as registryLabel } from "@/core/lib/channels";
import { round2 } from "@/modules/partner/lib/format";

/**
 * Ce que l'écran Acquisition ajoute aux répartitions de `forms/lib/stats` :
 * la tendance mois par mois par canal, la conversion de chaque canal jusqu'à
 * l'affaire gagnée — pas seulement le volume — et ce que chaque canal COÛTE :
 * les dépenses de la période imputées au canal, rapportées aux leads et aux
 * affaires gagnées.
 */

export type LeadRow = { id: number | string; channel?: string | null; createdAt?: string | null };
export type LeadClientRow = {
  formSubmission?: number | string | { id: number | string } | null;
  clientStatus?: string | null;
};

export type ChannelStat = {
  key: string;
  label: string;
  leads: number;
  /** Fiches nées d'un lead de ce canal. */
  opportunities: number;
  won: number;
  lost: number;
  /** Gagnées / leads, en %. */
  conversion: number | null;
  /** Dépense de la période imputée au canal (null : canal sans coût suivi, ex. saisie). */
  spend: number | null;
  costPerLead: number | null;
  costPerWon: number | null;
};

/** Le poste de dépenses de chaque canal (Meta : ses deux supports se partagent un poste). */
export const CHANNEL_POSTES: Record<string, string> = {
  seo: "SEO",
  sea: "Google Ads",
  chatgpt: "ChatGPT Ads",
  "meta-facebook": "Meta Ads",
  "meta-instagram": "Meta Ads",
};

/** La dépense de chaque canal sur un ensemble de mois (« AAAA-MM »). */
function spendOver(expenses: Expense[], metaSpendByMonth: Record<string, number>, leadsByChannel: Record<string, number>, keys: Set<string>): Record<string, number> {
  const byPoste: Record<string, number> = {};
  for (const e of expenses) if (e.kind === "depense" && keys.has(e.month)) byPoste[e.poste] = (byPoste[e.poste] ?? 0) + e.amount;
  const metaApi = Object.entries(metaSpendByMonth).filter(([k]) => keys.has(k)).reduce((s, [, v]) => s + v, 0);
  const meta = metaApi > 0 ? metaApi : (byPoste["Meta Ads"] ?? 0);
  const metaKeys = Object.keys(CHANNEL_POSTES).filter((k) => CHANNEL_POSTES[k] === "Meta Ads");
  const metaLeads = metaKeys.reduce((s, k) => s + (leadsByChannel[k] ?? 0), 0);
  const out: Record<string, number> = {};
  for (const [channel, poste] of Object.entries(CHANNEL_POSTES)) {
    out[channel] =
      poste === "Meta Ads"
        ? round2(metaLeads ? (meta * (leadsByChannel[channel] ?? 0)) / metaLeads : channel === metaKeys[0] ? meta : 0)
        : round2(byPoste[poste] ?? 0);
  }
  return out;
}

/** Les mois « AAAA-MM » de la période, à partir du premier où les leads sont suivis. */
export function trackedMonths(months: number, now: Date, trackedFrom?: string | null): string[] {
  const { from } = periodBounds(months, now);
  const out: string[] = [];
  for (let i = 0; i < months; i++) {
    const k = new Date(Date.UTC(new Date(from).getUTCFullYear(), new Date(from).getUTCMonth() + i, 1)).toISOString().slice(0, 7);
    if (!trackedFrom || k >= trackedFrom) out.push(k);
  }
  return out;
}

/**
 * La dépense de chaque canal sur la période : les sorties bancaires de son
 * poste. Pour Meta, la dépense relevée par l'API Meta quand on l'a (la banque
 * ne la voit pas, ou en retard), répartie entre Facebook et Instagram au
 * prorata de leurs leads.
 *
 * Seulement à partir du mois où les leads sont suivis (`trackedFrom`) : avant,
 * l'argent dépensé n'a pas de leads en face, et le coût par lead serait faux.
 * Pur.
 */
export function channelSpend(
  expenses: Expense[],
  metaSpendByMonth: Record<string, number>,
  leadsByChannel: Record<string, number>,
  months: number,
  now: Date,
  /** Premier mois (« AAAA-MM ») où le support enregistre les leads. */
  trackedFrom?: string | null,
): Record<string, number> {
  return spendOver(expenses, metaSpendByMonth, leadsByChannel, new Set(trackedMonths(months, now, trackedFrom)));
}

/** `leads`, `opportunities`, `won` : null avant le suivi des leads (le mois a une dépense, pas de leads comptés). */
export type CostFigures = { spend: number; leads: number | null; costPerLead: number | null; opportunities: number | null; won: number | null; costPerWon: number | null };

export type MonthCost = CostFigures & {
  /** « AAAA-MM ». */
  month: string;
  byChannel: Record<string, CostFigures>;
};

const figures = (spend: number, leads: number, opportunities: number, won: number, tracked = true): CostFigures =>
  tracked
    ? { spend: round2(spend), leads, costPerLead: leads ? round2(spend / leads) : null, opportunities, won, costPerWon: won ? round2(spend / won) : null }
    : { spend: round2(spend), leads: null, costPerLead: null, opportunities: null, won: null, costPerWon: null };

/**
 * Mois par mois : ce qui a été dépensé, les leads reçus, et le devenir des
 * fiches nées de CES leads (une cohorte : les affaires gagnées d'octobre sont
 * celles des leads d'octobre, même signées en décembre). Au total et par canal.
 * Avant `trackedFrom`, le mois garde sa dépense mais ses leads sont inconnus
 * (null), jamais zéro : un coût par lead n'y aurait pas de sens.
 */
export function monthlyCosts(
  leads: LeadRow[],
  clients: LeadClientRow[],
  expenses: Expense[],
  metaSpendByMonth: Record<string, number>,
  keys: string[],
  trackedFrom?: string | null,
): MonthCost[] {
  const monthOf = new Map(leads.map((l) => [String(l.id), l.createdAt?.slice(0, 7) ?? ""]));
  const channelOf = new Map(leads.map((l) => [String(l.id), l.channel ?? ""]));
  return keys.map((month) => {
    const ofMonth = leads.filter((l) => l.createdAt?.slice(0, 7) === month);
    const leadsBy: Record<string, number> = {};
    for (const l of ofMonth) leadsBy[l.channel ?? ""] = (leadsBy[l.channel ?? ""] ?? 0) + 1;
    const opp: Record<string, number> = {};
    const won: Record<string, number> = {};
    for (const c of clients) {
      const sid = relId(c.formSubmission);
      if (!sid || monthOf.get(sid) !== month) continue;
      const ch = channelOf.get(sid) ?? "";
      opp[ch] = (opp[ch] ?? 0) + 1;
      if (c.clientStatus === "actif" || c.clientStatus === "resilie" || c.clientStatus === "archive") won[ch] = (won[ch] ?? 0) + 1;
    }
    const spend = spendOver(expenses, metaSpendByMonth, leadsBy, new Set([month]));
    const channels = [...new Set([...Object.keys(spend), ...Object.keys(leadsBy)])];
    const tracked = !trackedFrom || month >= trackedFrom;
    const byChannel = Object.fromEntries(channels.map((ch) => [ch, figures(spend[ch] ?? 0, leadsBy[ch] ?? 0, opp[ch] ?? 0, won[ch] ?? 0, tracked)]));
    const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
    return { month, ...figures(sum(spend), ofMonth.length, sum(opp), sum(won), tracked), byChannel };
  });
}

export type AcquisitionAnalytics = {
  kpis: {
    leads: Delta;
    won: number;
    conversion: number | null;
    /** Toute la dépense d'acquisition imputée, et ce qu'elle coûte par lead et par affaire gagnée. */
    spend: number | null;
    costPerLead: number | null;
    costPerWon: number | null;
  };
  monthly: ({ month: string } & Record<string, number | string>)[];
  channels: ChannelStat[];
  channelKeys: { key: string; label: string }[];
};

const channelLabel = (k: string) => registryLabel(k) ?? (k ? k : "Canal inconnu");
const relId = (v: LeadClientRow["formSubmission"]): string | null =>
  v == null ? null : typeof v === "object" ? String(v.id) : String(v);

export function buildAcquisitionAnalytics(
  leads: LeadRow[],
  clients: LeadClientRow[],
  months: number,
  now: Date,
  /** Dépense par canal sur la période (voir channelSpend) ; absente, l'écran ne parle pas de coûts. */
  spendByChannel?: Record<string, number>,
): AcquisitionAnalytics {
  const { from } = periodBounds(months, now);
  const inPeriod = leads.filter((l) => l.createdAt && Date.parse(l.createdAt) >= from);

  const channelOf = new Map(leads.map((l) => [String(l.id), l.channel ?? ""]));
  const keys = [...new Set([...CHANNELS.map((c) => c.value as string), ...inPeriod.map((l) => l.channel ?? "")])];
  const channelKeys = keys.map((key) => ({ key, label: channelLabel(key) }));

  // Par canal : leads de la période, et le devenir des fiches nées de ces leads.
  const stats = new Map<string, ChannelStat>(
    keys.map((key) => [key, { key, label: channelLabel(key), leads: 0, opportunities: 0, won: 0, lost: 0, conversion: null, spend: null, costPerLead: null, costPerWon: null }]),
  );
  for (const l of inPeriod) stats.get(l.channel ?? "")!.leads += 1;
  const periodIds = new Set(inPeriod.map((l) => String(l.id)));
  for (const c of clients) {
    const sid = relId(c.formSubmission);
    if (!sid || !periodIds.has(sid)) continue;
    const s = stats.get(channelOf.get(sid) ?? "");
    if (!s) continue;
    s.opportunities += 1;
    if (c.clientStatus === "actif" || c.clientStatus === "resilie" || c.clientStatus === "archive") s.won += 1;
    else if (c.clientStatus === "perdue") s.lost += 1;
  }
  const channels = [...stats.values()]
    .map((s) => {
      const spend = spendByChannel && s.key in spendByChannel ? spendByChannel[s.key] : null;
      return {
        ...s,
        conversion: s.leads ? round2((s.won / s.leads) * 100) : null,
        spend,
        costPerLead: spend != null && s.leads ? round2(spend / s.leads) : null,
        costPerWon: spend != null && s.won ? round2(spend / s.won) : null,
      };
    })
    // Un canal qui coûte sans rien rapporter doit se voir : il reste dans la liste.
    .filter((s) => s.leads > 0 || (s.spend ?? 0) > 0)
    .sort((a, b) => b.leads - a.leads || (b.spend ?? 0) - (a.spend ?? 0));

  // Mois par mois, une colonne par canal (série continue).
  const series = keys.map((key) => countByMonth(leads.filter((l) => (l.channel ?? "") === key), (l) => l.createdAt, months, now));
  const monthly = series[0].map((p, i) => {
    const row: { month: string } & Record<string, number | string> = { month: p.month };
    keys.forEach((key, k) => {
      row[key] = series[k][i].count;
    });
    return row;
  });

  const won = channels.reduce((s, c) => s + c.won, 0);
  const spend = spendByChannel ? round2(channels.reduce((s, c) => s + (c.spend ?? 0), 0)) : null;
  return {
    kpis: {
      leads: periodDeltaLeads(leads, months, now),
      won,
      conversion: inPeriod.length ? round2((won / inPeriod.length) * 100) : null,
      spend,
      costPerLead: spend != null && inPeriod.length ? round2(spend / inPeriod.length) : null,
      costPerWon: spend != null && won ? round2(spend / won) : null,
    },
    monthly,
    channels,
    channelKeys: channelKeys.filter((c) => channels.some((s) => s.key === c.key)),
  };
}

function periodDeltaLeads(leads: LeadRow[], months: number, now: Date): Delta {
  const { from, prevFrom } = periodBounds(months, now);
  let cur = 0;
  let prev = 0;
  for (const l of leads) {
    if (!l.createdAt) continue;
    const t = Date.parse(l.createdAt);
    if (t >= from) cur += 1;
    else if (t >= prevFrom) prev += 1;
  }
  return delta(cur, prev);
}
