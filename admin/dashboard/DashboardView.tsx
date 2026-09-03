import type { AdminViewServerProps } from "payload";

import { Gutter } from "@payloadcms/ui";

import { hasAdminRole, isPartner, isPartnerMetier, isSupport, partnerIdOf } from "@/core/access";
import { TicketNotifications } from "@/modules/support/admin/TicketNotifications";

import HBars from "./charts/HBars";
import Meter from "./charts/Meter";
import { getDashboardData, getSupportMetrics } from "./data";
import { getTodayAgenda } from "./data-agenda";
import { getPartnerMetrics } from "./data-partner";
import { bytes, compact, euros } from "./format";
import { Icons } from "./icons";
import AgendaBoard from "./AgendaBoard";
import PartnerSection from "./PartnerSection";
import QuickActions from "./QuickActions";
import StatTile from "./StatTile";
import SupportSection from "./SupportSection";

/** Vue tableau de bord custom (admin.components.views.dashboard). Server
 *  component : lit les métriques via la Local API au rendu (aucun fetch client).
 *  Le contenu est SCOPÉ par rôle (admin = tout ; support = tickets ; partenaire
 *  = sa fiche) — les données globales restent réservées aux admins. */
export default async function DashboardView({ initPageResult }: AdminViewServerProps) {
  // La vue dashboard est déjà rendue DANS le template admin (nav + header) :
  // on ne réenveloppe PAS dans DefaultTemplate (sinon double menu).
  const { req } = initPageResult;
  const { payload, user } = req;
  const adminRoute = payload.config.routes.admin;

  // ── Rôles non-admin : vue restreinte à leur périmètre ──────────────────────
  if (!hasAdminRole(user)) {
    // Support : périmètre tickets (il les voit tous, pas de données partenaires).
    if (isSupport(user)) {
      const support = await getSupportMetrics(req);
      return (
        <Gutter>
          <div className="dash">
            <header className="dash__header">
              <div>
                <h1 className="dash__title">Support</h1>
                <p className="dash__subtitle">Ce qui demande votre attention aujourd&apos;hui.</p>
              </div>
            </header>
            <TicketNotifications />
            <SupportSection support={support} adminRoute={adminRoute} />
          </div>
        </Gutter>
      );
    }

    // Partenaire : vue scopée STRICTEMENT à sa fiche.
    const partnerId = partnerIdOf(user);
    if (isPartner(user) && partnerId != null) {
      const m = await getPartnerMetrics(req, partnerId, isPartnerMetier(user));
      return (
        <Gutter>
          <div className="dash">
            <header className="dash__header">
              <div>
                <h1 className="dash__title">Mon tableau de bord</h1>
                <p className="dash__subtitle">Votre activité en un coup d&apos;œil.</p>
              </div>
            </header>
            <PartnerSection m={m} adminRoute={adminRoute} />
          </div>
        </Gutter>
      );
    }

    // Rôle sans périmètre défini : accueil neutre (jamais de données globales).
    return (
      <Gutter>
        <div className="dash">
          <header className="dash__header">
            <div>
              <h1 className="dash__title">Bienvenue</h1>
              <p className="dash__subtitle">Utilisez le menu à gauche pour accéder à vos données.</p>
            </div>
          </header>
        </div>
      </Gutter>
    );
  }

  // ── Admin / super-admin : tableau de bord global complet ───────────────────
  /**
   * L'un APRÈS l'autre, jamais en parallèle.
   *
   * Le pooler Supabase plafonne à 15 clients, et `getDashboardData` sature déjà
   * sa part en cadençant ses lectures par lots de cinq (voir data.ts). Lancer
   * l'agenda en même temps ajoutait trois connexions par-dessus : le tableau de
   * bord rendait un 500 sur une requête sans rapport — celle des préférences —
   * parce qu'il ne restait plus de connexion à lui donner.
   *
   * Le coût est quelques dizaines de millisecondes ; le bénéfice est une page
   * qui s'affiche.
   */
  const d = await getDashboardData(req);
  const agenda = await getTodayAgenda(req, adminRoute);

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

        {/* En tête : le mois à gauche, les actions du jour à côté. Ce qui est à
            HEURE FIXE passe avant ce qui attend — un rendez-vous manqué ne se
            rattrape pas, un ticket si. */}
        <AgendaBoard items={agenda.items} retard={agenda.retard} now={agenda.now} />

        {/* Notifications : bandeau des tickets qui demandent une action. */}
        <TicketNotifications />

        {/* ── SUPPORT ─────────────────────────────────────────────── */}
        <SupportSection support={d.support} adminRoute={adminRoute} />

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
