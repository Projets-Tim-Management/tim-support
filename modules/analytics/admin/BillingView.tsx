import Link from "next/link";
import type { AdminViewServerProps } from "payload";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { AgingChart, MonthlyChart, PartnerChart, ProfileChart, ResultChart, RevenueChart, RollingChart, ShareBar, YearLinesChart } from "@/modules/analytics/admin/charts";
import { HistoryControls, ParamChips } from "@/modules/analytics/admin/HistoryControls";
import { ValidationStrip } from "@/modules/analytics/admin/ValidationStrip";
import { DataTable, type Column, type Row } from "@/modules/analytics/admin/DataTable";
import { BarList, Card, clientHref, eur0, Fold, Kpi, Meter, monthYear, Tile, type BarItem } from "@/modules/analytics/admin/ui";
import { buildBillingAnalytics, type BillingAnalytics, type ClientDoc, type PartnerDoc } from "@/modules/analytics/lib/billing";
import { splitServices, type AxonautLine } from "@/modules/analytics/lib/axonaut";
import { ACQUISITION_POSTES, ONE_OFF_POSTES, UNCLASSIFIED, type Expense } from "@/modules/analytics/lib/expenses";
import { loadExpenses } from "@/modules/analytics/lib/expenses-load";
import { delta } from "@/modules/analytics/lib/growth";
import {
  buildRevenueHistory,
  analyzeHistory,
  breakEven,
  lifetime,
  HISTORY_MEASURES,
  HISTORY_VIEWS,
  type HistoryAnalysis,
  type LegacyInvoice,
  type PennylaneInvoice,
  type PeriodSummary,
  type RevenueHistory,
} from "@/modules/analytics/lib/revenue-history";

import type { BillingReport } from "@/modules/partner/lib/billing-check";
import { billingPeriodMonths } from "@/modules/partner/lib/billing-period";
import { loadBillingReport } from "@/modules/partner/lib/billing-report";
import { eur } from "@/modules/partner/lib/format";
import { isPennylaneConfigured, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Écran « Analyses → Facturation » (/admin/analyses/facturation).
 *
 * Un tableau de bord de RÉSULTAT, à lire en trente secondes : ce que TIM a
 * facturé, ce qu'elle a dépensé, ce qui reste — puis d'où vient l'argent, où
 * il va, et l'évolution d'une année sur l'autre. Les chiffres sont tenus
 * ailleurs (Pennylane, le comptable) : l'écran les montre, il ne les saisit
 * pas. Le détail (tableaux, contrats, licences) est replié en bas.
 *
 * Server component : la Local API pour les fiches et partenaires, le rapport
 * de rapprochement (Pennylane en cache) pour les factures, les relevés
 * bancaires pour les dépenses. Les graphiques sont des client components
 * alimentés en données déjà calculées.
 */

const pct0 = (v: number) => `${Math.round(v).toLocaleString("fr-FR")} %`;
const monthName = monthYear;

/** Les dépenses d'une période ne se montrent que si on les connaît sur tous ses mois. */
const spentKnown = (p: PeriodSummary) => p.covered > 0 && p.expenseMonths === p.covered;

const VERDICT_TONES = { ok: "ok", ecart: "warn", "sans-abonnement": "bad", "non-rapproche": "bad" } as const;
const VERDICT_LABELS = { ok: "Conforme", ecart: "Écart", "sans-abonnement": "Sans abonnement", "non-rapproche": "Introuvable" };

const CLIENT_COLUMNS: Column[] = [
  { key: "name", label: "Client" },
  { key: "partner", label: "Partenaire" },
  { key: "contractStart", label: "Facturé dès le", format: "date" },
  { key: "licences", label: "Licences", format: "int" },
  { key: "caHT", label: "CA HT / mois", format: "eur" },
  { key: "discount", label: "Remises / mois", format: "eur" },
  { key: "commission", label: "Commission", format: "eur" },
  { key: "billingPeriod", label: "Périodicité" },
  { key: "paymentMethod", label: "Paiement" },
  { key: "verdict", label: "Pennylane", format: "badge", tones: VERDICT_TONES, labels: VERDICT_LABELS },
  { key: "lateAmount", label: "Impayé", format: "eur" },
];

const PROFILE_COLUMNS: Column[] = [
  { key: "label", label: "Profil" },
  { key: "clients", label: "Clients", format: "int" },
  { key: "licences", label: "Licences", format: "int" },
  { key: "avgListPrice", label: "Prix catalogue moyen", format: "eur" },
  { key: "avgPrice", label: "Prix facturé moyen", format: "eur" },
  { key: "caHT", label: "CA HT / mois", format: "eur" },
];

const PARTNER_COLUMNS: Column[] = [
  { key: "name", label: "Partenaire" },
  { key: "clients", label: "Clients", format: "int" },
  { key: "licences", label: "Licences", format: "int" },
  { key: "caHT", label: "CA HT / mois apporté", format: "eur" },
  { key: "commissionRate", label: "Taux", format: "pct" },
  { key: "commission", label: "Commission / mois", format: "eur" },
];

const DISCOUNT_COLUMNS: Column[] = [
  { key: "client", label: "Client" },
  { key: "profile", label: "Profil" },
  { key: "qty", label: "Licences", format: "int" },
  { key: "listPrice", label: "Prix catalogue", format: "eur" },
  { key: "label", label: "Remise" },
  { key: "price", label: "Prix facturé", format: "eur" },
  { key: "lossPerMonth", label: "Manque à gagner / mois", format: "eur" },
];

const LATE_COLUMNS: Column[] = [
  { key: "client", label: "Client" },
  { key: "number", label: "Facture" },
  { key: "date", label: "Émise le", format: "date" },
  { key: "deadline", label: "Échéance", format: "date" },
  { key: "lateDays", label: "Retard (j)", format: "int" },
  { key: "amountTTC", label: "Montant TTC", format: "eur" },
  { key: "remaining", label: "Reste dû", format: "eur" },
];

const MOVE_COLUMNS: Column[] = [
  { key: "label", label: "Mois" },
  { key: "source", label: "Source", format: "badge", tones: { axonaut: "muted", pennylane: "ok" }, labels: { axonaut: "Axonaut", pennylane: "Pennylane" } },
  { key: "clients", label: "Clients", format: "int" },
  { key: "recurring", label: "Licences HT", format: "eur" },
  { key: "services", label: "Prestations HT", format: "eur" },
  { key: "gainedNames", label: "Nouveaux" },
  { key: "lostNames", label: "Plus facturés" },
  { key: "expansion", label: "Hausses", format: "eur" },
  { key: "contraction", label: "Baisses", format: "eur" },
];

const EXPENSE_COLUMNS: Column[] = [
  { key: "date", label: "Date", format: "date" },
  { key: "label", label: "Libellé bancaire" },
  { key: "poste", label: "Poste" },
  {
    key: "kind",
    label: "Type",
    format: "badge",
    tones: { depense: "muted", impot: "warn", ignore: "muted" },
    labels: { depense: "Dépense", impot: "Impôt", ignore: "Pas une dépense" },
  },
  { key: "amount", label: "Montant", format: "eur" },
];

const STATUS_TONES = { nouveau: "ok", hausse: "ok", stable: "muted", baisse: "warn", parti: "bad", prestations: "muted" } as const;
const STATUS_LABELS = { nouveau: "Nouveau", hausse: "Hausse", stable: "Stable", baisse: "Baisse", parti: "Parti", prestations: "Prestations seules" };

/** Ce que montre la courbe « une année sur l'autre » : chaque montant que l'écran sait lire. */
const YEAR_MEASURES = [
  { value: "tout", label: "Chiffre d'affaires" },
  { value: "licences", label: "Licences" },
  { value: "formation", label: "Mise en place" },
  { value: "developpement", label: "Développements" },
  { value: "depenses", label: "Dépenses" },
  { value: "benefice", label: "Bénéfice" },
] as const satisfies readonly { value: (typeof HISTORY_MEASURES)[number]["value"]; label: string }[];

/** La phrase du haut : le résultat de la période, dit en clair. */
function Story({ a, b, expensesFrom }: { a: PeriodSummary; b: PeriodSummary | null; expensesFrom: string | null }) {
  const caDelta = b && b.covered === a.covered ? delta(a.total, b.total).pct : null;
  const trend = caDelta == null ? null : Math.round(caDelta) === 0 ? "stable" : caDelta > 0 ? `en hausse de ${pct0(caDelta)}` : `en baisse de ${pct0(-caDelta)}`;
  const evolution =
    caDelta != null ? (
      <>
        {" "}
        Le chiffre d&apos;affaires est <b className={caDelta > 0 ? "an-story__up" : caDelta < 0 ? "an-story__down" : undefined}>{trend}</b> face à {b!.label}.
      </>
    ) : null;
  const result = (expenses: number, profit: number) => (
    <>
      <b>{eur0(expenses)}</b> dépensés, {profit >= 0 ? "il reste " : "soit une perte de "}
      <b className={profit >= 0 ? "an-story__up" : "an-story__down"}>{eur0(Math.abs(profit))}</b>
      {profit >= 0 && expenses + profit > 0 ? ` (marge ${pct0((profit / (expenses + profit)) * 100)})` : ""}.
    </>
  );
  return (
    <p className="an-story">
      Sur <b>{a.label}</b>, TIM a facturé <b>{eur0(a.total)}</b>
      {a.expenses != null && a.profit != null && spentKnown(a) ? (
        <> et {result(a.expenses, a.profit)}</>
      ) : a.expenses != null && a.profit != null ? (
        <>
          . Sur les {a.expenseMonths} mois dont on connaît les dépenses (depuis {monthName(expensesFrom!)}) : {result(a.expenses, a.profit)}
        </>
      ) : (
        <>.{expensesFrom ? ` Les dépenses ne sont connues qu'à partir de ${monthName(expensesFrom)}.` : ""}</>
      )}
      {evolution}
    </p>
  );
}

function Dashboard({
  bill,
  h,
  an,
  expenses,
  notes,
}: {
  bill: BillingAnalytics;
  h: RevenueHistory;
  an: HistoryAnalysis;
  expenses: Expense[];
  notes: string[];
}) {
  const { a, b } = an;
  const vsTitle = b ? `face à ${b.label}` : undefined;
  const sameLength = b != null && b.covered === a.covered;
  const spentA = spentKnown(a);
  // Les dépenses se comparent à des dépenses connues sur autant de mois.
  const spentComparable = spentA && b != null && sameLength && spentKnown(b);
  const viewLabel = HISTORY_VIEWS.find((v) => v.value === an.view)!.label.toLowerCase();

  /* ── Les grands chiffres ── */
  const sparkCA = an.buckets.map((x) => x.summary.total);
  const sparkSpent = an.buckets.map((x) => (spentKnown(x.summary) ? x.summary.expenses : null));
  const sparkProfit = an.buckets.map((x) => (spentKnown(x.summary) ? x.summary.profit : null));
  const caKnown = a.expenses != null && a.profit != null ? a.expenses + a.profit : 0;
  const margin = a.profit != null && caKnown > 0 ? (a.profit / caKnown) * 100 : null;
  const spentSub = a.expenses != null && !spentA ? `sur ${a.expenseMonths} mois (connues depuis ${monthName(h.expensesFrom!)})` : undefined;

  /* ── Où va l'argent ── */
  const perMonth = (v: number) => (a.expenseMonths > 1 ? `≈ ${eur0(v / a.expenseMonths)} / mois` : undefined);
  const allPostes: BarItem[] = Object.entries(a.byPoste)
    .sort((x, y) => y[1] - x[1])
    .map(([poste, v]) => ({
      key: poste,
      label: poste,
      value: v,
      sub: perMonth(v),
      strong: ACQUISITION_POSTES.includes(poste),
      delta: spentComparable && b!.byPoste[poste] ? delta(v, b!.byPoste[poste]) : undefined,
    }));
  const acquisition = allPostes.filter((i) => i.strong).reduce((s, i) => s + i.value, 0);
  // Les six plus gros postes, l'acquisition toujours visible, le reste regroupé.
  const shownPostes = allPostes.filter((i, n) => n < 6 || i.strong);
  const otherPostes = allPostes.filter((i) => !shownPostes.includes(i));
  const posteItems: BarItem[] = otherPostes.length
    ? [
        ...shownPostes,
        {
          key: "autres",
          label: `Petits postes (${otherPostes.map((i) => i.label).join(", ")})`,
          value: otherPostes.reduce((s, i) => s + i.value, 0),
          sub: perMonth(otherPostes.reduce((s, i) => s + i.value, 0)),
          muted: true,
        },
      ]
    : shownPostes;
  const inA = new Set(a.keys);
  const toClassify = expenses.filter((e) => inA.has(e.month) && e.poste === UNCLASSIFIED).length;

  /* ── D'où vient l'argent ── */
  const sources = [
    { key: "licences", label: "Licences (abonnements)", caHT: a.recurring, count: 0 },
    { key: "formation", label: "Mise en place / formation", caHT: a.setup, count: 0 },
    { key: "dev", label: "Développements", caHT: a.dev, count: 0 },
  ].filter((s) => s.caHT > 0);
  const byClient = an.clients.map((c) => ({ c, total: c.recurringA + c.servicesA })).filter((x) => x.total > 0).sort((x, y) => y.total - x.total);
  const TOP = 6;
  const clientItems: BarItem[] = byClient.slice(0, TOP).map(({ c, total }) => ({
    key: c.id,
    label: c.name,
    value: total,
    href: c.clientId != null ? clientHref(c.clientId) : undefined,
  }));
  const rest = byClient.slice(TOP);
  if (rest.length) clientItems.push({ key: "autres", label: `Les ${rest.length} autres clients`, value: rest.reduce((s, x) => s + x.total, 0), muted: true });

  /* ── Clients : arrivées, départs, et le détail ── */
  const clientColumns: Column[] = b
    ? [
        { key: "name", label: "Client" },
        { key: "since", label: "Client depuis" },
        { key: "recurringA", label: `Licences ${a.label}`, format: "eur" },
        { key: "recurringB", label: `Licences ${b.label}`, format: "eur" },
        { key: "pct", label: "Évolution", format: "delta" },
        { key: "status", label: "Statut", format: "badge", tones: STATUS_TONES, labels: STATUS_LABELS },
        { key: "servicesA", label: `Prestations ${a.label}`, format: "eur" },
      ]
    : [
        { key: "name", label: "Client" },
        { key: "since", label: "Client depuis" },
        { key: "recurringA", label: "Licences", format: "eur" },
        { key: "servicesA", label: "Prestations", format: "eur" },
        { key: "totalA", label: "Total", format: "eur" },
      ];
  const clientRows: Row[] = an.clients.map((c) => ({
    id: c.id,
    name: c.name,
    since: c.firstMonth ? monthName(c.firstMonth) : null,
    recurringA: c.recurringA,
    recurringB: c.recurringB,
    pct: c.pct,
    status: c.status,
    servicesA: c.servicesA,
    totalA: c.recurringA + c.servicesA,
    ...(c.clientId != null ? { href: clientHref(c.clientId) } : {}),
  }));

  /* ── Les tableaux repliés ── */
  const periodColumns: Column[] = [
    { key: "label", label: "Période" },
    { key: "total", label: "CA", format: "eur" },
    { key: "recurring", label: "dont licences", format: "eur" },
    { key: "setup", label: "dont mise en place / formation", format: "eur" },
    { key: "dev", label: "dont développements", format: "eur" },
    ...(h.expensesFrom
      ? ([
          { key: "expenses", label: "Dépenses", format: "eur" },
          { key: "taxes", label: "Impôts", format: "eur" },
          { key: "profit", label: "Bénéfice", format: "eur" },
          { key: "margin", label: "Marge", format: "pct" },
        ] satisfies Column[])
      : []),
    ...(an.compareMode !== "aucune"
      ? ([
          { key: "compareLabel", label: "Face à" },
          { key: "compareTotal", label: "CA", format: "eur" },
          { key: "caPct", label: "Évolution du CA", format: "delta" },
        ] satisfies Column[])
      : []),
    { key: "clients", label: "Clients", format: "int" },
  ];
  const periodRows: Row[] = an.buckets.map(({ id, label, summary: s, compare: c }) => {
    const known = spentKnown(s);
    return {
      id,
      label,
      total: s.total,
      recurring: s.recurring,
      setup: s.setup,
      dev: s.dev,
      expenses: known ? s.expenses : null,
      taxes: known ? s.taxes || null : null,
      profit: known ? s.profit : null,
      margin: known && s.profit != null && s.total > 0 ? (s.profit / s.total) * 100 : null,
      compareLabel: c?.label ?? null,
      compareTotal: c?.total ?? null,
      caPct: c && c.covered === s.covered ? delta(s.total, c.total).pct : null,
      clients: s.clients,
    };
  });
  const postes = h.postes.filter((p) => a.byPoste[p]);
  const posteColumns: Column[] = [
    { key: "label", label: "Période" },
    ...postes.map((p): Column => ({ key: `p:${p}`, label: p, format: "eur" })),
    { key: "expenses", label: "Total", format: "eur" },
  ];
  const posteRows: Row[] = an.buckets
    .filter((x) => spentKnown(x.summary))
    .map((x) => ({ id: x.id, label: x.label, ...Object.fromEntries(postes.map((p) => [`p:${p}`, x.summary.byPoste[p] ?? null])), expenses: x.summary.expenses }));
  const expenseRows: Row[] = expenses.filter((e) => inA.has(e.month)).map((e) => ({ ...e }));
  const pivotColumns: Column[] = [{ key: "name", label: "Client" }, ...an.buckets.map((x): Column => ({ key: `b${x.id}`, label: x.label, format: "eur" }))];
  const pivotRows: Row[] = h.clients
    .map((c): Row => ({
      id: c.id,
      name: c.name,
      ...Object.fromEntries(an.buckets.map((x) => [`b${x.id}`, x.summary.keys.reduce((sum, k) => sum + (c.byMonth[k] ?? 0), 0) || null])),
      ...(c.clientId != null ? { href: clientHref(c.clientId) } : {}),
    }))
    .filter((r) => an.buckets.some((x) => r[`b${x.id}`]));
  const moveRows: Row[] = h.months
    .filter((m) => inA.has(m.key))
    .reverse()
    // Le détail par poste est un objet : il a son propre tableau.
    .map((m) => ({ ...m, byPoste: undefined, id: m.key, label: monthName(m.key) }));

  // Le seuil d'équilibre, lu à la fin de la plage choisie.
  const be = breakEven(h, an.end, ONE_OFF_POSTES);

  // Depuis le début : le CA cumulé, et ce que chaque client a rapporté, jusqu'au dernier mois facturé.
  const lt = lifetime(h, an.monthOptions[0]?.value ?? an.end);
  const ltColumns: Column[] = [
    { key: "name", label: "Client" },
    { key: "status", label: "Statut", format: "badge", tones: { actif: "ok", perdu: "bad" }, labels: { actif: "Actif", perdu: "Perdu" } },
    { key: "since", label: "Client depuis" },
    { key: "last", label: "Dernière facture" },
    { key: "total", label: "CA total", format: "eur" },
    { key: "share", label: "Part", format: "pct" },
    ...lt.years.map((y): Column => ({ key: `y${y}`, label: y, format: "eur" })),
    { key: "current", label: "Licences / mois aujourd'hui", format: "eur" },
  ];
  const ltRows: Row[] = lt.clients.map((c) => ({
    id: c.id,
    name: c.name,
    status: c.active ? "actif" : "perdu",
    since: monthName(c.firstMonth),
    last: monthName(c.lastMonth),
    total: c.total,
    share: lt.total ? Math.round((c.total / lt.total) * 1000) / 10 : null,
    ...Object.fromEntries(lt.years.map((y) => [`y${y}`, c.byYear[y] || null])),
    current: c.currentRecurring || null,
    ...(c.clientId != null ? { href: clientHref(c.clientId) } : {}),
  }));
  const ltTotal: Row = {
    name: "Total",
    total: lt.total,
    ...Object.fromEntries(lt.years.map((y) => [`y${y}`, lt.clients.reduce((s, c) => s + (c.byYear[y] ?? 0), 0)])),
    current: lt.clients.reduce((s, c) => s + c.currentRecurring, 0),
  };
  const ltActive = lt.clients.filter((c) => c.active).length;

  const { kpis } = bill;
  const contractRows: Row[] = bill.clients.map((c) => ({ ...c, href: clientHref(c.id) }));
  const discountRows: Row[] = bill.discounts.map((d, i) => ({ ...d, id: `${d.clientId}-${i}`, href: clientHref(d.clientId) }));
  const lateRows: Row[] = bill.late.map((l) => ({ ...l, href: clientHref(l.clientId) }));

  return (
    <>
      <div className="an-toolbar">
        <HistoryControls
          views={HISTORY_VIEWS}
          view={an.view}
          start={an.start}
          end={an.end}
          compareOptions={an.compareOptions}
          compareMode={an.compareMode}
          bStart={an.bStart}
          bEnd={an.bEnd}
          monthOptions={an.monthOptions}
        />
      </div>

      {notes.map((n) => (
        <p key={n} className="an-note">
          {n}
        </p>
      ))}

      <section className="an-hero" aria-label="Résultat de la période">
        <Story a={a} b={b} expensesFrom={h.expensesFrom} />
        <div className="an-kpis">
          <Kpi
            tone="blue"
            label="Chiffre d'affaires"
            value={eur0(a.total)}
            delta={sameLength ? delta(a.total, b!.total) : undefined}
            deltaTitle={vsTitle}
            sub={a.covered > 1 ? `≈ ${eur0(a.avgMonthly)} / mois` : undefined}
            spark={sparkCA}
          />
          <Kpi
            tone="red"
            label="Dépenses"
            value={a.expenses != null ? eur0(a.expenses) : "—"}
            delta={spentComparable ? delta(a.expenses!, b!.expenses!) : undefined}
            deltaTitle={vsTitle}
            goodWhenUp={false}
            sub={a.expenses == null ? `connues depuis ${h.expensesFrom ? monthName(h.expensesFrom) : "—"}` : (spentSub ?? (a.taxes ? `+ ${eur0(a.taxes)} d'impôts` : "hors impôts"))}
            spark={sparkSpent}
          />
          <Kpi
            tone="green"
            label="Bénéfice avant impôts"
            value={a.profit != null ? eur0(a.profit) : "—"}
            alert={a.profit != null && a.profit < 0}
            delta={spentComparable ? delta(a.profit!, b!.profit!) : undefined}
            deltaTitle={vsTitle}
            sub={spentSub}
            spark={sparkProfit}
          >
            {margin != null && <Meter pct={margin} label={`marge ${pct0(margin)}`} />}
          </Kpi>
        </div>
        <div className="an-tiles an-tiles--pulse">
          <Tile
            icon={Icons.clock()}
            label="Licences par mois"
            value={eur0(a.endRecurring)}
            sub={`le récurrent en ${monthName(a.keys.at(-1)!)}`}
            delta={b ? delta(a.endRecurring, b.endRecurring) : undefined}
            deltaTitle={vsTitle}
          />
          <Tile icon={Icons.euro()} label={`CA total depuis ${monthName(lt.start)}`} value={eur0(lt.total)} sub={`${lt.clients.length} clients, dont ${ltActive} actifs`} />
          <Tile icon={Icons.users()} label="Clients facturés" value={a.clients.toLocaleString("fr-FR")} sub={`${a.gained.length} nouveau${a.gained.length > 1 ? "x" : ""} · ${a.lost.length} parti${a.lost.length > 1 ? "s" : ""}`} />
          {a.expenseMonths > 0 && (
            <Tile icon={Icons.target()} label="Acquisition par mois" value={eur0(acquisition / a.expenseMonths)} sub="publicité + SEO" />
          )}
          <Tile
            icon={Icons.alert()}
            label="Impayés"
            value={eur0(kpis.lateAmount)}
            sub={kpis.lateCount ? `${kpis.lateCount} facture${kpis.lateCount > 1 ? "s" : ""} en retard` : "aucun retard"}
            tone={kpis.lateCount ? "bad" : "ok"}
          />
        </div>
      </section>

      <div className="an-grid">
        <Card wide title={`Résultat par ${viewLabel}`} sub="Ce qui est facturé (bleu), ce qui est dépensé (rouge) et ce qui reste (vert). Survolez une période pour le détail.">
          <ResultChart data={an.buckets.map((x) => ({ label: x.label, ca: x.summary.total, expenses: spentKnown(x.summary) ? x.summary.expenses : null, profit: spentKnown(x.summary) ? x.summary.profit : null }))} />
        </Card>

        {be && (
          <Card
            wide
            title="Seuil d'équilibre"
            sub={`Rentrées et dépenses moyennes par mois, sur ${be.window === 12 ? "12 mois glissants" : `les ${be.window} mois connus (12 dès que possible)`} jusqu'à ${monthName(be.end)}. Les dépenses sont lues TTC sur la banque : légèrement surestimées.`}
          >
            <div className="an-even">
              <div className="an-even__fig an-even__fig--blue">
                <span className="an-even__label">Rentrées moyennes</span>
                <span className="an-even__value">{eur0(be.revenue)}</span>
                <span className="an-even__sub">par mois</span>
              </div>
              <span className="an-even__op" aria-hidden>
                −
              </span>
              <div className="an-even__fig an-even__fig--red">
                <span className="an-even__label">Dépenses moyennes</span>
                <span className="an-even__value">{eur0(be.expenses)}</span>
                <span className="an-even__sub">par mois</span>
              </div>
              <span className="an-even__op" aria-hidden>
                =
              </span>
              <div className={`an-even__fig an-even__fig--${be.gap >= 0 ? "green" : "bad"}`}>
                <span className="an-even__label">{be.gap >= 0 ? "Au-dessus du seuil" : "Il manque"}</span>
                <span className="an-even__value">{eur0(Math.abs(be.gap))}</span>
                <span className="an-even__sub">par mois</span>
              </div>
            </div>
            <p className="an-callout an-callout--even">
              {be.gap >= 0 ? (
                <>Les rentrées couvrent les dépenses : TIM est au-dessus de son seuil d'équilibre.</>
              ) : (
                <>
                  Pour couvrir toutes les dépenses, il faut <b>{eur0(-be.gap)} de plus par mois</b>
                  {be.clientsNeeded != null && be.basket != null && (
                    <>
                      , soit environ <b>{be.clientsNeeded} client{be.clientsNeeded > 1 ? "s" : ""} de plus</b> au panier moyen actuel ({eur0(be.basket)} de licences par mois)
                    </>
                  )}
                  .
                </>
              )}{" "}
              {be.expensesCore !== be.expenses && (
                <>
                  Hors dépenses ponctuelles (développement sous-traité), les dépenses tombent à <b>{eur0(be.expensesCore)} / mois</b> :{" "}
                  {be.gapCore >= 0 ? (
                    <>
                      l'équilibre est atteint, avec <b>{eur0(be.gapCore)}</b> de marge par mois.
                    </>
                  ) : (
                    <>
                      il manque encore <b>{eur0(-be.gapCore)}</b> par mois{be.clientsNeededCore ? `, soit ${be.clientsNeededCore} client${be.clientsNeededCore > 1 ? "s" : ""}` : ""}.
                    </>
                  )}
                </>
              )}
            </p>
            <RollingChart data={be.rolling} />
          </Card>
        )}

        <Card
          title="Où va l'argent"
          sub={a.expenseMonths ? `Les dépenses ${spentA ? `de ${a.label}` : `depuis ${monthName(h.expensesFrom!)}`}, par poste. En gras : ce qui fait venir des clients.` : undefined}
        >
          {a.expenseMonths > 0 && acquisition > 0 && a.expenses ? (
            <p className="an-callout">
              <b>{eur0(acquisition)}</b> pour trouver des clients (publicité + SEO), soit <b>{pct0((acquisition / a.expenses) * 100)}</b> des dépenses.
            </p>
          ) : null}
          <BarList
            items={posteItems}
            tone="red"
            goodWhenUp={false}
            deltaTitle={vsTitle}
            empty={h.expensesFrom ? `Dépenses connues à partir de ${monthName(h.expensesFrom)}.` : "Dépenses indisponibles."}
          />
          {toClassify > 0 && (
            <p className="an-card__foot">
              {toClassify} dépense{toClassify > 1 ? "s" : ""} « À classer » : le détail est dans « Détail des dépenses », plus bas.
            </p>
          )}
        </Card>

        <Card title="D'où vient l'argent" sub={`Le chiffre d'affaires de ${a.label}, par nature puis par client.`}>
          {/* Une seule teinte, du plus foncé au plus clair : c'est du CA, le bleu de l'écran. */}
          <ShareBar data={sources} colors={["var(--tim-chart-2)", "color-mix(in srgb, var(--tim-chart-2) 60%, var(--tim-white))", "color-mix(in srgb, var(--tim-chart-2) 32%, var(--tim-white))"]} />
          <BarList items={clientItems} tone="blue" />
        </Card>

        <Card wide title="Une année sur l'autre" sub="Une courbe par année, de janvier à décembre, chacune sa couleur. Survolez un mois pour l'écart.">
          <ParamChips param="hm" value={an.measure} options={YEAR_MEASURES} label="Montant affiché" />
          {/* Des dépenses qui montent sont une mauvaise nouvelle : l'infobulle le dit en rouge. */}
          <YearLinesChart rows={an.yearLines.rows} years={an.yearLines.years} goodWhenUp={an.measure !== "depenses"} />
        </Card>

        <Card wide title="Clients" sub={b ? `Les licences de chaque client sur ${a.label}, face à ${b.label}. Cliquez un nom pour ouvrir la fiche.` : `Ce que chaque client a payé sur ${a.label}.`}>
          {(a.gained.length > 0 || a.lost.length > 0) && (
            <div className="an-moves">
              {a.gained.length > 0 && (
                <div className="an-moves__group">
                  <span className="an-moves__title">Arrivés ({a.gained.length})</span>
                  <span className="an-moves__list">
                    {a.gained.map((n, i) => (
                      <span key={`${n}-${i}`} className="an-chip an-chip--ok">
                        {n}
                      </span>
                    ))}
                  </span>
                </div>
              )}
              {a.lost.length > 0 && (
                <div className="an-moves__group">
                  <span className="an-moves__title">Partis ({a.lost.length})</span>
                  <span className="an-moves__list">
                    {a.lost.map((n, i) => (
                      <span key={`${n}-${i}`} className="an-chip an-chip--bad">
                        {n}
                      </span>
                    ))}
                  </span>
                </div>
              )}
            </div>
          )}
          <DataTable columns={clientColumns} rows={clientRows} sort={{ key: "recurringA", dir: "desc" }} csv="ca-par-client" searchKeys={["name"]} />
        </Card>

        <Card
          wide
          title="Depuis le début"
          sub={`Tout ce que TIM a facturé depuis sa première facture (${monthName(lt.start)}) : la somme qui monte mois après mois, puis ce que chaque client a rapporté en tout, année par année. Un client est « perdu » quand il n'est plus facturé depuis deux mois.`}
        >
          <div className="an-even">
            <div className="an-even__fig an-even__fig--blue">
              <span className="an-even__label">CA cumulé</span>
              <span className="an-even__value">{eur0(lt.total)}</span>
              <span className="an-even__sub">
                de {monthName(lt.start)} à {monthName(lt.end)}
              </span>
            </div>
            <div className="an-even__fig an-even__fig--green">
              <span className="an-even__label">Clients</span>
              <span className="an-even__value">{lt.clients.length}</span>
              <span className="an-even__sub">
                {ltActive} actifs · {lt.clients.length - ltActive} perdus
              </span>
            </div>
            <div className="an-even__fig an-even__fig--blue">
              <span className="an-even__label">CA moyen par client</span>
              <span className="an-even__value">{eur0(lt.clients.length ? lt.total / lt.clients.length : 0)}</span>
              <span className="an-even__sub">depuis le début</span>
            </div>
          </div>
          <MonthlyChart data={lt.cumulative} series={[{ key: "cumul", label: "CA cumulé", kind: "line", slot: 1 }]} unit="eur" />
          <DataTable columns={ltColumns} rows={ltRows} sort={{ key: "total", dir: "desc" }} csv="ca-par-client-depuis-le-debut" searchKeys={["name"]} total={ltTotal} />
        </Card>

        {kpis.lateCount > 0 && (
          <Card wide title="À relancer" sub="Les factures en retard de paiement, les plus anciennes d'abord.">
            <DataTable columns={LATE_COLUMNS} rows={lateRows} sort={{ key: "lateDays", dir: "desc" }} csv="factures-en-retard" />
          </Card>
        )}
      </div>

      <div className="an-folds">
        <Fold title="Tous les chiffres, période par période" sub={`CA, dépenses, bénéfice et comparaison, par ${viewLabel} ; les dépenses par poste.`}>
          <DataTable columns={periodColumns} rows={periodRows} sort={{ key: "id", dir: "desc" }} csv={`resultat-par-${an.view}`} />
          {posteRows.length > 0 && <DataTable columns={posteColumns} rows={posteRows} sort={{ key: "id", dir: "desc" }} csv={`depenses-par-poste-par-${an.view}`} />}
        </Fold>

        {expenseRows.length > 0 && (
          <Fold title="Détail des dépenses" sub={`Chaque sortie des comptes bancaires Pennylane sur ${a.label}, et son poste.`}>
            <p className="an-card__sub">
              Transferts entre nos comptes, TVA et capital d&apos;emprunt ne comptent pas ; les impôts sont à part (bénéfice avant impôts).
            </p>
            <DataTable columns={EXPENSE_COLUMNS} rows={expenseRows} sort={{ key: "date", dir: "desc" }} csv="depenses" searchKeys={["label", "poste"]} />
          </Fold>
        )}

        <Fold title={`CA par client et par ${viewLabel}`} sub="Le pivot client × période, et les mouvements mois par mois (exports CSV pour Excel).">
          <DataTable columns={pivotColumns} rows={pivotRows} csv={`ca-par-client-par-${an.view}`} searchKeys={["name"]} />
          {a.keys.length > 1 && <DataTable columns={MOVE_COLUMNS} rows={moveRows} csv="mouvements-clients" />}
        </Fold>

        <Fold title="Contrats et licences" sub="Ce que les fiches disent qu'on doit facturer chaque mois : licences, profils, partenaires, remises, conformité Pennylane.">
          <div className="an-tiles">
            <Tile icon={Icons.euro()} label="CA / mois sous contrat" value={eur0(kpis.mrr)} sub={`${kpis.clients} clients`} />
            <Tile icon={Icons.users()} label="Licences facturées" value={kpis.licences.toLocaleString("fr-FR")} sub={`${eur.format(kpis.avgPricePerLicence)} en moyenne`} />
            <Tile icon={Icons.coins()} label="Commissions / mois" value={eur0(kpis.commissions)} sub="dues aux partenaires" />
            <Tile icon={Icons.gift()} label="Remises / mois" value={eur0(kpis.discounts)} sub="manque à gagner consenti" />
            <Tile
              icon={Icons.checkCircle()}
              label="Conformité Pennylane"
              value={kpis.controlled ? `${Math.round((kpis.conformes / kpis.controlled) * 100)} %` : "—"}
              sub={kpis.controlled ? `${kpis.conformes} / ${kpis.controlled} fiches` : undefined}
              tone={kpis.controlled && kpis.conformes === kpis.controlled ? "ok" : kpis.controlled ? "warn" : undefined}
            />
          </div>
          <h3 className="an-fold__h">Attendu face à facturé</h3>
          <RevenueChart data={bill.series} />
          <ValidationStrip months={bill.series.map((m) => ({ month: m.month, billed: m.clients, validated: m.validated }))} />
          <h3 className="an-fold__h">Clients sous contrat</h3>
          <DataTable
            columns={CLIENT_COLUMNS}
            rows={contractRows}
            sort={{ key: "caHT", dir: "desc" }}
            csv="clients-factures"
            searchKeys={["name", "partner"]}
            total={{ name: "Total", licences: kpis.licences, caHT: kpis.mrr, discount: kpis.discounts, commission: kpis.commissions, lateAmount: kpis.lateAmount }}
          />
          <div className="an-grid">
            <Card title="Par profil de licence" sub="CA HT / mois par profil, prix facturé moyen face au prix catalogue.">
              <ProfileChart data={bill.byProfile} />
              <DataTable columns={PROFILE_COLUMNS} rows={bill.byProfile.filter((p) => p.licences > 0)} sort={{ key: "caHT", dir: "desc" }} />
            </Card>
            <Card title="Par partenaire apporteur" sub="CA apporté et commission mensuelle due.">
              <PartnerChart data={bill.byPartner} />
              <DataTable columns={PARTNER_COLUMNS} rows={bill.byPartner} sort={{ key: "caHT", dir: "desc" }} csv="ca-par-partenaire" />
            </Card>
            <Card title="Modes de paiement" sub="Part du CA HT / mois par mode de règlement.">
              <ShareBar data={bill.byPaymentMethod} />
            </Card>
            <Card title="Périodicité de facturation" sub="Nombre de clients par rythme de facture.">
              <ShareBar data={bill.byBillingPeriod} valueKey="count" unit="int" />
            </Card>
          </div>
          <h3 className="an-fold__h">Remises consenties</h3>
          <DataTable columns={DISCOUNT_COLUMNS} rows={discountRows} sort={{ key: "lossPerMonth", dir: "desc" }} csv="remises" searchKeys={["client", "profile"]} emptyText="Aucune remise sur les fiches facturées." />
          {kpis.lateCount > 0 && (
            <>
              <h3 className="an-fold__h">Retards par ancienneté</h3>
              <AgingChart data={bill.aging} />
            </>
          )}
          <p className="an-card__sub">
            Le contrôle mois par mois se fait dans <Link href="/admin/facturation">Facturation → Rapprochement</Link>.
          </p>
        </Fold>
      </div>
    </>
  );
}

export default async function BillingView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const sp = await view.searchParams;
  // Les contrats (repliés en bas) se lisent sur 12 mois ; le haut de l'écran suit ses propres réglages.
  const months = 12;

  let analytics: BillingAnalytics | null = null;
  let history: RevenueHistory | null = null;
  let historyAnalysis: HistoryAnalysis | null = null;
  let pennylaneNote: string | null = null;
  let expenses: Expense[] = [];
  let expenseNote: string | null = null;

  if (hasAdminRole(user)) {
    const [clients, partners, axonaut] = await Promise.all([
      payload.find({
        collection: "partner-clients",
        limit: 5000,
        depth: 0,
        draft: true,
        overrideAccess: true,
        select: {
          companyName: true,
          clientStatus: true,
          contractStartDate: true,
          resiliationDate: true,
          partner: true,
          paymentMethod: true,
          billingPeriod: true,
          licences: true,
          history: true,
        } as never,
      }),
      payload.find({
        collection: "partners",
        limit: 1000,
        depth: 0,
        overrideAccess: true,
        select: { displayName: true, commissionRate: true } as never,
      }),
      payload.find({
        collection: "axonaut-invoices",
        pagination: false,
        depth: 0,
        overrideAccess: true,
        select: { month: true, client: true, clientName: true, recurringHT: true, servicesHT: true, lines: true } as never,
      }),
    ]);

    // Pennylane est un plus : sans token ou en panne, l'écran vit sur les fiches.
    let report: BillingReport | null = null;
    if (!isPennylaneConfigured()) {
      pennylaneNote = "Pennylane n'est pas connecté : factures, impayés et conformité ne sont pas disponibles.";
    } else {
      try {
        report = await loadBillingReport(payload);
      } catch (err) {
        pennylaneNote = `${pennylaneErrorMessage(err)} Les chiffres ci-dessous viennent des fiches seules.`;
      }
    }

    // Le nom de la fiche plutôt que celui de la facture (« Pro11 » et « Groupe Viriate Services » sont un seul client).
    const nameOf = new Map((clients.docs as ClientDoc[]).map((c) => [String(c.id), c.companyName ?? "—"]));
    const legacy: LegacyInvoice[] = (axonaut.docs as unknown as (LegacyInvoice & { lines?: AxonautLine[] | null })[]).map(({ lines, ...i }) => ({
      ...i,
      clientName: (i.client != null && nameOf.get(String(i.client))) || i.clientName,
      setupHT: splitServices(lines ?? [], i.servicesHT).setupHT,
    }));
    const legacyInvoiced = new Map<string, number>();
    for (const i of legacy) legacyInvoiced.set(i.month, (legacyInvoiced.get(i.month) ?? 0) + i.recurringHT + i.servicesHT);
    // Une facture trimestrielle est lissée sur ses trois mois, d'après la périodicité de la fiche.
    const periodOf = new Map((clients.docs as ClientDoc[]).map((c) => [String(c.id), billingPeriodMonths(c.billingPeriod)]));
    const pennylane: PennylaneInvoice[] = (report?.checks ?? []).flatMap((c) =>
      c.invoices
        .filter((i) => i.date && i.state !== "annulee")
        .map((i) => ({ date: i.date, amountHT: i.amountHT, client: c.client.id, clientName: c.client.name, months: periodOf.get(String(c.client.id)) ?? 1 })),
    );

    // Les dépenses : les relevés bancaires Pennylane, rangés par poste (règles de TIM d'abord).
    ({ expenses, note: expenseNote } = await loadExpenses());

    const now = new Date();
    analytics = buildBillingAnalytics(clients.docs as ClientDoc[], partners.docs as PartnerDoc[], report, months, now, legacyInvoiced);
    history = buildRevenueHistory(legacy, pennylane, now, expenses);
    historyAnalysis = analyzeHistory(history, sp);
  }

  return (
    <AnalyticsPage view={view} page="facturation" title="Facturation">
      {analytics && history && historyAnalysis && (
        <Dashboard bill={analytics} h={history} an={historyAnalysis} expenses={expenses} notes={[pennylaneNote, expenseNote].filter((n): n is string => n != null)} />
      )}
    </AnalyticsPage>
  );
}
