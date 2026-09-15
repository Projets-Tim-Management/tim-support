import type { BillingReport, ClientCheck, InvoiceSummary } from "@/modules/partner/lib/billing-check";
import { round2 } from "@/modules/partner/lib/format";
import { delta, type Delta } from "@/modules/analytics/lib/growth";
import type { HistoryEntry } from "@/modules/partner/lib/history";
import { monthKey, monthStart } from "@/modules/partner/lib/month";
import { effectiveUnitPrice, licenceLinesOf, PROFILS, type ProfilKey } from "@/modules/partner/lib/pricing";

/**
 * Analyse de la facturation : ce que les fiches disent qu'on doit facturer,
 * ce que Pennylane a réellement facturé et encaissé, et comment ça se répartit
 * — par profil, par partenaire, par mode de paiement, dans le temps.
 *
 * Tout est calculé ici, sans réseau ni base : l'écran passe les fiches, les
 * partenaires et le rapport de rapprochement, et reçoit des chiffres prêts à
 * afficher. Testable ligne à ligne.
 */

/* ─── Entrées ─────────────────────────────────────────────────────────────── */

export type ClientDoc = {
  id: number | string;
  companyName?: string | null;
  clientStatus?: string | null;
  contractStartDate?: string | null;
  resiliationDate?: string | null;
  partner?: number | string | { id: number | string } | null;
  paymentMethod?: string | null;
  billingPeriod?: string | null;
  licences?: Record<string, number | null | undefined> | null;
  history?: HistoryEntry[] | null;
};

export type PartnerDoc = {
  id: number | string;
  displayName?: string | null;
  commissionRate?: number | null;
};

/* ─── Sorties ─────────────────────────────────────────────────────────────── */

export type MonthPoint = {
  /** 1er du mois, ISO. */
  month: string;
  /** Σ CA HT/mois attendu d'après les fiches en vigueur ce mois-là. */
  expected: number;
  /** Σ HT des factures Pennylane émises ce mois-là. */
  invoiced: number;
  /** Σ TTC encaissé (factures de ce mois payées). */
  paid: number;
  /** Clients facturables ce mois-là. */
  clients: number;
  licences: number;
};

export type ProfileStat = {
  key: ProfilKey;
  label: string;
  licences: number;
  caHT: number;
  /** Prix effectif moyen par licence (pondéré). */
  avgPrice: number;
  /** Prix catalogue moyen (avant remise), pour lire l'effort commercial. */
  avgListPrice: number;
  clients: number;
};

export type Bucket = { key: string; label: string; count: number; caHT: number };

export type PartnerStat = {
  id: number | string;
  name: string;
  clients: number;
  licences: number;
  caHT: number;
  commissionRate: number;
  commission: number;
};

export type ClientRow = {
  id: number | string;
  name: string;
  clientStatus: string | null;
  partner: string | null;
  contractStart: string | null;
  licences: number;
  caHT: number;
  /** Manque à gagner mensuel dû aux remises de ligne. */
  discount: number;
  billingPeriod: string;
  paymentMethod: string | null;
  verdict: ClientCheck["verdict"] | null;
  lateCount: number;
  lateAmount: number;
  commission: number;
};

export type DiscountRow = {
  clientId: number | string;
  client: string;
  profile: string;
  qty: number;
  listPrice: number;
  price: number;
  label: string;
  /** Manque à gagner HT / mois sur cette ligne. */
  lossPerMonth: number;
};

export type LateRow = InvoiceSummary & { clientId: number | string; client: string; bucket: string };

/**
 * Évolution des trois grandeurs qui comptent, sur trois horizons.
 * Le CA est un FLUX (somme des mois de la période) ; licences et clients sont
 * un STOCK (l'état en fin de période) — comparer une somme de licences n'aurait
 * aucun sens.
 */
export type Growth = {
  month: { ca: Delta; licences: Delta; clients: Delta };
  quarter: { ca: Delta; licences: Delta; clients: Delta };
  year: { ca: Delta; licences: Delta; clients: Delta };
};

export type BillingAnalytics = {
  period: { months: number; from: string; to: string };
  kpis: {
    mrr: number;
    clients: number;
    licences: number;
    avgPricePerLicence: number;
    discounts: number;
    commissions: number;
    lateCount: number;
    lateAmount: number;
    conformes: number;
    controlled: number;
    /** Clients sous contrat dont la facturation n'a pas encore commencé. */
    startingSoon: number;
    /** Première date de démarrage à venir (ISO jour), s'il y en a. */
    nextStart: string | null;
  };
  series: MonthPoint[];
  growth: Growth;
  byProfile: ProfileStat[];
  byPaymentMethod: Bucket[];
  byBillingPeriod: Bucket[];
  byPartner: PartnerStat[];
  clients: ClientRow[];
  discounts: DiscountRow[];
  late: LateRow[];
  aging: Bucket[];
};

/* ─── Libellés ────────────────────────────────────────────────────────────── */

const PAYMENT_LABELS: Record<string, string> = {
  "prelevement-gocardless": "Prélèvement GoCardless",
  virement: "Virement",
};
const PERIOD_LABELS: Record<string, string> = {
  mensuelle: "Mensuelle",
  trimestrielle: "Trimestrielle",
  semestrielle: "Semestrielle",
  annuelle: "Annuelle",
};

const AGING_BUCKETS = [
  { key: "1-30", label: "1 à 30 j", min: 1, max: 30 },
  { key: "31-60", label: "31 à 60 j", min: 31, max: 60 },
  { key: "61-90", label: "61 à 90 j", min: 61, max: 90 },
  { key: "90+", label: "Plus de 90 j", min: 91, max: Infinity },
] as const;

const agingKey = (days: number) => AGING_BUCKETS.find((b) => days >= b.min && days <= b.max)?.key ?? "90+";

const relId = (v: ClientDoc["partner"]): number | string | null =>
  v == null ? null : typeof v === "object" ? (v.id ?? null) : v;

const LIVE = new Set(["in_progress", "not_started", "pending"]);

/**
 * Quand la facturation d'un client COMMENCE. C'est l'abonnement Pennylane qui
 * fait foi dès qu'il existe : les anciens clients ont une date de contrat de
 * 2021 sur leur fiche, mais rien n'a été facturé par Pennylane avant le
 * 04/10/2026 — et c'est ce qu'on analyse ici. Sans abonnement, la fiche.
 * Null : pas gagné, ou aucune date — jamais facturé.
 */
function billingStartOf(c: ClientDoc, check: ClientCheck | undefined): string | null {
  if (c.clientStatus !== "actif") return null;
  const pl = check?.pennylane;
  if (pl?.subscriptionId && pl.start && LIVE.has(pl.status ?? "")) return pl.start;
  return c.contractStartDate ?? null;
}

/* ─── Calcul ──────────────────────────────────────────────────────────────── */

/**
 * @param months  profondeur de la série mensuelle (6, 12, 24)
 * @param now     « aujourd'hui » — passé explicitement pour rester pur
 */
export function buildBillingAnalytics(
  clients: ClientDoc[],
  partners: PartnerDoc[],
  report: BillingReport | null,
  months: number,
  now: Date,
): BillingAnalytics {
  const partnersById = new Map(partners.map((p) => [String(p.id), p]));
  const checksById = new Map((report?.checks ?? []).map((c) => [String(c.client.id), c]));

  // Les clients sous contrat : gagnés, avec une date de démarrage (Pennylane
  // ou fiche). Les autres n'entrent dans aucun chiffre — un devis en
  // préparation n'est pas du CA. Ceux dont le démarrage est à venir comptent
  // dans le CA attendu (c'est ce qui sera facturé), mais pas dans la série
  // avant leur date.
  const starts = new Map<string, string>();
  for (const c of clients) {
    const start = billingStartOf(c, checksById.get(String(c.id)));
    if (start) starts.set(String(c.id), start);
  }
  const billable = clients.filter((c) => starts.has(String(c.id)));
  const startingSoon = billable.filter((c) => Date.parse(starts.get(String(c.id))!) > now.getTime());
  const nextStart = startingSoon.map((c) => starts.get(String(c.id))!).sort()[0] ?? null;

  /* Lignes de licences par client (prix effectif, remise) */
  const linesOf = (c: ClientDoc) => licenceLinesOf(c.licences).map((l) => ({ ...l, net: effectiveUnitPrice(l) }));

  /* ── KPI et répartitions ── */
  const byProfileAcc = new Map<ProfilKey, { licences: number; caHT: number; list: number; clients: Set<string> }>();
  const byPay = new Map<string, Bucket>();
  const byPeriod = new Map<string, Bucket>();
  const byPartnerAcc = new Map<string, PartnerStat>();
  const discounts: DiscountRow[] = [];
  const rows: ClientRow[] = [];

  let mrr = 0;
  let licencesTotal = 0;
  let discountTotal = 0;
  let commissionTotal = 0;

  for (const c of billable) {
    const lines = linesOf(c);
    const caHT = round2(lines.reduce((s, l) => s + l.qty * l.net, 0));
    const licences = lines.reduce((s, l) => s + l.qty, 0);
    const discount = round2(lines.reduce((s, l) => s + l.qty * (l.price - l.net), 0));
    const pid = relId(c.partner);
    const partner = pid != null ? partnersById.get(String(pid)) : undefined;
    const rate = Number(partner?.commissionRate ?? 0) || 0;
    const commission = round2((caHT * rate) / 100);
    const check = checksById.get(String(c.id));
    const late = check?.latePayments ?? [];

    mrr += caHT;
    licencesTotal += licences;
    discountTotal += discount;
    commissionTotal += commission;

    for (const l of lines) {
      if (l.qty === 0) continue;
      const a = byProfileAcc.get(l.key) ?? { licences: 0, caHT: 0, list: 0, clients: new Set<string>() };
      a.licences += l.qty;
      a.caHT += l.qty * l.net;
      a.list += l.qty * l.price;
      a.clients.add(String(c.id));
      byProfileAcc.set(l.key, a);
      if (l.net < l.price) {
        const pct = l.discountPct ?? 0;
        const amount = l.discountAmount ?? 0;
        discounts.push({
          clientId: c.id,
          client: c.companyName ?? "—",
          profile: l.label,
          qty: l.qty,
          listPrice: round2(l.price),
          price: l.net,
          label: pct > 0 ? `− ${pct} %` : `− ${round2(amount)} € / licence`,
          lossPerMonth: round2(l.qty * (l.price - l.net)),
        });
      }
    }

    const payKey = c.paymentMethod ?? "non-renseigne";
    const pay = byPay.get(payKey) ?? { key: payKey, label: PAYMENT_LABELS[payKey] ?? "Non renseigné", count: 0, caHT: 0 };
    pay.count += 1;
    pay.caHT = round2(pay.caHT + caHT);
    byPay.set(payKey, pay);

    const perKey = c.billingPeriod ?? "mensuelle";
    const per = byPeriod.get(perKey) ?? { key: perKey, label: PERIOD_LABELS[perKey] ?? perKey, count: 0, caHT: 0 };
    per.count += 1;
    per.caHT = round2(per.caHT + caHT);
    byPeriod.set(perKey, per);

    const partnerKey = pid != null ? String(pid) : "sans";
    const ps = byPartnerAcc.get(partnerKey) ?? {
      id: pid ?? "sans",
      name: partner?.displayName ?? (pid != null ? `Partenaire #${pid}` : "Sans partenaire"),
      clients: 0,
      licences: 0,
      caHT: 0,
      commissionRate: rate,
      commission: 0,
    };
    ps.clients += 1;
    ps.licences += licences;
    ps.caHT = round2(ps.caHT + caHT);
    ps.commission = round2(ps.commission + commission);
    byPartnerAcc.set(partnerKey, ps);

    rows.push({
      id: c.id,
      name: c.companyName ?? "—",
      clientStatus: c.clientStatus ?? null,
      partner: partner?.displayName ?? null,
      contractStart: starts.get(String(c.id)) ?? null,
      licences,
      caHT,
      discount,
      billingPeriod: PERIOD_LABELS[perKey] ?? perKey,
      paymentMethod: c.paymentMethod ? (PAYMENT_LABELS[c.paymentMethod] ?? c.paymentMethod) : null,
      verdict: check?.verdict ?? null,
      lateCount: late.length,
      lateAmount: round2(late.reduce((s, i) => s + i.remaining, 0)),
      commission,
    });
  }

  const byProfile: ProfileStat[] = PROFILS.map((p) => {
    const a = byProfileAcc.get(p.key);
    return {
      key: p.key,
      label: p.label,
      licences: a?.licences ?? 0,
      caHT: round2(a?.caHT ?? 0),
      avgPrice: a && a.licences ? round2(a.caHT / a.licences) : 0,
      avgListPrice: a && a.licences ? round2(a.list / a.licences) : 0,
      clients: a?.clients.size ?? 0,
    };
  });

  /* ── Impayés ── */
  const late: LateRow[] = [];
  for (const check of report?.checks ?? []) {
    for (const inv of check.latePayments) {
      late.push({ ...inv, clientId: check.client.id, client: check.client.name, bucket: agingKey(inv.lateDays) });
    }
  }
  late.sort((a, b) => b.lateDays - a.lateDays);
  const aging: Bucket[] = AGING_BUCKETS.map((b) => ({
    key: b.key,
    label: b.label,
    count: late.filter((l) => l.bucket === b.key).length,
    caHT: round2(late.filter((l) => l.bucket === b.key).reduce((s, l) => s + l.remaining, 0)),
  }));

  /* ── Série mensuelle, et l'évolution sur 25 mois quel que soit le filtre ── */
  const series = monthlySeries(clients, starts, report, months, now);
  const growth = computeGrowth(monthlySeries(clients, starts, report, 25, now));

  const controlled = report?.checks.length ?? 0;
  const conformes = report?.checks.filter((c) => c.verdict === "ok").length ?? 0;

  rows.sort((a, b) => b.caHT - a.caHT);
  discounts.sort((a, b) => b.lossPerMonth - a.lossPerMonth);
  const byPartner = [...byPartnerAcc.values()].sort((a, b) => b.caHT - a.caHT);

  return {
    period: { months, from: series[0]?.month ?? monthStart(now), to: monthStart(now) },
    kpis: {
      mrr: round2(mrr),
      clients: billable.length,
      licences: licencesTotal,
      avgPricePerLicence: licencesTotal ? round2(mrr / licencesTotal) : 0,
      discounts: round2(discountTotal),
      commissions: round2(commissionTotal),
      lateCount: late.length,
      lateAmount: round2(late.reduce((s, l) => s + l.remaining, 0)),
      conformes,
      controlled,
      startingSoon: startingSoon.length,
      nextStart,
    },
    series,
    growth,
    byProfile,
    byPaymentMethod: [...byPay.values()].sort((a, b) => b.caHT - a.caHT),
    byBillingPeriod: [...byPeriod.values()].sort((a, b) => b.count - a.count),
    byPartner,
    clients: rows,
    discounts,
    late,
    aging,
  };
}

/**
 * Mois par mois sur `months` mois : le CA attendu d'après l'historique des
 * fiches (la ligne en vigueur ce mois-là, pour les clients dont la facturation
 * a commencé à cette date — `starts`), face à ce que Pennylane a émis et
 * encaissé.
 */
function monthlySeries(
  clients: ClientDoc[],
  starts: Map<string, string>,
  report: BillingReport | null,
  months: number,
  now: Date,
): MonthPoint[] {
  const invoicesByMonth = new Map<string, { invoiced: number; paid: number }>();
  for (const check of report?.checks ?? []) {
    for (const inv of check.invoices) {
      if (!inv.date || inv.state === "annulee") continue;
      const k = monthKey(inv.date);
      const a = invoicesByMonth.get(k) ?? { invoiced: 0, paid: 0 };
      a.invoiced += inv.amountHT;
      if (inv.state === "payee") a.paid += inv.amountTTC;
      invoicesByMonth.set(k, a);
    }
  }

  const out: MonthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    const key = monthKey(m);
    // Fin du mois : ce qui compte, c'est l'état des fiches à ce moment-là.
    const monthEnd = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0, 23, 59, 59));
    const asOf = monthEnd < now ? monthEnd : now;

    let expected = 0;
    let count = 0;
    let licences = 0;
    for (const c of clients) {
      const start = starts.get(String(c.id));
      if (!start || Date.parse(start) > asOf.getTime()) continue;
      if (c.resiliationDate && Date.parse(c.resiliationDate) < m.getTime()) continue;
      // La ligne d'historique en vigueur : la dernière datée au plus tard ce mois.
      const inForce = [...(c.history ?? [])]
        .filter((h) => h.at && Date.parse(h.at) <= monthEnd.getTime())
        .sort((a, b) => Date.parse(b.at!) - Date.parse(a.at!))[0];
      if (!inForce) continue;
      expected += inForce.caHT ?? 0; // déjà un montant PAR MOIS, quelle que soit la périodicité

      licences += inForce.totalLicences ?? 0;
      count += 1;
    }
    const inv = invoicesByMonth.get(key);
    out.push({
      month: monthStart(m),
      expected: round2(expected),
      invoiced: round2(inv?.invoiced ?? 0),
      paid: round2(inv?.paid ?? 0),
      clients: count,
      licences,
    });
  }
  return out;
}

/* ─── Évolution ───────────────────────────────────────────────────────────── */

/**
 * Sur une série mensuelle (le mois en cours en dernier), les variations à un
 * mois, un trimestre et un an. Le mois en cours est comparé au mois complet
 * précédent ; « trimestre » = les 3 derniers mois contre les 3 d'avant ;
 * « année » = les 12 derniers contre les 12 d'avant. Une série trop courte
 * donne des `pct` null, jamais une invention.
 */
function computeGrowth(series: MonthPoint[]): Growth {
  const n = series.length;
  const at = (i: number): MonthPoint | undefined => (i >= 0 && i < n ? series[i] : undefined);
  const sumCa = (from: number, to: number) => {
    let s = 0;
    for (let i = from; i < to; i++) s += at(i)?.expected ?? 0;
    return s;
  };
  const span = (len: number) => {
    // Période courante : les `len` derniers mois ; précédente : les `len` d'avant.
    const curEnd = at(n - 1);
    const prevEnd = at(n - 1 - len);
    const enough = n >= 2 * len;
    return {
      ca: enough ? delta(sumCa(n - len, n), sumCa(n - 2 * len, n - len)) : { current: round2(sumCa(Math.max(0, n - len), n)), previous: 0, pct: null },
      licences: delta(curEnd?.licences ?? 0, enough ? (prevEnd?.licences ?? 0) : 0),
      clients: delta(curEnd?.clients ?? 0, enough ? (prevEnd?.clients ?? 0) : 0),
    };
  };
  return { month: span(1), quarter: span(3), year: span(12) };
}
