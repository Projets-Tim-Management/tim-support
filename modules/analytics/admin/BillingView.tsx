import type { AdminViewServerProps } from "payload";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { AgingChart, PartnerChart, PeriodCompareChart, ProfileChart, RevenueChart, ShareBar } from "@/modules/analytics/admin/charts";
import { HistoryControls } from "@/modules/analytics/admin/HistoryControls";
import { ValidationStrip } from "@/modules/analytics/admin/ValidationStrip";
import { DataTable, type Column, type Row } from "@/modules/analytics/admin/DataTable";
import { Card, clientHref, fmtDay, Pct, PeriodFilter, periodFrom, Tile } from "@/modules/analytics/admin/ui";
import { buildBillingAnalytics, type BillingAnalytics, type ClientDoc, type PartnerDoc } from "@/modules/analytics/lib/billing";
import { delta, type Delta } from "@/modules/analytics/lib/growth";
import {
  buildRevenueHistory,
  comparePeriods,
  HISTORY_DURATIONS,
  historySelection,
  type LegacyInvoice,
  type PennylaneInvoice,
  type PeriodComparison,
  type RevenueHistory,
} from "@/modules/analytics/lib/revenue-history";

type HistorySelection = ReturnType<typeof historySelection>;
import type { BillingReport } from "@/modules/partner/lib/billing-check";
import { loadBillingReport } from "@/modules/partner/lib/billing-report";
import { eur } from "@/modules/partner/lib/format";
import { isPennylaneConfigured, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Écran « Analyses → Facturation » (/admin/analyses/facturation).
 *
 * Ce que les fiches disent qu'on doit facturer chaque mois, ce qui a
 * réellement été facturé (Axonaut jusqu'en septembre 2026, Pennylane ensuite)
 * et encaissé, et comment ça se répartit : par profil de licence, par
 * partenaire apporteur, par mode de paiement, dans le temps.
 *
 * Server component : la Local API pour les fiches et partenaires, le rapport
 * de rapprochement (Pennylane en cache) pour les factures et les écarts. Les
 * graphiques et tableaux sont des client components alimentés en données
 * déjà calculées — aucune fonction ne franchit la frontière serveur/client.
 */

/**
 * Évolution : trois grandeurs × trois horizons. Le CA compare des sommes
 * (flux) ; licences et clients comparent l'état en fin de période (stock).
 */
function GrowthTable({ a }: { a: BillingAnalytics }) {
  const g = a.growth;
  const fmt = (d: Delta, kind: "eur" | "int") => (kind === "eur" ? eur.format(d.current) : d.current.toLocaleString("fr-FR"));
  const prev = (d: Delta, kind: "eur" | "int") =>
    d.pct == null ? undefined : `${kind === "eur" ? eur.format(d.previous) : d.previous} sur la période précédente`;
  const lines: { label: string; kind: "eur" | "int"; pick: (h: typeof g.month) => Delta }[] = [
    { label: "CA HT", kind: "eur", pick: (h) => h.ca },
    { label: "Licences", kind: "int", pick: (h) => h.licences },
    { label: "Clients facturés", kind: "int", pick: (h) => h.clients },
  ];
  const horizons: { label: string; sub: string; h: typeof g.month }[] = [
    { label: "Mois", sub: "vs mois précédent", h: g.month },
    { label: "Trimestre", sub: "3 mois vs 3 mois d'avant", h: g.quarter },
    { label: "Année", sub: "12 mois vs 12 mois d'avant", h: g.year },
  ];
  return (
    <div className="an-scroll">
      <table className="an-table an-growth">
        <thead>
          <tr>
            <th />
            {horizons.map((h) => (
              <th key={h.label} className="an-num">
                <span className="an-th an-th--static">
                  {h.label}
                  <span className="an-growth__sub">{h.sub}</span>
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.label} className="an-row">
              <td className="an-growth__label">{l.label}</td>
              {horizons.map((h) => {
                const d = l.pick(h.h);
                return (
                  <td key={h.label} className="an-num">
                    <span className="an-growth__cell" title={prev(d, l.kind)}>
                      <span className="an-growth__value">{fmt(d, l.kind)}</span>
                      <Pct d={d} />
                    </span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

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

const monthName = (k: string) => new Date(`${k}-01T00:00:00Z`).toLocaleDateString("fr-FR", { month: "short", year: "2-digit", timeZone: "UTC" });

const STATUS_TONES = { nouveau: "ok", hausse: "ok", stable: "muted", baisse: "warn", parti: "bad", prestations: "muted" } as const;
const STATUS_LABELS = { nouveau: "Nouveau", hausse: "Hausse", stable: "Stable", baisse: "Baisse", parti: "Parti", prestations: "Prestations seules" };

const names = (list: string[]) => (list.length ? list.join(", ") : "aucun");

/**
 * Le passé, sur une période choisie (1, 3, 6 ou 12 mois) et comparée à une
 * autre : CA facturé, moyenne, licences en fin de période, clients — puis le
 * détail client par client, les mouvements et le pivot mois par mois.
 * Le choix vit dans l'URL (`hd`, `hf`, `hc`), à part du filtre du haut.
 */
function History({ h, sel, cmp }: { h: RevenueHistory; sel: HistorySelection; cmp: PeriodComparison }) {
  const { a, b } = cmp;
  const partial = b != null && b.covered < cmp.months;
  // Un total ne se compare qu'à un total complet ; la moyenne par mois, toujours.
  const vs = (cur: number, prev: number | undefined, evenIfPartial = true) => (b && prev != null && (evenIfPartial || !partial) ? delta(cur, prev) : undefined);
  const vsTitle = b ? `face à ${b.label}` : undefined;

  const note = sel.bOutOfRange
    ? "Pas de période à comparer : l'historique commence en janvier 2025."
    : partial
      ? `${b!.label} n'est couverte que sur ${b!.covered} mois sur ${cmp.months} (l'historique commence en janvier 2025) : son total est partiel, comparez plutôt la moyenne par mois.`
      : null;

  const clientColumns: Column[] = b
    ? [
        { key: "name", label: "Client" },
        { key: "since", label: "Client depuis" },
        { key: "recurringA", label: `Licences ${a.label}`, format: "eur" },
        { key: "recurringB", label: `Licences ${b.label}`, format: "eur" },
        { key: "diff", label: "Écart", format: "eur" },
        { key: "pct", label: "Écart %", format: "pct" },
        { key: "status", label: "Évolution", format: "badge", tones: STATUS_TONES, labels: STATUS_LABELS },
        { key: "servicesA", label: `Prestations ${a.label}`, format: "eur" },
        { key: "servicesB", label: `Prestations ${b.label}`, format: "eur" },
      ]
    : [
        { key: "name", label: "Client" },
        { key: "since", label: "Client depuis" },
        { key: "recurringA", label: "Licences HT", format: "eur" },
        { key: "servicesA", label: "Prestations HT", format: "eur" },
        { key: "totalA", label: "Total HT", format: "eur" },
      ];
  const clientRows: Row[] = cmp.clients.map((c) => ({
    id: c.id,
    name: c.name,
    since: c.firstMonth ? monthName(c.firstMonth) : null,
    recurringA: c.recurringA,
    recurringB: c.recurringB,
    diff: c.diff,
    pct: c.pct,
    status: c.status,
    servicesA: c.servicesA,
    servicesB: c.servicesB,
    totalA: c.recurringA + c.servicesA,
    ...(c.clientId != null ? { href: clientHref(c.clientId) } : {}),
  }));
  const total: Row = b
    ? { name: "Total", recurringA: a.recurring, recurringB: b.recurring, diff: a.recurring - b.recurring, servicesA: a.services, servicesB: b.services }
    : { name: "Total", recurringA: a.recurring, servicesA: a.services, totalA: a.total };

  // Le pivot couvre les deux périodes, dans l'ordre du calendrier.
  const pivotKeys = [...new Set([...(b?.keys ?? []), ...a.keys])].filter((k) => h.months.some((m) => m.key === k)).sort();
  const pivotColumns: Column[] = [{ key: "name", label: "Client" }, ...pivotKeys.map((k): Column => ({ key: `m${k}`, label: monthName(k), format: "eur" }))];
  const pivotRows: Row[] = h.clients
    .filter((c) => pivotKeys.some((k) => c.byMonth[k]))
    .map((c) => ({
      id: c.id,
      name: c.name,
      ...Object.fromEntries(pivotKeys.map((k) => [`m${k}`, c.byMonth[k] ?? null])),
      ...(c.clientId != null ? { href: clientHref(c.clientId) } : {}),
    }));
  const moveRows: Row[] = h.months
    .filter((m) => a.keys.includes(m.key))
    .reverse()
    .map((m) => ({ ...m, id: m.key, label: monthName(m.key) }));

  return (
    <>
      <Card
        wide
        title="CA facturé par période"
        sub="Axonaut jusqu'en septembre 2026, Pennylane ensuite (ses factures comptent comme licences). Pro11 compté au prix régularisé (419,40 € par mois). Historique depuis janvier 2025."
      >
        <HistoryControls
          durations={HISTORY_DURATIONS}
          months={sel.months}
          end={sel.end}
          compare={sel.compare}
          endOptions={sel.endOptions}
          compareOptions={sel.compareOptions}
        />
        {note && <p className="an-note">{note}</p>}
        <div className="an-tiles">
          <Tile
            icon={Icons.euro()}
            label={`CA HT facturé · ${a.label}`}
            value={eur.format(a.total)}
            sub={a.services ? `dont ${eur.format(a.services)} de prestations` : "licences seules"}
            delta={vs(a.total, b?.total, false)}
            deltaTitle={vsTitle}
          />
          {cmp.months > 1 && <Tile icon={Icons.coins()} label="Moyenne par mois" value={eur.format(a.avgMonthly)} sub={b ? `${eur.format(b.avgMonthly)} sur ${b.label}` : undefined} delta={vs(a.avgMonthly, b?.avgMonthly)} deltaTitle={vsTitle} />}
          <Tile
            icon={Icons.clock()}
            label="Licences du dernier mois"
            value={eur.format(a.endRecurring)}
            sub={b ? `${eur.format(b.endRecurring)} à la fin de ${b.label}` : "le récurrent en fin de période"}
            delta={vs(a.endRecurring, b?.endRecurring)}
            deltaTitle={vsTitle}
          />
          <Tile
            icon={Icons.users()}
            label="Clients facturés"
            value={a.clients.toLocaleString("fr-FR")}
            sub={`${a.gained.length} nouveau${a.gained.length > 1 ? "x" : ""} · ${a.lost.length} parti${a.lost.length > 1 ? "s" : ""}`}
            delta={vs(a.clients, b?.clients, false)}
            deltaTitle={vsTitle}
          />
        </div>
        {(a.gained.length > 0 || a.lost.length > 0) && (
          <p className="an-card__sub">
            Nouveaux : {names(a.gained)} · Partis : {names(a.lost)}
          </p>
        )}
        {cmp.months > 1 && <PeriodCompareChart data={cmp.chart} aLabel={a.label} bLabel={b?.label ?? null} />}
      </Card>

      <Card
        wide
        title="CA par client"
        sub={
          b
            ? `Licences de ${a.label} face à ${b.label}, client par client ; les prestations à part. Cliquez un nom pour ouvrir la fiche.`
            : `Ce qui a été facturé sur ${a.label}, client par client. Cliquez un nom pour ouvrir la fiche.`
        }
      >
        <DataTable columns={clientColumns} rows={clientRows} sort={{ key: "recurringA", dir: "desc" }} csv="ca-par-client" searchKeys={["name"]} total={total} />
      </Card>

      {cmp.months > 1 && (
        <Card wide title="Mouvements de clients" sub="Chaque mois de la période face au précédent, sur les licences seules : clients nouveaux ou plus facturés, hausses et baisses chez les autres. Le plus récent en haut.">
          <DataTable columns={MOVE_COLUMNS} rows={moveRows} csv="mouvements-clients" />
        </Card>
      )}

      <Card wide title="CA par client, mois par mois" sub={`HT facturé (licences et prestations), un mois par colonne${b ? ", les deux périodes" : ""}. L'export CSV s'ouvre dans Excel.`}>
        <DataTable columns={pivotColumns} rows={pivotRows} csv="ca-par-client-par-mois" searchKeys={["name"]} />
      </Card>
    </>
  );
}

function Report({ a, h, sel, cmp, months, pennylaneNote }: { a: BillingAnalytics; h: RevenueHistory; sel: HistorySelection; cmp: PeriodComparison; months: number; pennylaneNote: string | null }) {
  const { kpis } = a;
  const clientRows: Row[] = a.clients.map((c) => ({ ...c, href: clientHref(c.id) }));
  const discountRows: Row[] = a.discounts.map((d, i) => ({ ...d, id: `${d.clientId}-${i}`, href: clientHref(d.clientId) }));
  const lateRows: Row[] = a.late.map((l) => ({ ...l, href: clientHref(l.clientId) }));
  const conformity = kpis.controlled ? `${kpis.conformes} / ${kpis.controlled} fiches conformes` : undefined;

  return (
    <>
      <PeriodFilter page="facturation" months={months} />

      {pennylaneNote && <p className="an-note">{pennylaneNote}</p>}

      <div className="an-tiles">
        <Tile
          icon={Icons.euro()}
          label="CA HT / mois sous contrat"
          value={eur.format(kpis.mrr)}
          sub={
            kpis.startingSoon === 0
              ? `${kpis.clients} client${kpis.clients > 1 ? "s" : ""} facturé${kpis.clients > 1 ? "s" : ""}`
              : kpis.startingSoon === kpis.clients
                ? `${kpis.clients} clients · facturation dès le ${fmtDay(kpis.nextStart)}`
                : `${kpis.clients} clients, dont ${kpis.startingSoon} à démarrer (${fmtDay(kpis.nextStart)})`
          }
          delta={a.growth.month.ca}
        />
        <Tile icon={Icons.users()} label="Licences facturées" value={kpis.licences.toLocaleString("fr-FR")} sub={`${eur.format(kpis.avgPricePerLicence)} en moyenne`} delta={a.growth.month.licences} />
        <Tile icon={Icons.coins()} label="Commissions / mois" value={eur.format(kpis.commissions)} sub="dues aux partenaires" />
        <Tile icon={Icons.gift()} label="Remises / mois" value={eur.format(kpis.discounts)} sub="manque à gagner consenti" tone={kpis.discounts > 0 ? "warn" : undefined} />
        <Tile icon={Icons.clock()} label="Paiements en retard" value={eur.format(kpis.lateAmount)} sub={`${kpis.lateCount} facture${kpis.lateCount > 1 ? "s" : ""}`} tone={kpis.lateCount ? "bad" : "ok"} />
        <Tile icon={Icons.checkCircle()} label="Conformité Pennylane" value={kpis.controlled ? `${Math.round((kpis.conformes / kpis.controlled) * 100)} %` : "—"} sub={conformity} tone={kpis.controlled && kpis.conformes === kpis.controlled ? "ok" : kpis.controlled ? "warn" : undefined} />
      </div>

      <div className="an-grid">
        <Card
          wide
          title="Chiffre d'affaires mensuel"
          sub="Ce que les fiches disent qu'on doit facturer chaque mois — à partir du démarrage de l'abonnement Pennylane de chaque client — face à ce qui a été facturé : Axonaut jusqu'en septembre 2026, Pennylane ensuite. Les deux en € HT, sur une seule échelle. Dessous : ce qui est signé sur le rapprochement, mois par mois — le reste n'est qu'un attendu."
        >
          <RevenueChart data={a.series} />
          <ValidationStrip months={a.series.map((m) => ({ month: m.month, billed: m.clients, validated: m.validated }))} />
        </Card>

        <History h={h} sel={sel} cmp={cmp} />

        <Card wide title="Évolution" sub="Variation du CA, des licences et des clients facturés : sur un mois, un trimestre, un an. Survolez une case pour la valeur d'avant.">
          <GrowthTable a={a} />
        </Card>

        <Card title="Par profil de licence" sub="CA HT / mois par profil, prix facturé moyen face au prix catalogue.">
          <ProfileChart data={a.byProfile} />
          <DataTable columns={PROFILE_COLUMNS} rows={a.byProfile.filter((p) => p.licences > 0)} sort={{ key: "caHT", dir: "desc" }} />
        </Card>

        <Card title="Par partenaire apporteur" sub="CA apporté et commission mensuelle due, au taux de chaque partenaire.">
          <PartnerChart data={a.byPartner} />
          <DataTable columns={PARTNER_COLUMNS} rows={a.byPartner} sort={{ key: "caHT", dir: "desc" }} csv="ca-par-partenaire" />
        </Card>

        <Card title="Modes de paiement" sub="Part du CA HT / mois par mode de règlement.">
          <ShareBar data={a.byPaymentMethod} />
        </Card>

        <Card title="Périodicité de facturation" sub="Nombre de clients par rythme de facture.">
          <ShareBar data={a.byBillingPeriod} valueKey="count" unit="int" />
        </Card>

        <Card wide title="Clients sous contrat" sub="Une ligne par client gagné avec une date de démarrage (celle de l'abonnement Pennylane dès qu'il existe). Cliquez un nom pour ouvrir la fiche.">
          <DataTable
            columns={CLIENT_COLUMNS}
            rows={clientRows}
            sort={{ key: "caHT", dir: "desc" }}
            csv="clients-factures"
            searchKeys={["name", "partner"]}
            total={{ name: "Total", licences: kpis.licences, caHT: kpis.mrr, discount: kpis.discounts, commission: kpis.commissions, lateAmount: kpis.lateAmount }}
          />
        </Card>

        <Card title="Paiements en retard par ancienneté" sub="Reste dû TTC, par tranche de jours depuis l'échéance.">
          <AgingChart data={a.aging} />
        </Card>

        <Card title="Factures en retard" sub="Les plus anciennes d'abord.">
          <DataTable columns={LATE_COLUMNS} rows={lateRows} sort={{ key: "lateDays", dir: "desc" }} csv="factures-en-retard" emptyText="Aucun paiement en retard." />
        </Card>

        <Card wide title="Remises consenties" sub="Chaque ligne de licences remisée, et ce qu'elle coûte chaque mois par rapport au prix catalogue.">
          <DataTable columns={DISCOUNT_COLUMNS} rows={discountRows} sort={{ key: "lossPerMonth", dir: "desc" }} csv="remises" searchKeys={["client", "profile"]} emptyText="Aucune remise sur les fiches facturées." />
        </Card>
      </div>
    </>
  );
}

export default async function BillingView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const sp = await view.searchParams;
  const months = periodFrom(sp);

  let analytics: BillingAnalytics | null = null;
  let history: RevenueHistory | null = null;
  let selection: HistorySelection | null = null;
  let comparison: PeriodComparison | null = null;
  let pennylaneNote: string | null = null;

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
        select: { month: true, client: true, clientName: true, recurringHT: true, servicesHT: true } as never,
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
    const legacy: LegacyInvoice[] = (axonaut.docs as unknown as LegacyInvoice[]).map((i) => ({
      ...i,
      clientName: (i.client != null && nameOf.get(String(i.client))) || i.clientName,
    }));
    const legacyInvoiced = new Map<string, number>();
    for (const i of legacy) legacyInvoiced.set(i.month, (legacyInvoiced.get(i.month) ?? 0) + i.recurringHT + i.servicesHT);
    const pennylane: PennylaneInvoice[] = (report?.checks ?? []).flatMap((c) =>
      c.invoices.filter((i) => i.date && i.state !== "annulee").map((i) => ({ date: i.date, amountHT: i.amountHT, client: c.client.id, clientName: c.client.name })),
    );

    const now = new Date();
    analytics = buildBillingAnalytics(clients.docs as ClientDoc[], partners.docs as PartnerDoc[], report, months, now, legacyInvoiced);
    history = buildRevenueHistory(legacy, pennylane, now);
    selection = historySelection(history, sp);
    comparison = comparePeriods(history, selection.months, selection.end, selection.bEnd);
  }

  return (
    <AnalyticsPage view={view} page="facturation" title="Facturation">
      {analytics && history && selection && comparison && <Report a={analytics} h={history} sel={selection} cmp={comparison} months={months} pennylaneNote={pennylaneNote} />}
    </AnalyticsPage>
  );
}
