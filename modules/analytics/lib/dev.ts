import { average, countByMonth, daysBetween, median, periodBounds, periodDelta, tally, type Delta } from "@/modules/analytics/lib/growth";
import { DEV_PRIORITIES, DEV_TYPES } from "@/modules/dev/lib/devMeta";
import { DEV_PHASES, type DevPhaseValue } from "@/modules/dev/lib/devStatus";
import { round2 } from "@/modules/partner/lib/format";

/**
 * Analyse des développements : ce qui entre, ce qui sort, en combien de temps,
 * et pour qui. Le code raisonne par PHASE (entrée, étude, réalisation,
 * livraison, hors flux), jamais par statut nommé. Pur, testé.
 */

export type DevRow = {
  id: number | string;
  title?: string | null;
  type?: string | null;
  priority?: string | null;
  status?: number | string | { id: number | string } | null;
  createdAt?: string | null;
  startedAt?: string | null;
  deliveredAt?: string | null;
  announcedAt?: string | null;
  demandCount?: number | null;
  opportunities?: (number | string | { id: number | string })[] | null;
};

export type DevStatusRow = { id: number | string; name?: string | null; phase?: string | null };
export type ClientName = { id: number | string; companyName?: string | null };

export type Count = { key: string; label: string; count: number };

export type DevAnalytics = {
  kpis: {
    created: Delta;
    delivered: Delta;
    inFlow: number;
    avgLeadTimeDays: number | null;
    medianLeadTimeDays: number | null;
    avgBuildDays: number | null;
    announcedShare: number | null;
  };
  monthly: { month: string; created: number; delivered: number }[];
  byPhase: Count[];
  byStatus: Count[];
  byType: Count[];
  byPriority: Count[];
  byClient: { key: string; client: string; count: number; delivered: number }[];
};

const TYPE_LABELS: Record<string, string> = Object.fromEntries(DEV_TYPES.map((t) => [t.value, t.label]));
const PRIORITY_LABELS: Record<string, string> = Object.fromEntries(DEV_PRIORITIES.map((p) => [p.value, p.label]));
const relId = (v: DevRow["status"]): string | null => (v == null ? null : typeof v === "object" ? String(v.id) : String(v));

export function buildDevAnalytics(devs: DevRow[], statuses: DevStatusRow[], clients: ClientName[], months: number, now: Date): DevAnalytics {
  const { from } = periodBounds(months, now);
  const statusById = new Map(statuses.map((s) => [String(s.id), s]));
  const clientName = new Map(clients.map((c) => [String(c.id), c.companyName ?? `Client #${c.id}`]));
  const phaseOf = (d: DevRow): DevPhaseValue | "" => (statusById.get(relId(d.status) ?? "")?.phase as DevPhaseValue) ?? "";

  const inPeriod = devs.filter((d) => d.createdAt && Date.parse(d.createdAt) >= from);
  const deliveredInPeriod = devs.filter((d) => d.deliveredAt && Date.parse(d.deliveredAt) >= from);
  const leadTimes = deliveredInPeriod.filter((d) => d.createdAt).map((d) => daysBetween(d.createdAt!, d.deliveredAt!));
  const buildTimes = deliveredInPeriod.filter((d) => d.startedAt).map((d) => daysBetween(d.startedAt!, d.deliveredAt!));
  const inFlow = devs.filter((d) => ["entree", "etude", "realisation"].includes(phaseOf(d)));

  const byClientMap = new Map<string, { count: number; delivered: number }>();
  for (const d of inPeriod) {
    for (const o of d.opportunities ?? []) {
      const k = relId(o as DevRow["status"]);
      if (!k) continue;
      const a = byClientMap.get(k) ?? { count: 0, delivered: 0 };
      a.count += 1;
      if (d.deliveredAt) a.delivered += 1;
      byClientMap.set(k, a);
    }
  }

  const created = countByMonth(devs, (d) => d.createdAt, months, now);
  const delivered = countByMonth(devs, (d) => d.deliveredAt, months, now);

  return {
    kpis: {
      created: periodDelta(devs, (d) => d.createdAt, months, now),
      delivered: periodDelta(devs, (d) => d.deliveredAt, months, now),
      inFlow: inFlow.length,
      avgLeadTimeDays: average(leadTimes),
      medianLeadTimeDays: median(leadTimes),
      avgBuildDays: average(buildTimes),
      announcedShare: deliveredInPeriod.length ? round2((deliveredInPeriod.filter((d) => d.announcedAt).length / deliveredInPeriod.length) * 100) : null,
    },
    monthly: created.map((p, i) => ({ month: p.month, created: p.count, delivered: delivered[i].count })),
    byPhase: DEV_PHASES.map((p) => ({ key: p.value, label: p.label, count: devs.filter((d) => phaseOf(d) === p.value).length })),
    byStatus: tally(devs, (d) => relId(d.status), (k) => statusById.get(k)?.name ?? "Sans statut"),
    byType: tally(inPeriod, (d) => d.type, (k) => TYPE_LABELS[k] ?? (k ? k : "Non renseigné")),
    byPriority: tally(inPeriod, (d) => d.priority, (k) => PRIORITY_LABELS[k] ?? (k ? k : "Non renseignée")),
    byClient: [...byClientMap.entries()]
      .map(([key, a]) => ({ key, client: clientName.get(key) ?? `Client #${key}`, ...a }))
      .sort((a, b) => b.count - a.count),
  };
}
