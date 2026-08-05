import Link from "next/link";

import Donut from "./charts/Donut";
import HBars from "./charts/HBars";
import MiniArea from "./charts/MiniArea";
import type { PartnerMetrics } from "./data-partner";
import { compact, euros } from "./format";
import { Icons } from "./icons";
import StatTile from "./StatTile";

/** Tableau de bord réduit d'un partenaire connecté (scopé à sa fiche). */
export default function PartnerSection({ m, adminRoute }: { m: PartnerMetrics; adminRoute: string }) {
  const clients = `${adminRoute}/collections/partner-clients`;

  if (m.isMetier) {
    const c = m.clients;
    // La série vaut d'être tracée seulement si l'historique porte des montants :
    // une courbe plate à zéro laisserait croire à une perte d'activité.
    const hasSeries = (c?.series ?? []).some((p) => p.ca > 0);
    const fmtMonth = (day: string) =>
      new Date(day).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });

    return (
      <section className="dash__section">
        <h2 className="dash__section-title">
          <span className="dash__section-icon">{Icons.partner()}</span> Mes clients
        </h2>
        <div className="dash__kpis">
          <StatTile
            icon={Icons.partner()}
            label="Clients actifs"
            value={compact(c?.active ?? 0)}
            sub={`${c?.total ?? 0} au total`}
            href={clients}
          />
          <StatTile
            icon={Icons.euro()}
            label="CA payé HT / mois"
            value={euros(c?.caMonthly ?? 0)}
            sub="clients actifs uniquement"
            href={clients}
          />
          <StatTile
            icon={Icons.coins()}
            label="Ma commission / mois"
            value={euros(c?.commissionMonthly ?? 0)}
            sub={c?.commissionRate ? `${c.commissionRate} % du CA` : "aucun taux défini"}
            tone="accent"
            href={clients}
          />
          <StatTile
            icon={Icons.check()}
            label="Clients signés"
            value={compact(c?.signedLast12 ?? 0)}
            sub="sur 12 mois"
            href={clients}
          />
        </div>

        <div className="dash__charts dash__charts--2">
          <div className="dash-card">
            <div className="dash-card__head">
              <h3 className="dash-card__title">CA payé HT — 12 derniers mois</h3>
            </div>
            {hasSeries ? (
              <MiniArea
                data={(c?.series ?? []).map((p) => ({
                  day: p.day,
                  count: p.ca,
                  label: fmtMonth(p.day),
                  valueLabel: euros(p.ca),
                }))}
              />
            ) : (
              <p className="dash-empty">
                L&apos;historique se construit à chaque mise à jour d&apos;un client.
              </p>
            )}
          </div>
          <div className="dash-card">
            <div className="dash-card__head">
              <h3 className="dash-card__title">Mes clients par statut</h3>
            </div>
            <Donut slices={c?.byStatus ?? []} centerLabel="clients" />
          </div>
        </div>

        <div className="dash__charts">
          <div className="dash-card">
            <div className="dash-card__head">
              <h3 className="dash-card__title">Top clients — CA payé HT / mois</h3>
            </div>
            <HBars rows={c?.top ?? []} format={euros} />
          </div>
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
