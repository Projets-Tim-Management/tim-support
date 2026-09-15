import type { AdminViewServerProps } from "payload";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { CountBars, MonthlyChart } from "@/modules/analytics/admin/charts";
import { DataTable, type Column, type Row } from "@/modules/analytics/admin/DataTable";
import { Card, fmtDays, PeriodFilter, periodFrom, Tile } from "@/modules/analytics/admin/ui";
import { buildSupportAnalytics, PRIORITY_LABELS, type ClientName, type SupportAnalytics, type TicketRow } from "@/modules/analytics/lib/support";

/**
 * Écran « Analyses → Support » (/admin/analyses/support) : le volume de
 * tickets, d'où ils viennent, sur quoi, résolus en combien de temps — et ceux
 * qui restent ouverts, les plus anciens en tête.
 */

const PRIORITY_TONES = { urgent: "bad", high: "warn", normal: "muted", low: "muted" } as const;

const OPEN_COLUMNS: Column[] = [
  { key: "number", label: "N°", format: "int", align: "right" },
  { key: "subject", label: "Sujet" },
  { key: "company", label: "Client" },
  { key: "status", label: "Statut" },
  { key: "priority", label: "Priorité", format: "badge", tones: PRIORITY_TONES, labels: PRIORITY_LABELS },
  { key: "ageDays", label: "Âge (j)", format: "int" },
];
const CLIENT_COLUMNS: Column[] = [
  { key: "client", label: "Client" },
  { key: "total", label: "Tickets", format: "int" },
  { key: "open", label: "Ouverts", format: "int" },
  { key: "avgResolutionDays", label: "Résolution moyenne (j)", format: "int" },
];
const RESOLUTION_COLUMNS: Column[] = [
  { key: "label", label: "Priorité" },
  { key: "count", label: "Résolus", format: "int" },
  { key: "avgDays", label: "Délai moyen (j)", format: "int" },
];

function Report({ a, months }: { a: SupportAnalytics; months: number }) {
  const { kpis } = a;
  return (
    <>
      <PeriodFilter page="support" months={months} />
      <div className="an-tiles">
        <Tile icon={Icons.ticket()} label="Tickets reçus" value={String(kpis.created.current)} delta={kpis.created} goodWhenUp={false} sub="sur la période" />
        <Tile icon={Icons.checkCircle()} label="Tickets résolus" value={String(kpis.resolved.current)} delta={kpis.resolved} tone="ok" />
        <Tile icon={Icons.inbox()} label="Ouverts aujourd'hui" value={String(kpis.openNow)} sub={kpis.urgentOpen ? `dont ${kpis.urgentOpen} urgent${kpis.urgentOpen > 1 ? "s" : ""}` : "aucun urgent"} tone={kpis.urgentOpen ? "bad" : undefined} />
        <Tile icon={Icons.clock()} label="Délai de résolution moyen" value={fmtDays(kpis.avgResolutionDays)} sub={kpis.medianResolutionDays != null ? `médiane ${fmtDays(kpis.medianResolutionDays)}` : undefined} />
        <Tile icon={Icons.check()} label="Résolus sous 48 h" value={kpis.under48h != null ? `${kpis.under48h} %` : "—"} tone={kpis.under48h != null ? (kpis.under48h >= 70 ? "ok" : "warn") : undefined} />
      </div>

      <div className="an-grid">
        <Card wide title="Reçus et résolus par mois" sub="Quand la courbe des résolus passe sous celle des reçus, la file s'allonge.">
          <MonthlyChart data={a.monthly} series={[{ key: "created", label: "Reçus" }, { key: "resolved", label: "Résolus", kind: "line" }]} />
        </Card>
        <Card title="Par service" sub="Sur quoi portent les tickets de la période.">
          <CountBars data={a.byService} />
        </Card>
        <Card title="Par type" sub="Assistance, suggestion, autre.">
          <CountBars data={a.byType} />
        </Card>
        <Card title="Par priorité" sub="Priorité déclarée sur les tickets de la période.">
          <CountBars data={a.byPriority} />
        </Card>
        <Card title="Délai de résolution par priorité" sub="Un ticket urgent doit être résolu plus vite qu'un ticket normal : c'est ici que ça se vérifie.">
          <DataTable columns={RESOLUTION_COLUMNS} rows={a.resolutionByPriority} />
        </Card>
        <Card title="Par client" sub="Qui sollicite le plus le support, et en combien de temps on lui répond.">
          <DataTable columns={CLIENT_COLUMNS} rows={a.byClient.map((c): Row => ({ ...c, id: c.key }))} sort={{ key: "total", dir: "desc" }} csv="tickets-par-client" searchKeys={["client"]} />
        </Card>
        <Card title="Par statut" sub="Où en sont les tickets de la période.">
          <CountBars data={a.byStatus} />
        </Card>
        <Card wide title="Tickets ouverts" sub="Les plus anciens d'abord.">
          <DataTable columns={OPEN_COLUMNS} rows={a.open.map((t): Row => ({ ...t, needsAttention: t.needsAttention ? 1 : 0, href: `/admin/collections/tickets/${t.id}` }))} sort={{ key: "ageDays", dir: "desc" }} csv="tickets-ouverts" searchKeys={["subject", "company"]} emptyText="Aucun ticket ouvert." />
        </Card>
      </div>
    </>
  );
}

export default async function SupportView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const months = periodFrom(await view.searchParams, 3);

  let analytics: SupportAnalytics | null = null;
  if (hasAdminRole(user)) {
    const [tickets, clients] = await Promise.all([
      payload.find({
        collection: "tickets",
        limit: 10000,
        depth: 0,
        overrideAccess: true,
        select: { number: true, subject: true, status: true, priority: true, type: true, service: true, company: true, client: true, createdAt: true, resolvedAt: true, needsAttention: true } as never,
      }),
      payload.find({ collection: "partner-clients", limit: 5000, depth: 0, draft: true, overrideAccess: true, select: { companyName: true } as never }),
    ]);
    analytics = buildSupportAnalytics(tickets.docs as TicketRow[], clients.docs as ClientName[], months, new Date());
  }

  return (
    <AnalyticsPage view={view} page="support" title="Support">
      {analytics && <Report a={analytics} months={months} />}
    </AnalyticsPage>
  );
}
