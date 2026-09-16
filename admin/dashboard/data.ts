import type { PayloadRequest } from "payload";

/**
 * Couche données de la vue SUPPORT du tableau de bord (rôle support).
 *
 * L'accueil admin, lui, vit dans data-home.ts. Il ne reste ici que les
 * métriques tickets : une lecture ciblée (select minimal, depth 0) et
 * l'agrégation en JS, en `overrideAccess: true` — la vue est réservée à un
 * rôle qui voit tous les tickets.
 */

const DAY_MS = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const SINCE_30 = () => iso(30 * DAY_MS);
const SINCE_60 = () => iso(60 * DAY_MS);
const dayKey = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

const LABELS = {
  status: {
    new: "Nouveau",
    acknowledged: "Pris en compte",
    in_progress: "En cours",
    on_hold: "En attente",
    resolved: "Résolu",
  } as Record<string, string>,
};

export interface Point {
  day: string;
  count: number;
}
export interface Slice {
  key: string;
  label: string;
  count: number;
}

export interface DashboardData {
  support: {
    unreadReplies: number;
    newToHandle: number;
    urgentOpen: number;
    open: number;
    resolved30: number;
    resolvedDelta: number;
    avgResolutionHours: number | null;
    created30: number;
    createdDelta: number;
    createdSeries: Point[];
    statusDist: Slice[];
    recentUnread: Array<{
      id: string | number;
      number?: number;
      subject?: string;
      who?: string;
      priority?: string;
      updatedAt?: string;
    }>;
  };
}

/* eslint-disable @typescript-eslint/no-explicit-any */
type Doc = Record<string, any>;

/** Bucketise des docs par jour sur les `days` derniers jours (série continue). */
function bucketDays(docs: Doc[], field: string, days: number): Point[] {
  const counts = new Map<string, number>();
  for (const d of docs) {
    if (!d[field]) continue;
    const k = dayKey(d[field]);
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const series: Point[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const k = new Date(Date.now() - i * DAY_MS).toISOString().slice(0, 10);
    series.push({ day: k, count: counts.get(k) ?? 0 });
  }
  return series;
}

/** Select minimal partagé pour la lecture des tickets (dashboard admin & support). */
const TICKETS_SELECT = {
  status: true,
  priority: true,
  needsAttention: true,
  unreadClientReply: true,
  resolvedAt: true,
  createdAt: true,
  updatedAt: true,
  number: true,
  subject: true,
  name: true,
  email: true,
} as const;

/**
 * Métriques support — dérivées d'une seule lecture `tickets`. Pure (testable),
 * partagée entre le dashboard admin (getDashboardData) et le dashboard support
 * (getSupportMetrics) : aucune duplication de calcul.
 */
export function computeSupport(tickets: Doc[]): DashboardData["support"] {
  const s30 = SINCE_30();
  const s60 = SINCE_60();
  const isOpen = (t: Doc) => t.status !== "resolved";
  const open = tickets.filter(isOpen).length;
  const unreadReplies = tickets.filter((t) => t.unreadClientReply === true).length;
  const newToHandle = tickets.filter(
    (t) => t.needsAttention === true && t.unreadClientReply !== true && isOpen(t),
  ).length;
  const urgentOpen = tickets.filter((t) => t.priority === "urgent" && isOpen(t)).length;

  const resolvedIn = (from: string, to?: string) =>
    tickets.filter(
      (t) => t.status === "resolved" && t.resolvedAt && t.resolvedAt >= from && (!to || t.resolvedAt < to),
    );
  const resolved30 = resolvedIn(s30).length;
  const resolvedPrev = resolvedIn(s60, s30).length;

  const resolvedDocs = resolvedIn(s30).filter((t) => t.createdAt && t.resolvedAt);
  const avgResolutionHours =
    resolvedDocs.length > 0
      ? resolvedDocs.reduce(
          (sum, t) => sum + (new Date(t.resolvedAt).getTime() - new Date(t.createdAt).getTime()),
          0,
        ) /
        resolvedDocs.length /
        3_600_000
      : null;

  const created30docs = tickets.filter((t) => t.createdAt && t.createdAt >= s30);
  const createdPrev = tickets.filter((t) => t.createdAt && t.createdAt >= s60 && t.createdAt < s30).length;
  const createdSeries = bucketDays(created30docs, "createdAt", 30);

  const statusDist: Slice[] = Object.keys(LABELS.status).map((key) => ({
    key,
    label: LABELS.status[key],
    count: tickets.filter((t) => t.status === key).length,
  }));

  const recentUnread = tickets
    .filter((t) => t.unreadClientReply === true)
    .slice(0, 5)
    .map((t) => ({
      id: t.id,
      number: t.number,
      subject: t.subject,
      who: t.name || t.email,
      priority: t.priority,
      updatedAt: t.updatedAt,
    }));

  return {
    unreadReplies,
    newToHandle,
    urgentOpen,
    open,
    resolved30,
    resolvedDelta: resolved30 - resolvedPrev,
    avgResolutionHours,
    created30: created30docs.length,
    createdDelta: created30docs.length - createdPrev,
    createdSeries,
    statusDist,
    recentUnread,
  };
}

/** Dashboard support : ne lit QUE les tickets (pas les données partenaires). */
export async function getSupportMetrics(req: PayloadRequest): Promise<DashboardData["support"]> {
  const { docs } = await req.payload.find({
    overrideAccess: true,
    depth: 0,
    req,
    collection: "tickets",
    limit: 8000,
    pagination: false,
    sort: "-updatedAt",
    select: TICKETS_SELECT,
  });
  return computeSupport(docs as Doc[]);
}
