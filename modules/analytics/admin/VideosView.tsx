import type { AdminViewServerProps } from "payload";
import Link from "next/link";

import { Icons } from "@/admin/dashboard/icons";
import { hasAdminRole } from "@/core/access";
import { AnalyticsPage } from "@/modules/analytics/admin/AnalyticsPage";
import { DailyChart, FunnelChart } from "@/modules/analytics/admin/charts";
import { DataTable, type Column } from "@/modules/analytics/admin/DataTable";
import { Card, Tile } from "@/modules/analytics/admin/ui";
import { buildVideosAnalytics, parisDay, type VueRow } from "@/modules/analytics/lib/video-views";

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

const daysFrom = (sp: Record<string, string | string[] | undefined> | undefined): number => {
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

export default async function VideosView(view: AdminViewServerProps) {
  const { payload, user } = view.initPageResult.req;
  const days = daysFrom(await view.searchParams);
  const body = hasAdminRole(user) ? await content() : null;

  async function content() {
    const now = new Date();
    // La période et celle d'avant, pour comparer.
    const since = parisDay(new Date(now.getTime() - (2 * days - 1) * 86_400_000));
    const found = await payload.find({
      collection: "video-views",
      where: { jour: { greater_than_equal: since } },
      limit: 20000,
      pagination: false,
      depth: 0,
      overrideAccess: true,
      select: { videoId: true, page: true, etape: true, jour: true, nombre: true },
    });
    const report = buildVideosAnalytics(found.docs as VueRow[], days, now);

    return (
      <>
        <nav className="an-filters" aria-label="Période">
          {PERIODS.map((p) => (
            <Link key={p} href={`${HREF}?j=${p}`} prefetch={false} className={`an-filter${p === days ? " an-filter--on" : ""}`}>
              {p} jours
            </Link>
          ))}
        </nav>

        {report.videos.length === 0 ? (
          <p className="an-empty">Aucune lecture sur les {days} derniers jours.</p>
        ) : (
          <>
            {report.videos.map((v) => (
              <section key={v.videoId} className="an-video">
                <h2 className="an-video__title">{v.videoId}</h2>
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
                  <Tile icon={Icons.inbox()} label="Lectures lancées" value={String(v.lectures.current)} delta={v.lectures} />
                  <Tile icon={Icons.clock()} label="Regardées jusqu'au bout" value={String(v.fins)} />
                </div>
                <div className="an-grid">
                  <Card title="Jusqu'où vont les lectures" sub="en nombre, et en part des lectures lancées">
                    <FunnelChart steps={v.funnel} />
                    <p className="an-video__hint">Lectures, pas visiteurs uniques : revoir la vidéo compte comme une nouvelle lecture.</p>
                  </Card>
                  <Card title="Par page" sub="page produit ou page /video/…">
                    <DataTable
                      columns={PAGE_COLUMNS}
                      rows={v.pages.map((p) => ({
                        page: p.page,
                        kind: p.kind === "video" ? "Page vidéo" : "Page produit",
                        lectures: p.lectures,
                        fins: p.fins,
                        completion: p.lectures ? Math.round((p.fins / p.lectures) * 100) : null,
                      }))}
                      sort={{ key: "lectures", dir: "desc" }}
                    />
                  </Card>
                </div>
              </section>
            ))}

            <Card title="Lectures par jour" sub={`les ${days} derniers jours, une courbe par vidéo`} wide>
              <DailyChart data={report.daily} series={report.videos.map((v) => ({ key: v.videoId, label: v.videoId, kind: "line" }))} />
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
