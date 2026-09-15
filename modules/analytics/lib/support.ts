import { average, countByMonth, daysBetween, median, periodBounds, periodDelta, tally, type Delta } from "@/modules/analytics/lib/growth";
import { round2 } from "@/modules/partner/lib/format";

/**
 * Analyse du support : combien de tickets, d'où, sur quoi, résolus en combien
 * de temps — et ceux qui traînent. Pur, testé.
 */

export type TicketRow = {
  id: number | string;
  number?: number | null;
  subject?: string | null;
  status?: string | null;
  priority?: string | null;
  type?: string | null;
  service?: string | null;
  company?: string | null;
  client?: number | string | { id: number | string } | null;
  createdAt?: string | null;
  resolvedAt?: string | null;
  needsAttention?: boolean | null;
};

export type ClientName = { id: number | string; companyName?: string | null };

export const STATUS_LABELS: Record<string, string> = {
  new: "Nouveau",
  acknowledged: "Pris en compte",
  in_progress: "En cours",
  on_hold: "En attente",
  resolved: "Résolu",
};
export const PRIORITY_LABELS: Record<string, string> = { urgent: "Urgente", high: "Haute", normal: "Normale", low: "Basse" };
export const TYPE_LABELS: Record<string, string> = { assistance: "Assistance", suggestion: "Suggestion", autre: "Autre" };
export const SERVICE_LABELS: Record<string, string> = { technique: "Technique", facturation: "Facturation", support: "Support", commercial: "Commercial", autre: "Autre" };

const OPEN = new Set(["new", "acknowledged", "in_progress", "on_hold"]);
const label = (dict: Record<string, string>) => (k: string) => dict[k] ?? (k ? k : "Non renseigné");

export type Count = { key: string; label: string; count: number };

export type OpenTicketRow = {
  id: number | string;
  number: number | null;
  subject: string;
  company: string | null;
  status: string;
  priority: string;
  ageDays: number;
  needsAttention: boolean;
};

export type ClientTicketRow = { key: string; client: string; total: number; open: number; avgResolutionDays: number | null };

export type SupportAnalytics = {
  kpis: {
    created: Delta;
    resolved: Delta;
    openNow: number;
    urgentOpen: number;
    avgResolutionDays: number | null;
    medianResolutionDays: number | null;
    /** Part des tickets de la période résolus en moins de 2 jours. */
    under48h: number | null;
  };
  monthly: { month: string; created: number; resolved: number }[];
  byStatus: Count[];
  byPriority: Count[];
  byType: Count[];
  byService: Count[];
  resolutionByPriority: { key: string; label: string; count: number; avgDays: number | null }[];
  byClient: ClientTicketRow[];
  open: OpenTicketRow[];
};

const relId = (v: TicketRow["client"]): string | null => (v == null ? null : typeof v === "object" ? String(v.id) : String(v));

export function buildSupportAnalytics(tickets: TicketRow[], clients: ClientName[], months: number, now: Date): SupportAnalytics {
  const { from } = periodBounds(months, now);
  const nowMs = now.getTime();
  const clientName = new Map(clients.map((c) => [String(c.id), c.companyName ?? `Client #${c.id}`]));
  const inPeriod = tickets.filter((t) => t.createdAt && Date.parse(t.createdAt) >= from);
  const resolvedInPeriod = tickets.filter((t) => t.resolvedAt && Date.parse(t.resolvedAt) >= from && t.createdAt);
  const resolutionDays = (t: TicketRow) => daysBetween(t.createdAt!, t.resolvedAt!);
  const durations = resolvedInPeriod.map(resolutionDays).filter((d) => d >= 0);

  const openTickets = tickets.filter((t) => OPEN.has(t.status ?? ""));

  const byClientMap = new Map<string, TicketRow[]>();
  for (const t of inPeriod) {
    const k = relId(t.client) ?? (t.company ? `nom:${t.company}` : "");
    if (!k) continue;
    byClientMap.set(k, [...(byClientMap.get(k) ?? []), t]);
  }
  const byClient: ClientTicketRow[] = [...byClientMap.entries()]
    .map(([key, list]) => ({
      key,
      client: key.startsWith("nom:") ? key.slice(4) : (clientName.get(key) ?? `Client #${key}`),
      total: list.length,
      open: list.filter((t) => OPEN.has(t.status ?? "")).length,
      avgResolutionDays: average(list.filter((t) => t.resolvedAt).map(resolutionDays)),
    }))
    .sort((a, b) => b.total - a.total);

  const created = countByMonth(inPeriod, (t) => t.createdAt, months, now);
  const resolved = countByMonth(tickets, (t) => t.resolvedAt, months, now);

  return {
    kpis: {
      created: periodDelta(tickets, (t) => t.createdAt, months, now),
      resolved: periodDelta(tickets, (t) => t.resolvedAt, months, now),
      openNow: openTickets.length,
      urgentOpen: openTickets.filter((t) => t.priority === "urgent").length,
      avgResolutionDays: average(durations),
      medianResolutionDays: median(durations),
      under48h: durations.length ? round2((durations.filter((d) => d <= 2).length / durations.length) * 100) : null,
    },
    monthly: created.map((p, i) => ({ month: p.month, created: p.count, resolved: resolved[i].count })),
    byStatus: tally(inPeriod, (t) => t.status, label(STATUS_LABELS)),
    byPriority: tally(inPeriod, (t) => t.priority, label(PRIORITY_LABELS)),
    byType: tally(inPeriod, (t) => t.type, label(TYPE_LABELS)),
    byService: tally(inPeriod, (t) => t.service, label(SERVICE_LABELS)),
    resolutionByPriority: ["urgent", "high", "normal", "low"].map((key) => {
      const list = resolvedInPeriod.filter((t) => (t.priority ?? "normal") === key);
      return { key, label: PRIORITY_LABELS[key], count: list.length, avgDays: average(list.map(resolutionDays)) };
    }),
    byClient,
    open: openTickets
      .map((t) => ({
        id: t.id,
        number: t.number ?? null,
        subject: t.subject ?? "—",
        company: relId(t.client) ? (clientName.get(relId(t.client)!) ?? t.company ?? null) : (t.company ?? null),
        status: STATUS_LABELS[t.status ?? ""] ?? t.status ?? "—",
        priority: t.priority ?? "normal",
        ageDays: t.createdAt ? round2(daysBetween(t.createdAt, nowMs)) : 0,
        needsAttention: Boolean(t.needsAttention),
      }))
      .sort((a, b) => b.ageDays - a.ageDays),
  };
}
