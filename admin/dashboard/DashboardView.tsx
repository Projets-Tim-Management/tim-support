import type { AdminViewServerProps } from "payload";

import { Gutter } from "@payloadcms/ui";
import Link from "next/link";

import { TicketNotifications } from "@/modules/support/admin/TicketNotifications";

import Donut from "./charts/Donut";
import HBars from "./charts/HBars";
import Meter from "./charts/Meter";
import MiniArea from "./charts/MiniArea";
import { getDashboardData } from "./data";
import { bytes, compact, duration, euros } from "./format";
import { Icons } from "./icons";
import QuickActions from "./QuickActions";
import StatTile from "./StatTile";

const STATUS_COLOR: Record<string, string> = {
  new: "var(--tim-blue)",
  acknowledged: "var(--tim-purple)",
  in_progress: "var(--tim-amber)",
  on_hold: "var(--tim-slate)",
  resolved: "var(--tim-green)",
};

/** Vue tableau de bord custom (admin.components.views.dashboard). Server
 *  component : lit les métriques via la Local API au rendu (aucun fetch client). */
export default async function DashboardView({ initPageResult }: AdminViewServerProps) {
  // La vue dashboard est déjà rendue DANS le template admin (nav + header) :
  // on ne réenveloppe PAS dans DefaultTemplate (sinon double menu).
  const { req } = initPageResult;
  const { payload } = req;
  const adminRoute = payload.config.routes.admin;

  const d = await getDashboardData(req);
  const t = (q: string) => `${adminRoute}/collections/tickets?${q}`;

  return (
    <Gutter>
      <div className="dash">
        <header className="dash__header">
          <div>
            <h1 className="dash__title">Tableau de bord</h1>
            <p className="dash__subtitle">Vue d&apos;ensemble — ce qui demande votre attention aujourd&apos;hui.</p>
          </div>
          <QuickActions adminRoute={adminRoute} />
        </header>

        {/* Notifications : bandeau des tickets qui demandent une action. */}
        <TicketNotifications />

          {/* ── SUPPORT ─────────────────────────────────────────────── */}
          <section className="dash__section">
            <h2 className="dash__section-title">
              <span className="dash__section-icon">{Icons.ticket()}</span> Support
            </h2>
            <div className="dash__kpis">
              <StatTile
                icon={Icons.reply()}
                label="Réponses client non lues"
                value={compact(d.support.unreadReplies)}
                href={t("where[unreadClientReply][equals]=true")}
                tone={d.support.unreadReplies > 0 ? "danger" : "default"}
              />
              <StatTile
                icon={Icons.inbox()}
                label="Nouveaux à traiter"
                value={compact(d.support.newToHandle)}
                href={t("where[and][0][needsAttention][equals]=true&where[and][1][status][not_equals]=resolved")}
                tone={d.support.newToHandle > 0 ? "warn" : "default"}
              />
              <StatTile
                icon={Icons.alert()}
                label="Urgents ouverts"
                value={compact(d.support.urgentOpen)}
                href={t("where[and][0][priority][equals]=urgent&where[and][1][status][not_equals]=resolved")}
                tone={d.support.urgentOpen > 0 ? "danger" : "default"}
              />
              <StatTile
                icon={Icons.check()}
                label="Résolus (30 j)"
                value={compact(d.support.resolved30)}
                delta={d.support.resolvedDelta}
                goodWhenUp
                href={t("where[status][equals]=resolved")}
              />
              <StatTile
                icon={Icons.clock()}
                label="Délai moyen de résolution"
                value={duration(d.support.avgResolutionHours)}
                sub="sur les 30 derniers jours"
              />
            </div>
            <div className="dash__charts dash__charts--2">
              <div className="dash-card">
                <div className="dash-card__head">
                  <h3 className="dash-card__title">Tickets créés — 30 jours</h3>
                  <span className="dash-card__meta">
                    {compact(d.support.created30)} total
                  </span>
                </div>
                <MiniArea data={d.support.createdSeries} unit="tickets" />
              </div>
              <div className="dash-card">
                <div className="dash-card__head">
                  <h3 className="dash-card__title">Répartition par statut</h3>
                </div>
                <Donut
                  slices={d.support.statusDist.map((s) => ({ ...s, color: STATUS_COLOR[s.key] }))}
                  centerLabel="tickets"
                />
              </div>
            </div>
            {d.support.recentUnread.length > 0 && (
              <div className="dash-card">
                <div className="dash-card__head">
                  <h3 className="dash-card__title">Dernières réponses client</h3>
                </div>
                <ul className="dash-list">
                  {d.support.recentUnread.map((r) => (
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

          {/* ── PARTENAIRES ─────────────────────────────────────────── */}
          <section className="dash__section">
            <h2 className="dash__section-title">
              <span className="dash__section-icon">{Icons.partner()}</span> Partenaires
            </h2>
            <div className="dash__kpis">
              <StatTile
                icon={Icons.partner()}
                label="Partenaires actifs"
                value={compact(d.partners.active)}
                sub={`${d.partners.metier} métier · ${d.partners.user} utilisateur`}
                href={`${adminRoute}/collections/partners?where[status][equals]=active`}
              />
              <StatTile
                icon={Icons.euro()}
                label="CA payé HT / mois"
                value={euros(d.partners.caMonthly)}
                tone="accent"
                href={`${adminRoute}/collections/partner-clients`}
              />
              <StatTile
                icon={Icons.coins()}
                label="Points en circulation"
                value={compact(d.partners.pointsCirculation)}
                sub="solde cumulé"
              />
              <StatTile
                icon={Icons.mission()}
                label="Soumissions en attente"
                value={compact(d.partners.pendingSubmissions)}
                tone={d.partners.pendingSubmissions > 0 ? "warn" : "default"}
                href={`${adminRoute}/collections/mission-submissions?where[status][equals]=pending`}
              />
              <StatTile
                icon={Icons.gift()}
                label="Commandes à traiter"
                value={compact(d.partners.pendingOrders)}
                tone={d.partners.pendingOrders > 0 ? "warn" : "default"}
                href={`${adminRoute}/collections/reward-orders?where[status][equals]=pending`}
              />
            </div>
            <div className="dash__charts dash__charts--2">
              <div className="dash-card">
                <div className="dash-card__head">
                  <h3 className="dash-card__title">Top partenaires — CA payé HT / mois</h3>
                </div>
                <HBars rows={d.partners.topCA.map((p) => ({ label: p.name, value: p.ca }))} format={euros} />
              </div>
              <div className="dash-card">
                <div className="dash-card__head">
                  <h3 className="dash-card__title">Points émis par source — 30 j</h3>
                </div>
                <HBars
                  rows={d.partners.pointsBySource.map((p) => ({ label: p.label, value: p.points }))}
                  format={(v) => `${compact(v)} pts`}
                />
              </div>
            </div>
          </section>

          {/* ── ÉDITORIAL ───────────────────────────────────────────── */}
          <section className="dash__section">
            <h2 className="dash__section-title">
              <span className="dash__section-icon">{Icons.feature()}</span> Éditorial
            </h2>
            <div className="dash__kpis">
              <StatTile
                icon={Icons.feature()}
                label="Features publiées"
                value={compact(d.editorial.featuresPublished)}
                sub={`${d.editorial.featuresDraft} brouillon${d.editorial.featuresDraft > 1 ? "s" : ""}`}
                href={`${adminRoute}/collections/features?where[_status][equals]=published`}
              />
              <StatTile
                icon={Icons.parcours()}
                label="Parcours publiés"
                value={compact(d.editorial.parcoursPublished)}
                href={`${adminRoute}/collections/parcours`}
              />
              <StatTile
                icon={Icons.smile()}
                label="Avis utiles"
                value={d.editorial.satisfaction.pct != null ? `${d.editorial.satisfaction.pct}%` : "—"}
                sub={`${compact(d.editorial.satisfaction.helpful + d.editorial.satisfaction.notHelpful)} votes`}
              />
            </div>
            <div className="dash__charts dash__charts--2">
              <div className="dash-card">
                <div className="dash-card__head">
                  <h3 className="dash-card__title">Features par disponibilité</h3>
                </div>
                <HBars rows={d.editorial.availability.map((a) => ({ label: a.label, value: a.count }))} />
              </div>
              <div className="dash-card">
                <div className="dash-card__head">
                  <h3 className="dash-card__title">Satisfaction (avis « utile »)</h3>
                </div>
                <Meter
                  pct={d.editorial.satisfaction.pct}
                  caption={`${compact(d.editorial.satisfaction.helpful)} utiles / ${compact(d.editorial.satisfaction.notHelpful)} pas utiles`}
                />
              </div>
            </div>
          </section>

          {/* ── SYSTÈME ─────────────────────────────────────────────── */}
          <section className="dash__section">
            <h2 className="dash__section-title">
              <span className="dash__section-icon">{Icons.users()}</span> Système
            </h2>
            <div className="dash__kpis">
              <StatTile
                icon={Icons.users()}
                label="Utilisateurs"
                value={compact(d.system.users)}
                sub={`${d.system.usersAdmin} admin · ${d.system.usersPartner} partenaire`}
                href={`${adminRoute}/collections/users`}
              />
              <StatTile
                icon={Icons.media()}
                label="Médias"
                value={compact(d.system.media)}
                sub={bytes(d.system.mediaWeight)}
                href={`${adminRoute}/collections/media`}
              />
            </div>
          </section>
        </div>
      </Gutter>
  );
}
