import { countByMonth, delta, periodBounds, type Delta } from "@/modules/analytics/lib/growth";
import { CHANNELS } from "@/modules/forms/lib/form-schema";
import { round2 } from "@/modules/partner/lib/format";

/**
 * Ce que l'écran Acquisition ajoute aux répartitions de `forms/lib/stats` :
 * la tendance mois par mois par canal, et la conversion de chaque canal
 * jusqu'à l'affaire gagnée — pas seulement le volume.
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
};

export type AcquisitionAnalytics = {
  kpis: { leads: Delta; won: number; conversion: number | null };
  monthly: ({ month: string } & Record<string, number | string>)[];
  channels: ChannelStat[];
  channelKeys: { key: string; label: string }[];
};

const channelLabel = (k: string) => CHANNELS.find((c) => c.value === k)?.label ?? (k ? k : "Canal inconnu");
const relId = (v: LeadClientRow["formSubmission"]): string | null =>
  v == null ? null : typeof v === "object" ? String(v.id) : String(v);

export function buildAcquisitionAnalytics(leads: LeadRow[], clients: LeadClientRow[], months: number, now: Date): AcquisitionAnalytics {
  const { from } = periodBounds(months, now);
  const inPeriod = leads.filter((l) => l.createdAt && Date.parse(l.createdAt) >= from);

  const channelOf = new Map(leads.map((l) => [String(l.id), l.channel ?? ""]));
  const keys = [...new Set([...CHANNELS.map((c) => c.value as string), ...inPeriod.map((l) => l.channel ?? "")])];
  const channelKeys = keys.map((key) => ({ key, label: channelLabel(key) }));

  // Par canal : leads de la période, et le devenir des fiches nées de ces leads.
  const stats = new Map<string, ChannelStat>(keys.map((key) => [key, { key, label: channelLabel(key), leads: 0, opportunities: 0, won: 0, lost: 0, conversion: null }]));
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
    .map((s) => ({ ...s, conversion: s.leads ? round2((s.won / s.leads) * 100) : null }))
    .filter((s) => s.leads > 0)
    .sort((a, b) => b.leads - a.leads);

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
  return {
    kpis: {
      leads: periodDeltaLeads(leads, months, now),
      won,
      conversion: inPeriod.length ? round2((won / inPeriod.length) * 100) : null,
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
