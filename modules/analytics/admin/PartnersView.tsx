import type { AdminViewServerProps } from "payload";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { CountBars, MonthlyChart, ShareBar } from "@/modules/analytics/admin/charts";
import { DataTable, type Column, type Row } from "@/modules/analytics/admin/DataTable";
import { Card, PeriodFilter, periodFrom, Tile } from "@/modules/analytics/admin/ui";
import { buildPartnersAnalytics, type OrderRow, type PartnerClientRow, type PartnerRow, type PartnersAnalytics, type PointRow, type SubmissionRow } from "@/modules/analytics/lib/partners";
import { eur } from "@/modules/partner/lib/format";

/**
 * Écran « Analyses → Partenaires » (/admin/analyses/partenaires) : ce que le
 * réseau apporte (opportunités, clients, CA, commissions) et ce que le
 * programme de points produit.
 */

const PARTNER_COLUMNS: Column[] = [
  { key: "name", label: "Partenaire" },
  { key: "model", label: "Modèle" },
  { key: "opportunities", label: "Opportunités", format: "int" },
  { key: "won", label: "Gagnées", format: "int" },
  { key: "lost", label: "Perdues", format: "int" },
  { key: "conversion", label: "Conversion", format: "pct" },
  { key: "activeClients", label: "Clients actifs", format: "int" },
  { key: "licences", label: "Licences", format: "int" },
  { key: "caHT", label: "CA HT / mois", format: "eur" },
  { key: "commissionRate", label: "Taux", format: "pct" },
  { key: "commission", label: "Commission / mois", format: "eur" },
  { key: "points", label: "Points", format: "int" },
  { key: "missions", label: "Missions", format: "int" },
  { key: "orders", label: "Récompenses", format: "int" },
];

function Report({ a, months }: { a: PartnersAnalytics; months: number }) {
  const { kpis } = a;
  return (
    <>
      <PeriodFilter page="partenaires" months={months} />
      <div className="an-tiles">
        <Tile icon={Icons.partner()} label="Partenaires" value={String(kpis.partners)} sub={`${kpis.contributing} ont apporté une opportunité sur la période`} />
        <Tile icon={Icons.inbox()} label="Opportunités apportées" value={String(kpis.opportunities.current)} delta={kpis.opportunities} sub="sur la période" />
        <Tile icon={Icons.checkCircle()} label="Clients gagnés" value={String(kpis.won.current)} delta={kpis.won} tone="ok" sub="démarrés sur la période" />
        <Tile icon={Icons.euro()} label="CA HT / mois apporté" value={eur.format(kpis.caHT)} sub={`${eur.format(kpis.commission)} de commissions / mois`} />
        <Tile icon={Icons.coins()} label="Points distribués" value={kpis.pointsIssued.current.toLocaleString("fr-FR")} delta={kpis.pointsIssued} sub={`${kpis.pointsSpent.current.toLocaleString("fr-FR")} dépensés`} />
        <Tile icon={Icons.mission()} label="À traiter" value={String(kpis.pendingSubmissions + kpis.pendingOrders)} sub={`${kpis.pendingSubmissions} mission${kpis.pendingSubmissions > 1 ? "s" : ""} · ${kpis.pendingOrders} commande${kpis.pendingOrders > 1 ? "s" : ""}`} tone={kpis.pendingSubmissions + kpis.pendingOrders ? "warn" : "ok"} />
      </div>
      <div className="an-grid">
        <Card wide title="Apports et points par mois" sub="Opportunités apportées, clients gagnés (au démarrage du contrat) et points distribués.">
          <MonthlyChart data={a.monthly} series={[{ key: "opportunities", label: "Opportunités" }, { key: "won", label: "Clients gagnés" }, { key: "points", label: "Points distribués", kind: "line" }]} />
        </Card>
        <Card title="CA apporté par modèle de partenariat" sub="Apporteur d'affaires, revendeur, revendeur + S.A.V.">
          <ShareBar data={a.byModel.map((m) => ({ key: m.key, label: m.label, count: m.count, caHT: m.caHT }))} />
        </Card>
        <Card title="Points distribués par source" sub="D'où viennent les points sur la période.">
          <CountBars data={a.pointsBySource.map((p) => ({ key: p.key, label: p.label, count: p.points }))} />
        </Card>
        <Card wide title="Par partenaire" sub="Tout ce qu'un partenaire apporte et reçoit, sur la période (CA et commission : les clients actifs aujourd'hui).">
          <DataTable columns={PARTNER_COLUMNS} rows={a.partners.map((p): Row => ({ ...p, href: `/admin/collections/partners/${p.id}` }))} sort={{ key: "caHT", dir: "desc" }} csv="partenaires" searchKeys={["name", "model"]} />
        </Card>
      </div>
    </>
  );
}

export default async function PartnersView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const months = periodFrom(await view.searchParams);

  let analytics: PartnersAnalytics | null = null;
  if (hasAdminRole(user)) {
    const find = (collection: string, select: Record<string, boolean>) =>
      payload.find({ collection: collection as never, limit: 10000, depth: 0, overrideAccess: true, select: select as never });
    const [partners, clients, points, submissions, orders] = await Promise.all([
      find("partners", { displayName: true, type: true, partnershipModel: true, commissionRate: true, joinedAt: true, createdAt: true }),
      payload.find({ collection: "partner-clients", limit: 5000, depth: 0, draft: true, overrideAccess: true, select: { partner: true, clientStatus: true, createdAt: true, contractStartDate: true, licences: true } as never }),
      find("point-transactions", { partner: true, delta: true, source: true, createdAt: true }),
      find("mission-submissions", { partner: true, status: true, createdAt: true }),
      find("reward-orders", { partner: true, status: true, cost: true, createdAt: true }),
    ]);
    analytics = buildPartnersAnalytics(
      partners.docs as PartnerRow[],
      clients.docs as PartnerClientRow[],
      points.docs as PointRow[],
      submissions.docs as SubmissionRow[],
      orders.docs as OrderRow[],
      months,
      new Date(),
    );
  }

  return (
    <AnalyticsPage view={view} page="partenaires" title="Partenaires">
      {analytics && <Report a={analytics} months={months} />}
    </AnalyticsPage>
  );
}
