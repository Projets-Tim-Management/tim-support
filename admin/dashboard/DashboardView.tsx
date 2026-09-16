import type { AdminViewServerProps } from "payload";

import { Gutter } from "@payloadcms/ui";

import { hasAdminRole, isPartner, isPartnerMetier, isSupport, partnerIdOf } from "@/core/access";
import { TicketNotifications } from "@/modules/support/admin/TicketNotifications";

import AgendaBoard from "./AgendaBoard";
import { getSupportMetrics } from "./data";
import { getHomeData } from "./data-home";
import { getPartnerMetrics } from "./data-partner";
import HomeHeader from "./HomeHeader";
import KeyFigures from "./KeyFigures";
import MonthlyOverview from "./MonthlyOverview";
import PartnerSection from "./PartnerSection";
import SupportSection from "./SupportSection";
import TestCards from "./TestCards";

/**
 * L'accueil du back-office (admin.components.views.dashboard). Server
 * component : tout est lu au rendu par la Local API, aucun fetch client.
 *
 * Une seule question : « qu'est-ce qui demande mon action aujourd'hui ? ».
 * Les chiffres et les graphiques ont leur place dans Analyses ; ici on ne
 * garde que ce qui bouge — voir data-home.ts pour le pourquoi.
 *
 * Le contenu est SCOPÉ par rôle : l'admin voit tout ; un partenaire-métier
 * voit le même écran, réduit à ses parcours et ses clients ; le support, ses
 * tickets ; un partenaire-utilisateur, son programme de points.
 */

/** Le prénom, pour la salutation — à défaut le nom complet, à défaut rien. */
const prenomDe = (user: unknown): string | null => {
  const u = user as { firstName?: string | null; name?: string | null } | null;
  const p = u?.firstName?.trim() || u?.name?.trim().split(/\s+/)[0] || "";
  return p || null;
};

export default async function DashboardView({ initPageResult }: AdminViewServerProps) {
  // La vue dashboard est déjà rendue DANS le template admin (nav + header) :
  // on ne réenveloppe PAS dans DefaultTemplate (sinon double menu).
  const { req } = initPageResult;
  const { payload, user } = req;
  const adminRoute = payload.config.routes.admin;
  const admin = hasAdminRole(user);

  // ── Support : périmètre tickets (il les voit tous, pas de données partenaires).
  if (!admin && isSupport(user)) {
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

  const partnerId = admin ? null : partnerIdOf(user);

  // ── Partenaire-UTILISATEUR : son programme de points, un autre écran.
  if (!admin && isPartner(user) && partnerId != null && !isPartnerMetier(user)) {
    const m = await getPartnerMetrics(req, partnerId, false);
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

  // ── Rôle sans périmètre défini : accueil neutre (jamais de données globales).
  if (!admin && !(isPartnerMetier(user) && partnerId != null)) {
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

  // ── Admin, ou partenaire-métier scopé à sa fiche : le même accueil.
  const d = await getHomeData(req, adminRoute, { admin, partnerId });

  return (
    <Gutter>
      <div className="home">
        <HomeHeader prenom={prenomDe(user)} now={d.now} agenda={d.agenda} adminRoute={adminRoute} admin={admin} />

        {/* En tête : le mois à gauche, la journée à côté — ce qui est à heure
            fixe passe avant ce qui attend. */}
        <AgendaBoard items={d.agenda.items} retard={d.agenda.retard} now={d.agenda.now} />

        {/* Puis ce qui vit, et les repères chiffrés. */}
        <TestCards tests={d.tests} showPartner={admin} />
        <KeyFigures figures={d.figures} />

        {/* Les derniers mois croisés : le CA en bâtons, les entrées en lignes. */}
        <MonthlyOverview months={d.months} />
      </div>
    </Gutter>
  );
}
