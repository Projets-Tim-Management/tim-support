import Link from "next/link";

import type { PartnerMetrics } from "./data-partner";
import { compact, euros } from "./format";
import { Icons } from "./icons";
import StatTile from "./StatTile";

/** Tableau de bord réduit d'un partenaire connecté (scopé à sa fiche). */
export default function PartnerSection({ m, adminRoute }: { m: PartnerMetrics; adminRoute: string }) {
  const clients = `${adminRoute}/collections/partner-clients`;

  if (m.isMetier) {
    return (
      <section className="dash__section">
        <h2 className="dash__section-title">
          <span className="dash__section-icon">{Icons.partner()}</span> Mes clients
        </h2>
        <div className="dash__kpis">
          <StatTile
            icon={Icons.partner()}
            label="Clients actifs"
            value={compact(m.clients?.active ?? 0)}
            sub={`${m.clients?.total ?? 0} au total`}
            href={clients}
          />
          <StatTile
            icon={Icons.euro()}
            label="CA payé HT / mois"
            value={euros(m.clients?.caMonthly ?? 0)}
            tone="accent"
            href={clients}
          />
        </div>
      </section>
    );
  }

  // Partenaire-utilisateur : points, missions, récompenses.
  return (
    <section className="dash__section">
      <h2 className="dash__section-title">
        <span className="dash__section-icon">{Icons.coins()}</span> Mon activité
      </h2>
      <div className="dash__kpis">
        <StatTile icon={Icons.coins()} label="Solde de points" value={compact(m.pointsBalance)} tone="accent" />
        <StatTile
          icon={Icons.mission()}
          label="Missions en attente"
          value={compact(m.submissions.pending)}
          tone={m.submissions.pending > 0 ? "warn" : "default"}
          href={`${adminRoute}/collections/mission-submissions`}
        />
        <StatTile
          icon={Icons.check()}
          label="Missions validées"
          value={compact(m.submissions.approved)}
          href={`${adminRoute}/collections/mission-submissions`}
        />
        <StatTile
          icon={Icons.gift()}
          label="Commandes en cours"
          value={compact(m.orders.pending)}
          tone={m.orders.pending > 0 ? "warn" : "default"}
          href={`${adminRoute}/collections/reward-orders`}
        />
      </div>
      <div className="dash__charts dash__charts--2">
        <Link className="dash-card dash-card--link" href={`${adminRoute}/collections/missions`}>
          <div className="dash-card__head">
            <h3 className="dash-card__title">
              <span className="dash__section-icon">{Icons.mission()}</span> Réaliser des missions
            </h3>
          </div>
          <p className="dash-card__text">Parcourez le catalogue et gagnez des points.</p>
        </Link>
        <Link className="dash-card dash-card--link" href={`${adminRoute}/collections/rewards`}>
          <div className="dash-card__head">
            <h3 className="dash-card__title">
              <span className="dash__section-icon">{Icons.gift()}</span> Échanger mes points
            </h3>
          </div>
          <p className="dash-card__text">Découvrez les récompenses disponibles.</p>
        </Link>
      </div>
    </section>
  );
}
