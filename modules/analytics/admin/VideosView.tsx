import type { AdminViewServerProps } from "payload";
import Link from "next/link";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { DailyChart, FunnelChart } from "@/modules/analytics/admin/charts";
import { DataTable, type Column } from "@/modules/analytics/admin/DataTable";
import { Card, Tile } from "@/modules/analytics/admin/ui";
import {
  buildVideoLeads,
  buildVideosAnalytics,
  parisDay,
  type Split,
  type VideoLeadClientRow,
  type VideoLeadRow,
  type VueRow,
} from "@/modules/analytics/lib/video-views";
import {
  VIDEO_POURCENTAGE_LABELS,
  VIDEO_POURCENTAGES,
} from "@/modules/forms/lib/video-lead";
import { eur } from "@/modules/partner/lib/format";

/**
 * Écran « Analyses → Vidéos » (/admin/analyses/videos) — les vidéos de
 * démonstration du site vitrine : combien de lectures, et jusqu'où elles vont.
 *
 * Compté en base par Support (route /api/videos/vues), sans cookie ni
 * identifiant : TOUTES les lectures y sont, pas seulement celles des visiteurs
 * qui acceptent les cookies. Ce sont des lectures, pas des personnes.
 *
 * Server component : lecture directe par la Local API, aucun fetch client.
 */

const PERIODS = [7, 30, 90] as const;
const HREF = "/admin/analyses/videos";

const daysFrom = (
  sp: Record<string, string | string[] | undefined> | undefined,
): number => {
  const raw = Number(Array.isArray(sp?.j) ? sp?.j[0] : sp?.j);
  return (PERIODS as readonly number[]).includes(raw) ? raw : 30;
};

const PAGE_COLUMNS: Column[] = [
  { key: "page", label: "Page" },
  { key: "kind", label: "Type" },
  { key: "lectures", label: "Lectures", format: "int" },
  { key: "fins", label: "Jusqu'à la fin", format: "int" },
  { key: "completion", label: "Complétion", format: "pct" },
];

const SPLIT_COLUMNS: Column[] = [
  { key: "label", label: "" },
  { key: "lectures", label: "Lectures", format: "int" },
  { key: "completion", label: "Complétion", format: "pct" },
  { key: "cta", label: "Clics bouton", format: "int" },
];

const splitRows = (list: Split[]) =>
  list.map((x) => ({
    label: x.label,
    lectures: x.lectures,
    completion: x.completion,
    cta: x.cta,
  }));

export default async function VideosView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const days = daysFrom(await view.searchParams);
  const body = hasAdminRole(user) ? await content() : null;

  async function content() {
    const now = new Date();
    // La période et celle d'avant, pour comparer.
    const since = parisDay(
      new Date(now.getTime() - (2 * days - 1) * 86_400_000),
    );
    const found = await payload.find({
      collection: "video-views",
      where: { jour: { greater_than_equal: since } },
      limit: 20000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: {
        videoId: true,
        page: true,
        etape: true,
        jour: true,
        appareil: true,
        canal: true,
        nombre: true,
      },
    });
    const report = buildVideosAnalytics(found.docs as VueRow[], days, now);

    // Les demandes de démo de la période qui portent une vidéo, et ce qu'elles
    // sont devenues (l'opportunité née de chacune).
    const fromIso = new Date(now.getTime() - days * 86_400_000).toISOString();
    const subs = await payload.find({
      collection: "form-submissions",
      where: {
        and: [
          { videoId: { exists: true } },
          { createdAt: { greater_than_equal: fromIso } },
        ],
      },
      limit: 5000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: {
        videoId: true,
        videoPourcentage: true,
        videoCta: true,
        createdAt: true,
      },
    });
    const subIds = subs.docs.map((d) => d.id);
    const clients = subIds.length
      ? await payload.find({
          collection: "partner-clients",
          where: { formSubmission: { in: subIds } },
          limit: 5000,
          pagination: false,
          depth: 0,
          draft: true,
          overrideAccess: true,
          select: { formSubmission: true, clientStatus: true, caPaye: true },
        })
      : { docs: [] };
    const leads = buildVideoLeads(
      subs.docs as VideoLeadRow[],
      clients.docs as VideoLeadClientRow[],
      fromIso,
    );

    return (
      <>
        <nav className="an-filters" aria-label="Période">
          {PERIODS.map((p) => (
            <Link
              key={p}
              href={`${HREF}?j=${p}`}
              prefetch={false}
              className={`an-filter${p === days ? " an-filter--on" : ""}`}
            >
              {p} jours
            </Link>
          ))}
        </nav>

        {report.videos.length === 0 ? (
          <p className="an-empty">
            Aucune lecture sur les {days} derniers jours.
          </p>
        ) : (
          <>
            {report.videos.map((v) => {
              const lead = leads.get(v.videoId);
              const perLecture =
                lead && v.lectures.current
                  ? Math.round((lead.demandes / v.lectures.current) * 1000) / 10
                  : null;
              return (
                <section key={v.videoId} className="an-video">
                  <h2 className="an-video__title">
                    {v.videoId}
                    {v.version > 1 ? (
                      <span className="an-video__version">
                        version {v.version}
                      </span>
                    ) : null}
                  </h2>
                  <div className="an-tiles">
                    <Tile
                      icon={Icons.checkCircle()}
                      label="Taux de complétion"
                      value={v.completion == null ? "—" : `${v.completion} %`}
                      sub={
                        v.previousCompletion == null
                          ? "fins ÷ lectures"
                          : `fins ÷ lectures · ${v.previousCompletion} % la période précédente`
                      }
                      tone="ok"
                    />
                    <Tile
                      icon={Icons.inbox()}
                      label="Lectures lancées"
                      value={String(v.lectures.current)}
                      delta={v.lectures}
                      sub={
                        v.lancement == null
                          ? "affichages pas encore mesurés"
                          : `${v.lancement} % des ${v.affichages} affichages`
                      }
                    />
                    <Tile
                      icon={Icons.clock()}
                      label="Regardées jusqu'au bout"
                      value={String(v.fins)}
                    />
                    <Tile
                      icon={Icons.reply()}
                      label="Clics sur le bouton"
                      value={String(v.cta)}
                      sub={
                        v.ctaRate == null
                          ? "pour 100 lectures"
                          : `${v.ctaRate} pour 100 lectures`
                      }
                    />
                    <Tile
                      icon={Icons.checkCircle()}
                      label="Demandes de démo"
                      value={String(lead?.demandes ?? 0)}
                      sub={
                        lead
                          ? `${lead.depuisFin + lead.depuisPause} ouvertes depuis la vidéo${perLecture != null ? ` · ${new Intl.NumberFormat("fr-FR").format(perLecture)} pour 100 lectures` : ""}`
                          : "de visiteurs l'ayant regardée"
                      }
                      tone={lead?.demandes ? "ok" : undefined}
                    />
                  </div>
                  <div className="an-grid">
                    <Card
                      title="Jusqu'où vont les lectures"
                      sub="en nombre, et en part des lectures lancées"
                    >
                      <FunnelChart steps={v.funnel} />
                      <p className="an-video__hint">
                        Lectures, pas visiteurs uniques : revoir la vidéo compte
                        comme une nouvelle lecture.
                      </p>
                    </Card>
                    <Card title="Par page" sub="page produit ou page /video/…">
                      <DataTable
                        columns={PAGE_COLUMNS}
                        rows={v.pages.map((p) => ({
                          page: p.page,
                          kind:
                            p.kind === "video" ? "Page vidéo" : "Page produit",
                          lectures: p.lectures,
                          fins: p.fins,
                          completion: p.lectures
                            ? Math.round((p.fins / p.lectures) * 100)
                            : null,
                        }))}
                        sort={{ key: "lectures", dir: "desc" }}
                      />
                    </Card>
                    <Card
                      title="Demandes de démo"
                      sub="des visiteurs qui ont regardé la vidéo, puis leur devenir"
                    >
                      {lead ? (
                        <DataTable
                          columns={[
                            { key: "label", label: "" },
                            { key: "n", label: "Demandes", format: "int" },
                          ]}
                          rows={[
                            {
                              label: "Ouvertes depuis l'écran de fin",
                              n: lead.depuisFin,
                            },
                            {
                              label: "Ouvertes depuis la pause",
                              n: lead.depuisPause,
                            },
                            {
                              label: "Ouvertes ailleurs sur la page",
                              n:
                                lead.demandes -
                                lead.depuisFin -
                                lead.depuisPause,
                            },
                            ...VIDEO_POURCENTAGES.filter(
                              (p) => lead.parPourcentage[p],
                            ).map((p) => ({
                              label: `Vidéo vue : ${VIDEO_POURCENTAGE_LABELS[p].toLowerCase()}`,
                              n: lead.parPourcentage[p],
                            })),
                            { label: "Devenues clientes", n: lead.clientes },
                          ]}
                        />
                      ) : (
                        <p className="an-video__hint">
                          Aucune demande de démo après cette vidéo sur la
                          période.
                        </p>
                      )}
                      {lead?.clientes ? (
                        <p className="an-video__hint">
                          CA mensuel payé de ces clients :{" "}
                          {eur.format(lead.caPaye)} HT.
                        </p>
                      ) : null}
                    </Card>
                    <Card
                      title="Par appareil"
                      sub="mobile, tablette ou ordinateur"
                    >
                      <DataTable
                        columns={[
                          { ...SPLIT_COLUMNS[0], label: "Appareil" },
                          ...SPLIT_COLUMNS.slice(1),
                        ]}
                        rows={splitRows(v.appareils)}
                        sort={{ key: "lectures", dir: "desc" }}
                      />
                    </Card>
                    <Card title="Par canal" sub="d'où venait la visite">
                      <DataTable
                        columns={[
                          { ...SPLIT_COLUMNS[0], label: "Canal" },
                          ...SPLIT_COLUMNS.slice(1),
                        ]}
                        rows={splitRows(v.canaux)}
                        sort={{ key: "lectures", dir: "desc" }}
                      />
                    </Card>
                  </div>
                </section>
              );
            })}

            <Card
              title="Lectures par jour"
              sub={`les ${days} derniers jours, une courbe par vidéo`}
              wide
            >
              <DailyChart
                data={report.daily}
                series={report.videos.map((v) => ({
                  key: v.videoId,
                  label: v.videoId,
                  kind: "line",
                }))}
              />
            </Card>
          </>
        )}
      </>
    );
  }

  return (
    <AnalyticsPage view={view} page="videos" title="Vidéos">
      {body}
    </AnalyticsPage>
  );
}
