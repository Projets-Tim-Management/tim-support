import type { AdminViewServerProps } from "payload";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { CountBars, MonthlyChart } from "@/modules/analytics/admin/charts";
import { DataTable, type Column, type Row } from "@/modules/analytics/admin/DataTable";
import { Card, fmtDays, PeriodFilter, periodFrom, Tile } from "@/modules/analytics/admin/ui";
import { buildDevAnalytics, type ClientName, type DevAnalytics, type DevRow, type DevStatusRow } from "@/modules/analytics/lib/dev";

/**
 * Écran « Analyses → Développements » (/admin/analyses/developpements) : ce
 * qui entre, ce qui sort, en combien de temps, et pour qui.
 */

const CLIENT_COLUMNS: Column[] = [
  { key: "client", label: "Client demandeur" },
  { key: "count", label: "Demandes", format: "int" },
  { key: "delivered", label: "Livrées", format: "int" },
];

function Report({ a, months }: { a: DevAnalytics; months: number }) {
  const { kpis } = a;
  return (
    <>
      <PeriodFilter page="developpements" months={months} />
      <div className="an-tiles">
        <Tile icon={Icons.inbox()} label="Demandes reçues" value={String(kpis.created.current)} delta={kpis.created} sub="sur la période" />
        <Tile icon={Icons.checkCircle()} label="Livrées" value={String(kpis.delivered.current)} delta={kpis.delivered} tone="ok" />
        <Tile icon={Icons.feature()} label="Dans le flux" value={String(kpis.inFlow)} sub="entrée, étude ou réalisation" />
        <Tile icon={Icons.clock()} label="Délai demande → livraison" value={fmtDays(kpis.avgLeadTimeDays)} sub={kpis.medianLeadTimeDays != null ? `médiane ${fmtDays(kpis.medianLeadTimeDays)}` : undefined} />
        <Tile icon={Icons.clock()} label="Durée de réalisation" value={fmtDays(kpis.avgBuildDays)} sub="du démarrage à la livraison" />
        <Tile icon={Icons.reply()} label="Livraisons annoncées" value={kpis.announcedShare != null ? `${kpis.announcedShare} %` : "—"} sub="aux demandeurs" tone={kpis.announcedShare != null && kpis.announcedShare < 100 ? "warn" : undefined} />
      </div>
      <div className="an-grid">
        <Card wide title="Reçues et livrées par mois" sub="Ce qui entre face à ce qui sort.">
          <MonthlyChart data={a.monthly} series={[{ key: "created", label: "Reçues" }, { key: "delivered", label: "Livrées", kind: "line" }]} />
        </Card>
        <Card title="Par phase" sub="Où en sont tous les développements, aujourd'hui.">
          <CountBars data={a.byPhase} />
        </Card>
        <Card title="Par statut" sub="Le détail des phases.">
          <CountBars data={a.byStatus} />
        </Card>
        <Card title="Par type" sub="Demandes reçues sur la période.">
          <CountBars data={a.byType} />
        </Card>
        <Card title="Par priorité" sub="Demandes reçues sur la période.">
          <CountBars data={a.byPriority} />
        </Card>
        <Card title="Par client demandeur" sub="Qui demande le plus, et ce qui lui a été livré.">
          <DataTable columns={CLIENT_COLUMNS} rows={a.byClient.map((c): Row => ({ ...c, id: c.key }))} sort={{ key: "count", dir: "desc" }} csv="developpements-par-client" />
        </Card>
      </div>
    </>
  );
}

export default async function DevView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const months = periodFrom(await view.searchParams, 6);

  let analytics: DevAnalytics | null = null;
  if (hasAdminRole(user)) {
    const [devs, statuses, clients] = await Promise.all([
      payload.find({
        collection: "developments",
        limit: 10000,
        depth: 0,
        overrideAccess: true,
        select: { title: true, type: true, priority: true, status: true, createdAt: true, startedAt: true, deliveredAt: true, announcedAt: true, demandCount: true, opportunities: true } as never,
      }),
      payload.find({ collection: "dev-statuses", limit: 100, depth: 0, overrideAccess: true, select: { name: true, phase: true } as never }),
      payload.find({ collection: "partner-clients", limit: 5000, depth: 0, draft: true, overrideAccess: true, select: { companyName: true } as never }),
    ]);
    analytics = buildDevAnalytics(devs.docs as DevRow[], statuses.docs as DevStatusRow[], clients.docs as ClientName[], months, new Date());
  }

  return (
    <AnalyticsPage view={view} page="developpements" title="Développements">
      {analytics && <Report a={analytics} months={months} />}
    </AnalyticsPage>
  );
}
