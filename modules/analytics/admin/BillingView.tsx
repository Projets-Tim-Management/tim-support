import type { AdminViewServerProps } from "payload";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { AgingChart, PartnerChart, ProfileChart, RevenueChart, ShareBar } from "@/modules/analytics/admin/charts";
import { ValidationStrip } from "@/modules/analytics/admin/ValidationStrip";
import { DataTable, type Column, type Row } from "@/modules/analytics/admin/DataTable";
import { Card, clientHref, fmtDay, Pct, PeriodFilter, periodFrom, Tile } from "@/modules/analytics/admin/ui";
import { buildBillingAnalytics, type BillingAnalytics, type ClientDoc, type PartnerDoc } from "@/modules/analytics/lib/billing";
import type { Delta } from "@/modules/analytics/lib/growth";
import type { BillingReport } from "@/modules/partner/lib/billing-check";
import { loadBillingReport } from "@/modules/partner/lib/billing-report";
import { eur } from "@/modules/partner/lib/format";
import { isPennylaneConfigured, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Écran « Analyses → Facturation » (/admin/analyses/facturation).
 *
 * Ce que les fiches disent qu'on doit facturer chaque mois, ce que Pennylane a
 * réellement émis et encaissé, et comment ça se répartit : par profil de
 * licence, par partenaire apporteur, par mode de paiement, dans le temps.
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

function Report({ a, months, pennylaneNote }: { a: BillingAnalytics; months: number; pennylaneNote: string | null }) {
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
          sub="Ce que les fiches disent qu'on doit facturer chaque mois — à partir du démarrage de l'abonnement Pennylane de chaque client — face à ce que Pennylane a émis. Les deux en € HT, sur une seule échelle. Dessous : ce qui est signé sur le rapprochement, mois par mois — le reste n'est qu'un attendu."
        >
          <RevenueChart data={a.series} />
          <ValidationStrip months={a.series.map((m) => ({ month: m.month, billed: m.clients, validated: m.validated }))} />
        </Card>

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
  const months = periodFrom(await view.searchParams);

  let analytics: BillingAnalytics | null = null;
  let pennylaneNote: string | null = null;

  if (hasAdminRole(user)) {
    const [clients, partners] = await Promise.all([
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

    analytics = buildBillingAnalytics(clients.docs as ClientDoc[], partners.docs as PartnerDoc[], report, months, new Date());
  }

  return (
    <AnalyticsPage view={view} page="facturation" title="Facturation">
      {analytics && <Report a={analytics} months={months} pennylaneNote={pennylaneNote} />}
    </AnalyticsPage>
  );
}
