import Link from "next/link";

import Donut from "./charts/Donut";
import MiniArea from "./charts/MiniArea";
import type { DashboardData } from "./data";
import { compact, duration } from "./format";
import { Icons } from "./icons";
import StatTile from "./StatTile";

const STATUS_COLOR: Record<string, string> = {
  new: "var(--tim-blue)",
  acknowledged: "var(--tim-purple)",
  in_progress: "var(--tim-amber)",
  on_hold: "var(--tim-slate)",
  resolved: "var(--tim-green)",
};

/** Section « Support » du tableau de bord — partagée entre l'admin et le rôle support. */
export default function SupportSection({
  support,
  adminRoute,
}: {
  support: DashboardData["support"];
  adminRoute: string;
}) {
  const t = (q: string) => `${adminRoute}/collections/tickets?${q}`;
  return (
    <section className="dash__section">
      <h2 className="dash__section-title">
        <span className="dash__section-icon">{Icons.ticket()}</span> Support
      </h2>
      <div className="dash__kpis">
        <StatTile
          icon={Icons.reply()}
          label="Réponses client non lues"
          value={compact(support.unreadReplies)}
          href={t("where[unreadClientReply][equals]=true")}
          tone={support.unreadReplies > 0 ? "danger" : "default"}
        />
        <StatTile
          icon={Icons.inbox()}
          label="Nouveaux à traiter"
          value={compact(support.newToHandle)}
          href={t("where[and][0][needsAttention][equals]=true&where[and][1][status][not_equals]=resolved")}
          tone={support.newToHandle > 0 ? "warn" : "default"}
        />
        <StatTile
          icon={Icons.alert()}
          label="Urgents ouverts"
          value={compact(support.urgentOpen)}
          href={t("where[and][0][priority][equals]=urgent&where[and][1][status][not_equals]=resolved")}
          tone={support.urgentOpen > 0 ? "danger" : "default"}
        />
        <StatTile
          icon={Icons.check()}
          label="Résolus (30 j)"
          value={compact(support.resolved30)}
          delta={support.resolvedDelta}
          goodWhenUp
          href={t("where[status][equals]=resolved")}
        />
        <StatTile
          icon={Icons.clock()}
          label="Délai moyen de résolution"
          value={duration(support.avgResolutionHours)}
          sub="sur les 30 derniers jours"
        />
      </div>
      <div className="dash__charts dash__charts--2">
        <div className="dash-card">
          <div className="dash-card__head">
            <h3 className="dash-card__title">Tickets créés — 30 jours</h3>
            <span className="dash-card__meta">{compact(support.created30)} total</span>
          </div>
          <MiniArea data={support.createdSeries} unit="tickets" />
        </div>
        <div className="dash-card">
          <div className="dash-card__head">
            <h3 className="dash-card__title">Répartition par statut</h3>
          </div>
          <Donut
            slices={support.statusDist.map((s) => ({ ...s, color: STATUS_COLOR[s.key] }))}
            centerLabel="tickets"
          />
        </div>
      </div>
      {support.recentUnread.length > 0 && (
        <div className="dash-card">
          <div className="dash-card__head">
            <h3 className="dash-card__title">Dernières réponses client</h3>
          </div>
          <ul className="dash-list">
            {support.recentUnread.map((r) => (
              <li key={String(r.id)}>
                <Link className="dash-list__row" href={`${adminRoute}/collections/tickets/${r.id}`}>
                  <span className="dash-list__title">
                    {r.number ? `#${r.number} · ` : ""}
                    {r.subject || "(sans sujet)"}
                  </span>
                  <span className="dash-list__meta">{r.who || "—"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
