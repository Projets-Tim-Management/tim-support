import { countByMonth, periodBounds, periodDelta, type Delta } from "@/modules/analytics/lib/growth";
import { round2 } from "@/modules/partner/lib/format";
import { computeClientCA, licenceLinesOf } from "@/modules/partner/lib/pricing";

/**
 * Analyse du réseau de partenaires : ce que chacun apporte (opportunités,
 * clients gagnés, CA, commission) et ce que le programme de points produit
 * (points distribués, missions, récompenses). Pur, testé.
 */

export type PartnerRow = {
  id: number | string;
  displayName?: string | null;
  type?: string | null;
  partnershipModel?: string | null;
  commissionRate?: number | null;
  joinedAt?: string | null;
  createdAt?: string | null;
};

export type PartnerClientRow = {
  id: number | string;
  partner?: number | string | { id: number | string } | null;
  clientStatus?: string | null;
  createdAt?: string | null;
  contractStartDate?: string | null;
  licences?: Record<string, number | null | undefined> | null;
};

export type PointRow = { partner?: number | string | { id: number | string } | null; delta?: number | null; source?: string | null; createdAt?: string | null };
export type SubmissionRow = { partner?: number | string | { id: number | string } | null; status?: string | null; createdAt?: string | null };
export type OrderRow = { partner?: number | string | { id: number | string } | null; status?: string | null; cost?: number | null; createdAt?: string | null };

export type PartnerStatRow = {
  id: number | string;
  name: string;
  model: string;
  commissionRate: number;
  opportunities: number;
  won: number;
  lost: number;
  conversion: number | null;
  activeClients: number;
  licences: number;
  caHT: number;
  commission: number;
  points: number;
  missions: number;
  orders: number;
};

export type PartnersAnalytics = {
  kpis: {
    partners: number;
    contributing: number;
    opportunities: Delta;
    won: Delta;
    caHT: number;
    commission: number;
    pointsIssued: Delta;
    pointsSpent: Delta;
    pendingSubmissions: number;
    pendingOrders: number;
  };
  monthly: { month: string; opportunities: number; won: number; points: number }[];
  byModel: { key: string; label: string; count: number; caHT: number }[];
  pointsBySource: { key: string; label: string; points: number }[];
  partners: PartnerStatRow[];
};

const MODEL_LABELS: Record<string, string> = {
  "apporteur-affaires": "Apporteur d'affaires",
  revendeur: "Revendeur",
  "revendeur-sav": "Revendeur + S.A.V.",
};
const SOURCE_LABELS: Record<string, string> = {
  contrat: "Contrats / contacts apportés",
  avis: "Avis partenaire",
  ajustement: "Ajustements manuels",
  echange: "Échanges (récompenses)",
};
const relId = (v: PartnerClientRow["partner"]): string | null => (v == null ? null : typeof v === "object" ? String(v.id) : String(v));
const isWon = (s?: string | null) => s === "actif" || s === "resilie" || s === "archive";

export function buildPartnersAnalytics(
  partners: PartnerRow[],
  clients: PartnerClientRow[],
  points: PointRow[],
  submissions: SubmissionRow[],
  orders: OrderRow[],
  months: number,
  now: Date,
): PartnersAnalytics {
  const { from } = periodBounds(months, now);
  const wonAt = (c: PartnerClientRow) => c.contractStartDate ?? null;

  const rows: PartnerStatRow[] = partners.map((p) => {
    const pid = String(p.id);
    const mine = clients.filter((c) => relId(c.partner) === pid);
    const inPeriod = mine.filter((c) => c.createdAt && Date.parse(c.createdAt) >= from);
    const won = inPeriod.filter((c) => isWon(c.clientStatus)).length;
    const lost = inPeriod.filter((c) => c.clientStatus === "perdue").length;
    const active = mine.filter((c) => c.clientStatus === "actif" && c.contractStartDate && Date.parse(c.contractStartDate) <= now.getTime());
    const rate = Number(p.commissionRate ?? 0) || 0;
    let licences = 0;
    let caHT = 0;
    for (const c of active) {
      const { totalLicences, caHT: ca } = computeClientCA(licenceLinesOf(c.licences));
      licences += totalLicences;
      caHT += ca;
    }
    const myPoints = points.filter((t) => relId(t.partner) === pid && t.createdAt && Date.parse(t.createdAt) >= from);
    return {
      id: p.id,
      name: p.displayName ?? `Partenaire #${p.id}`,
      model: MODEL_LABELS[p.partnershipModel ?? ""] ?? (p.type === "utilisateur" ? "Utilisateur" : "—"),
      commissionRate: rate,
      opportunities: inPeriod.length,
      won,
      lost,
      conversion: inPeriod.length ? round2((won / inPeriod.length) * 100) : null,
      activeClients: active.length,
      licences,
      caHT: round2(caHT),
      commission: round2((caHT * rate) / 100),
      points: myPoints.reduce((s, t) => s + (Number(t.delta) || 0), 0),
      missions: submissions.filter((s) => relId(s.partner) === pid && s.createdAt && Date.parse(s.createdAt) >= from).length,
      orders: orders.filter((o) => relId(o.partner) === pid && o.createdAt && Date.parse(o.createdAt) >= from).length,
    };
  });
  rows.sort((a, b) => b.caHT - a.caHT || b.opportunities - a.opportunities);

  const withPartner = clients.filter((c) => relId(c.partner));
  const pointsIssued = points.filter((t) => (Number(t.delta) || 0) > 0);
  const pointsSpent = points.filter((t) => (Number(t.delta) || 0) < 0);
  const sumDelta = (list: PointRow[]) => list.reduce((s, t) => s + Math.abs(Number(t.delta) || 0), 0);
  const inPeriodPts = (list: PointRow[]) => list.filter((t) => t.createdAt && Date.parse(t.createdAt) >= from);

  const byModelMap = new Map<string, { count: number; caHT: number }>();
  for (const r of rows) {
    const a = byModelMap.get(r.model) ?? { count: 0, caHT: 0 };
    a.count += 1;
    a.caHT = round2(a.caHT + r.caHT);
    byModelMap.set(r.model, a);
  }

  const pointsBySourceMap = new Map<string, number>();
  for (const t of inPeriodPts(pointsIssued)) {
    const k = t.source ?? "";
    pointsBySourceMap.set(k, (pointsBySourceMap.get(k) ?? 0) + (Number(t.delta) || 0));
  }

  const oppSeries = countByMonth(withPartner, (c) => c.createdAt, months, now);
  const wonSeries = countByMonth(withPartner.filter((c) => isWon(c.clientStatus)), wonAt, months, now);
  const ptsSeries = countByMonthSum(pointsIssued, months, now);

  return {
    kpis: {
      partners: partners.length,
      contributing: rows.filter((r) => r.opportunities > 0).length,
      opportunities: periodDelta(withPartner, (c) => c.createdAt, months, now),
      won: periodDelta(withPartner.filter((c) => isWon(c.clientStatus)), wonAt, months, now),
      caHT: round2(rows.reduce((s, r) => s + r.caHT, 0)),
      commission: round2(rows.reduce((s, r) => s + r.commission, 0)),
      pointsIssued: periodDeltaSum(pointsIssued, months, now),
      pointsSpent: periodDeltaSum(pointsSpent, months, now),
      pendingSubmissions: submissions.filter((s) => s.status === "pending").length,
      pendingOrders: orders.filter((o) => o.status === "pending").length,
    },
    monthly: oppSeries.map((p, i) => ({ month: p.month, opportunities: p.count, won: wonSeries[i].count, points: ptsSeries[i] })),
    byModel: [...byModelMap.entries()].map(([label, a]) => ({ key: label, label, ...a })).sort((a, b) => b.caHT - a.caHT),
    pointsBySource: [...pointsBySourceMap.entries()]
      .map(([key, pts]) => ({ key, label: SOURCE_LABELS[key] ?? (key ? key : "Sans source"), points: pts }))
      .sort((a, b) => b.points - a.points),
    partners: rows,
  };

  /** Somme des points par mois (série continue), en valeur absolue. */
  function countByMonthSum(list: PointRow[], m: number, at: Date): number[] {
    const buckets = countByMonth(list, (t) => t.createdAt, m, at).map(() => 0);
    const keys = countByMonth([], () => null, m, at).map((b) => b.month.slice(0, 7));
    for (const t of list) {
      if (!t.createdAt) continue;
      const i = keys.indexOf(new Date(t.createdAt).toISOString().slice(0, 7));
      if (i >= 0) buckets[i] += Math.abs(Number(t.delta) || 0);
    }
    return buckets;
  }
  function periodDeltaSum(list: PointRow[], m: number, at: Date): Delta {
    const b = periodBounds(m, at);
    const cur = sumDelta(list.filter((t) => t.createdAt && Date.parse(t.createdAt) >= b.from));
    const prev = sumDelta(list.filter((t) => t.createdAt && Date.parse(t.createdAt) >= b.prevFrom && Date.parse(t.createdAt) < b.from));
    return { current: cur, previous: prev, pct: prev > 0 ? round2(((cur - prev) / prev) * 100) : null };
  }
}
