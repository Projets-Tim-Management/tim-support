import type { PayloadRequest } from "payload";

/**
 * Couche données du dashboard admin.
 *
 * Contraintes (cf. admin/dashboard/CHECKLIST.md §C) :
 *  - agrégation SERVER-SIDE via la Local API (jamais de fetch client) ;
 *  - PEU de requêtes : une lecture ciblée par collection (select minimal,
 *    depth:0) + agrégation en JS, `payload.count` pour les compteurs simples ;
 *  - le pooler Supabase plafonne à 15 clients → on exécute les requêtes en
 *    BATCHES de 5 (jamais 30 en parallèle, sinon "max clients reached") ;
 *  - lecture en `overrideAccess: true` : vue réservée aux admins, calcul de
 *    totaux de confiance côté serveur.
 */

const DAY_MS = 86_400_000;
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString();
const SINCE_30 = () => iso(30 * DAY_MS);
const SINCE_60 = () => iso(60 * DAY_MS);
const dayKey = (d: string | Date) => new Date(d).toISOString().slice(0, 10);

/** Exécute des thunks async par lots de `size` (respecte le pool DB à 15). */
async function batched<T>(tasks: Array<() => Promise<T>>, size = 5): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < tasks.length; i += size) {
    const slice = tasks.slice(i, i + size);
    out.push(...(await Promise.all(slice.map((t) => t()))));
  }
  return out;
}

const LABELS = {
  status: {
    new: "Nouveau",
    acknowledged: "Pris en compte",
    in_progress: "En cours",
    on_hold: "En attente",
    resolved: "Résolu",
  } as Record<string, string>,
  source: {
    contrat: "Contrats",
    avis: "Avis",
    ajustement: "Ajustements",
    echange: "Échanges",
  } as Record<string, string>,
  availability: {
    disponible: "Disponible",
    beta: "Beta",
    prochainement: "Prochainement",
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
  partners: {
    active: number;
    metier: number;
    user: number;
    caMonthly: number;
    pointsCirculation: number;
    pendingSubmissions: number;
    pendingOrders: number;
    pointsBySource: Array<{ key: string; label: string; points: number }>;
    topCA: Array<{ name: string; ca: number }>;
  };
  editorial: {
    featuresPublished: number;
    featuresDraft: number;
    parcoursPublished: number;
    availability: Slice[];
    satisfaction: { helpful: number; notHelpful: number; pct: number | null };
  };
  system: {
    users: number;
    usersAdmin: number;
    usersPartner: number;
    media: number;
    mediaWeight: number;
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

export async function getDashboardData(req: PayloadRequest): Promise<DashboardData> {
  const { payload } = req;
  const opts = { overrideAccess: true as const, depth: 0 as const, req };

  const s30 = SINCE_30();
  const s60 = SINCE_60();

  // ── Batch 1 : une lecture ciblée par grosse collection ──────────────────
  const [tickets, clients, ptx, features, partners] = await batched<Doc[]>([
    () =>
      payload
        .find({
          ...opts,
          collection: "tickets",
          limit: 8000,
          pagination: false,
          sort: "-updatedAt",
          select: {
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
          },
        })
        .then((r) => r.docs),
    () =>
      payload
        .find({
          ...opts,
          collection: "partner-clients",
          where: { clientStatus: { equals: "actif" } },
          limit: 8000,
          pagination: false,
          select: { caPaye: true, partner: true },
        })
        .then((r) => r.docs),
    () =>
      payload
        .find({
          ...opts,
          collection: "point-transactions",
          limit: 40000,
          pagination: false,
          select: { delta: true, source: true, createdAt: true },
        })
        .then((r) => r.docs),
    () =>
      payload
        .find({
          ...opts,
          collection: "features",
          limit: 8000,
          pagination: false,
          select: { _status: true, availability: true, feedback: true },
        })
        .then((r) => r.docs),
    () =>
      payload
        .find({
          ...opts,
          collection: "partners",
          limit: 8000,
          pagination: false,
          select: { name: true, societe: true, status: true, partnerKind: true },
        })
        .then((r) => r.docs),
  ]);

  // ── Batch 2 : compteurs simples (indexés, précis quel que soit le volume) ─
  const [parcoursPub, pendingSubs, pendingOrders, users, media] = await batched<any>([
    () => payload.count({ ...opts, collection: "parcours", where: { _status: { equals: "published" } } }),
    () => payload.count({ ...opts, collection: "mission-submissions", where: { status: { equals: "pending" } } }),
    () => payload.count({ ...opts, collection: "reward-orders", where: { status: { equals: "pending" } } }),
    () =>
      payload
        .find({ ...opts, collection: "users", limit: 5000, pagination: false, select: { roles: true } })
        .then((r) => r.docs),
    () =>
      payload
        .find({ ...opts, collection: "media", limit: 20000, pagination: false, select: { filesize: true } })
        .then((r) => r.docs),
  ]);

  // ── SUPPORT (tout dérivé de la seule lecture `tickets`) ──────────────────
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

  // ── PARTENAIRES ──────────────────────────────────────────────────────────
  const activePartners = partners.filter((p) => p.status === "active");
  const partnerName = new Map<string | number, string>(
    partners.map((p) => [p.id, p.name || p.societe || `#${p.id}`]),
  );

  const caByPartner = new Map<string | number, number>();
  let caMonthly = 0;
  for (const c of clients) {
    const ca = Number(c.caPaye) || 0;
    caMonthly += ca;
    const pid = typeof c.partner === "object" && c.partner ? c.partner.id : c.partner;
    if (pid != null) caByPartner.set(pid, (caByPartner.get(pid) ?? 0) + ca);
  }
  const topCA = [...caByPartner.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([pid, ca]) => ({ name: partnerName.get(pid) ?? `#${pid}`, ca }));

  const pointsCirculation = ptx.reduce((sum, t) => sum + (Number(t.delta) || 0), 0);
  const sourcePoints = new Map<string, number>();
  for (const t of ptx) {
    const delta = Number(t.delta) || 0;
    if (delta > 0 && t.createdAt >= s30) {
      sourcePoints.set(t.source, (sourcePoints.get(t.source) ?? 0) + delta);
    }
  }
  const pointsBySource = Object.keys(LABELS.source)
    .map((key) => ({ key, label: LABELS.source[key], points: sourcePoints.get(key) ?? 0 }))
    .filter((s) => s.points > 0);

  // ── ÉDITORIAL ─────────────────────────────────────────────────────────────
  const featuresPublished = features.filter((f) => f._status === "published").length;
  const featuresDraft = features.filter((f) => f._status === "draft").length;
  const availability: Slice[] = Object.keys(LABELS.availability).map((key) => ({
    key,
    label: LABELS.availability[key],
    count: features.filter((f) => f._status === "published" && f.availability === key).length,
  }));
  let helpful = 0;
  let notHelpful = 0;
  for (const f of features) {
    helpful += Number(f.feedback?.helpful) || 0;
    notHelpful += Number(f.feedback?.notHelpful) || 0;
  }
  const totalVotes = helpful + notHelpful;

  // ── SYSTÈME ────────────────────────────────────────────────────────────────
  const usersAdmin = users.filter((u: Doc) => Array.isArray(u.roles) && u.roles.includes("admin")).length;
  const usersPartner = users.filter((u: Doc) => Array.isArray(u.roles) && u.roles.includes("partner")).length;
  const mediaWeight = media.reduce((sum: number, m: Doc) => sum + (Number(m.filesize) || 0), 0);

  return {
    support: {
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
    },
    partners: {
      active: activePartners.length,
      metier: activePartners.filter((p) => p.partnerKind === "metier").length,
      user: activePartners.filter((p) => p.partnerKind === "utilisateur").length,
      caMonthly,
      pointsCirculation,
      pendingSubmissions: pendingSubs.totalDocs,
      pendingOrders: pendingOrders.totalDocs,
      pointsBySource,
      topCA,
    },
    editorial: {
      featuresPublished,
      featuresDraft,
      parcoursPublished: parcoursPub.totalDocs,
      availability,
      satisfaction: {
        helpful,
        notHelpful,
        pct: totalVotes > 0 ? Math.round((helpful / totalVotes) * 100) : null,
      },
    },
    system: {
      users: users.length,
      usersAdmin,
      usersPartner,
      media: media.length,
      mediaWeight,
    },
  };
}
