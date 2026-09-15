import type { AdminViewServerProps } from "payload";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { CountBars, FlowChart, FunnelChart, MonthlyChart } from "@/modules/analytics/admin/charts";
import { DataTable, type Column } from "@/modules/analytics/admin/DataTable";
import { Card, fmtDays, PeriodFilter, periodFrom, Tile } from "@/modules/analytics/admin/ui";
import { buildPipelineAnalytics, type Activity, type PartnerName, type PipelineAnalytics, type PipelineClient } from "@/modules/analytics/lib/pipeline";
import { eur } from "@/modules/partner/lib/format";

/**
 * Écran « Analyses → Clients & pipeline » (/admin/analyses/pipeline).
 *
 * D'où viennent les opportunités, jusqu'où elles vont, combien de temps
 * elles restent à chaque étape, pourquoi elles se perdent — et ce que ça
 * donne par source et par partenaire. La chronologie vient du journal des
 * fiches (« Étape : A → B »).
 */

const SEGMENT_COLUMNS: Column[] = [
  { key: "label", label: "" },
  { key: "total", label: "Opportunités", format: "int" },
  { key: "won", label: "Gagnées", format: "int" },
  { key: "lost", label: "Perdues", format: "int" },
  { key: "open", label: "En cours", format: "int" },
  { key: "conversion", label: "Conversion", format: "pct" },
  { key: "avgDaysToWin", label: "Délai moyen → gagnée (j)", format: "int" },
];

const STAGE_COLUMNS: Column[] = [
  { key: "label", label: "Étape" },
  { key: "passed", label: "Passages terminés", format: "int" },
  { key: "avgDays", label: "Durée moyenne (j)", format: "int" },
  { key: "medianDays", label: "Médiane (j)", format: "int" },
  { key: "openNow", label: "Actuellement", format: "int" },
  { key: "openAvgDays", label: "Ancienneté moyenne (j)", format: "int" },
];

function Report({ a, months }: { a: PipelineAnalytics; months: number }) {
  const { kpis } = a;
  const pipelineValue = a.open.reduce((s, o) => s + o.caHT, 0);
  return (
    <>
      <PeriodFilter page="pipeline" months={months} />

      <div className="an-tiles">
        <Tile icon={Icons.inbox()} label="Opportunités créées" value={String(kpis.created.current)} delta={kpis.created} sub="sur la période" />
        <Tile icon={Icons.checkCircle()} label="Affaires gagnées" value={String(kpis.won.current)} delta={kpis.won} sub={kpis.conversion != null ? `${kpis.conversion} % des créées sur la période` : undefined} tone="ok" />
        <Tile icon={Icons.alert()} label="Affaires perdues" value={String(kpis.lost.current)} delta={kpis.lost} goodWhenUp={false} tone={kpis.lost.current ? "warn" : undefined} />
        <Tile icon={Icons.clock()} label="Délai moyen lead → gagnée" value={fmtDays(kpis.avgDaysToWin)} sub={kpis.medianDaysToWin != null ? `médiane ${fmtDays(kpis.medianDaysToWin)}` : "aucune affaire gagnée datée"} />
        <Tile icon={Icons.partner()} label="En cours dans le pipeline" value={String(kpis.open)} sub={`${eur.format(pipelineValue)} HT / mois potentiels`} />
        <Tile icon={Icons.users()} label="Clients actifs" value={String(kpis.activeClients)} sub={kpis.churned.current ? `${kpis.churned.current} résilié${kpis.churned.current > 1 ? "s" : ""} sur la période` : "aucune résiliation sur la période"} tone={kpis.churned.current ? "bad" : "ok"} />
      </div>

      <div className="an-grid">
        <Card wide title="Entonnoir de conversion" sub="Parmi les opportunités créées sur la période, combien sont arrivées au moins à chaque étape — et le taux de passage d'une étape à la suivante.">
          <FunnelChart steps={a.funnel} />
        </Card>

        <Card title="Temps passé à chaque étape" sub="Durée des passages terminés (toutes fiches), et ancienneté de celles qui y sont encore.">
          <CountBars data={a.stages.filter((s) => s.avgDays != null).map((s) => ({ key: s.key, label: s.label, count: s.avgDays ?? 0, color: s.color }))} unit="days" colorByKey />
          <DataTable columns={STAGE_COLUMNS} rows={a.stages} sort={{ key: "avgDays", dir: "desc" }} />
        </Card>

        <Card title="Parcours réels entre étapes" sub="Chaque passage d'étape enregistré dans le journal des fiches, d'où il part et où il va. L'épaisseur, c'est le nombre de fiches.">
          <FlowChart nodes={a.flow.nodes} links={a.flow.links} />
        </Card>

        <Card wide title="Créées, gagnées, perdues par mois" sub="Une affaire est « gagnée » au mois de son passage à ce statut ; « perdue », au mois de la clôture.">
          <MonthlyChart data={a.monthly} series={[{ key: "created", label: "Créées" }, { key: "won", label: "Gagnées" }, { key: "lost", label: "Perdues" }]} />
        </Card>

        <Card title="Par provenance" sub="Ce que chaque provenance donne, sur les opportunités créées sur la période.">
          <DataTable columns={SEGMENT_COLUMNS} rows={a.bySource} sort={{ key: "total", dir: "desc" }} csv="pipeline-par-provenance" />
        </Card>

        <Card title="Par partenaire apporteur" sub="Même lecture, partenaire par partenaire.">
          <DataTable columns={SEGMENT_COLUMNS} rows={a.byPartner} sort={{ key: "total", dir: "desc" }} csv="pipeline-par-partenaire" />
        </Card>

        <Card title="Motifs de perte" sub="Affaires perdues créées sur la période.">
          <CountBars data={a.lossReasons} />
        </Card>

        <Card title="Motifs de résiliation" sub="Clients résiliés ou archivés, toutes périodes.">
          <CountBars data={a.churnReasons} />
        </Card>
      </div>
    </>
  );
}

export default async function PipelineView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const months = periodFrom(await view.searchParams);

  let analytics: PipelineAnalytics | null = null;
  if (hasAdminRole(user)) {
    const [clients, activities, partners] = await Promise.all([
      payload.find({
        collection: "partner-clients",
        limit: 5000,
        depth: 0,
        draft: true,
        overrideAccess: true,
        select: {
          companyName: true,
          clientStatus: true,
          createdAt: true,
          source: true,
          partner: true,
          lossReason: true,
          signatureDate: true,
          contractStartDate: true,
          resiliationDate: true,
          headcount: true,
          licences: true,
        } as never,
      }),
      payload.find({
        collection: "client-activities",
        where: { type: { equals: "systeme" }, title: { like: "Étape :" } },
        limit: 20000,
        depth: 0,
        overrideAccess: true,
        select: { client: true, occurredAt: true, title: true } as never,
      }),
      payload.find({ collection: "partners", limit: 1000, depth: 0, overrideAccess: true, select: { displayName: true } as never }),
    ]);
    analytics = buildPipelineAnalytics(
      clients.docs as PipelineClient[],
      activities.docs as Activity[],
      partners.docs as PartnerName[],
      months,
      new Date(),
    );
  }

  return (
    <AnalyticsPage view={view} page="pipeline" title="Clients & pipeline">
      {analytics && <Report a={analytics} months={months} />}
    </AnalyticsPage>
  );
}
