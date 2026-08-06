import Link from "next/link";

import Donut from "./charts/Donut";
import HBars from "./charts/HBars";
import MiniArea from "./charts/MiniArea";
import type { PartnerMetrics } from "./data-partner";
import { compact, euros, plain } from "./format";
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

  // ── Partenaire-utilisateur : « où j'en suis, ce que je peux avoir, quoi faire »
  // Ordre voulu : le solde et la progression vers la prochaine récompense en
  // tête (c'est ce qui motive), l'action ensuite, le suivi administratif en bas.
  const u = m.user;
  // Objectif mis en avant = la PROCHAINE récompense atteignable : c'est elle qui
  // fait agir, et une barre de progression n'a de sens que si le but est proche.
  // Les gros lots, eux, ont leur vitrine dédiée (le carrousel plus bas) — inutile
  // de les répéter ici. Repli sur le lot phare quand tout est déjà accessible.
  const goal = u?.nextReward ?? u?.topReward ?? null;
  const progress =
    goal && goal.cost > 0 ? Math.min(100, Math.round((m.pointsBalance / goal.cost) * 100)) : 100;

  return (
    <>
      {/* ── Accroche + solde + objectif visuel ───────────────────────────── */}
      <section className="dash__section">
        <div className="pu-hero">
          <div className="pu-hero__pitch">
            <p className="pu-hero__eyebrow">Programme partenaire TIM</p>
            <h2 className="pu-hero__headline">
              Vos missions se transforment en <span>cadeaux</span>.
            </h2>
            <p className="pu-hero__pitch-text">
              Réalisez une mission, cumulez des points, choisissez votre récompense.
            </p>

            <div className="pu-hero__balance">
              <span className="pu-hero__value">
                {plain(m.pointsBalance)}
                <small>points</small>
              </span>
              {u && u.earned > 0 && (
                <span className="pu-hero__sub">{plain(u.earned)} gagnés depuis le début</span>
              )}
            </div>

            <Link className="pu-cta" href={`${adminRoute}/collections/missions`}>
              Gagner des points →
            </Link>
          </div>

          {/* L'objectif suivant, en image : un cadeau qu'on voit donne plus envie
              qu'un intitulé. */}
          {goal ? (
            <div className="pu-goal">
              <span className="pu-goal__visual">
                {goal.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={goal.image} alt="" />
                ) : (
                  "🎁"
                )}
              </span>
              <span className="pu-goal__label">Votre prochaine récompense</span>
              <strong className="pu-goal__title">{goal.title}</strong>
              <div
                className="pu-progress"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
              >
                <span className="pu-progress__fill" style={{ width: `${progress}%` }} />
              </div>
              <p className="pu-goal__missing">
                {goal.missing > 0 ? (
                  <>
                    Plus que <strong>{plain(goal.missing)} points</strong>
                    <span className="pu-goal__total"> sur {plain(goal.cost)}</span>
                  </>
                ) : (
                  <strong>Vous pouvez déjà l&apos;obtenir.</strong>
                )}
              </p>
            </div>
          ) : (
            <div className="pu-goal pu-goal--empty">
              <span className="pu-goal__visual">🎁</span>
              <p className="pu-goal__missing">Le catalogue de récompenses arrive bientôt.</p>
            </div>
          )}
        </div>
      </section>

      {/* ── Vitrine des gros lots ────────────────────────────────────────── */}
      {u && u.topRewards.length > 1 && (
        <section className="dash__section">
          <h2 className="dash__section-title">
            <span className="dash__section-icon">{Icons.gift()}</span> Les grands lots
          </h2>
          {/* Défilement horizontal natif (scroll-snap) : pas de minuteur ni de
              JavaScript — ça reste utilisable au clavier, au trackpad et au doigt,
              et rien ne bouge sous les yeux du lecteur. */}
          <ul className="pu-carousel">
            {u.topRewards.map((r) => (
              <li key={String(r.id)} className="pu-carousel__item">
                <span className="pu-carousel__visual">
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" />
                  ) : (
                    "🎁"
                  )}
                </span>
                <span className="pu-carousel__title">{r.title}</span>
                <span className="pu-carousel__cost">{plain(r.cost)} pts</span>
                <span className="pu-carousel__missing">
                  {r.missing > 0 ? `Plus que ${plain(r.missing)} pts` : "À votre portée"}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* ── Ce que je peux déjà m'offrir ─────────────────────────────────── */}
      {u && u.reachable.length > 0 && (
        <section className="dash__section">
          <h2 className="dash__section-title">
            <span className="dash__section-icon">{Icons.gift()}</span> À votre portée dès maintenant
          </h2>
          <ul className="pu-rewards">
            {u.reachable.slice(0, 4).map((r) => (
              <li key={String(r.id)} className="pu-reward">
                <span className="pu-reward__visual">
                  {r.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.image} alt="" />
                  ) : (
                    "🎁"
                  )}
                </span>
                <span className="pu-reward__title">{r.title}</span>
                <span className="pu-reward__cost">{plain(r.cost)} pts</span>
              </li>
            ))}
          </ul>
          <Link className="pu-cta" href={`${adminRoute}/collections/rewards`}>
            Échanger mes points →
          </Link>
        </section>
      )}

      {/* ── Ce qu'il reste à gagner ──────────────────────────────────────── */}
      <section className="dash__section">
        <h2 className="dash__section-title">
          <span className="dash__section-icon">{Icons.mission()}</span> Missions à réaliser
        </h2>
        {u && u.missionsToDo.length > 0 ? (
          <>
            <p className="pu-lead">
              <strong>{plain(u.pointsToGrab)} points</strong> encore à gagner sur{" "}
              {u.missionsToDo.length} mission{u.missionsToDo.length > 1 ? "s" : ""}.
            </p>
            <ul className="pu-missions">
              {u.missionsToDo.slice(0, 5).map((mi) => (
                <li key={String(mi.id)} className="pu-mission">
                  {/* Logo de la mission, sinon son initiale — même repli que le
                      catalogue, pour que la mission se reconnaisse d'un endroit
                      à l'autre. */}
                  <span className="pu-mission__visual" aria-hidden>
                    {mi.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={mi.image} alt="" />
                    ) : (
                      mi.title.trim().charAt(0).toUpperCase()
                    )}
                  </span>
                  <span className="pu-mission__title">{mi.title}</span>
                  <span className="pu-mission__points">+{plain(mi.points)} pts</span>
                </li>
              ))}
            </ul>
            <Link className="pu-cta" href={`${adminRoute}/collections/missions`}>
              Réaliser une mission →
            </Link>
          </>
        ) : (
          <p className="pu-lead">
            Toutes les missions sont faites. De nouvelles arrivent régulièrement — revenez bientôt.
          </p>
        )}
      </section>

      {/* ── Suivi ────────────────────────────────────────────────────────── */}
      <section className="dash__section">
        <h2 className="dash__section-title">
          <span className="dash__section-icon">{Icons.check()}</span> Mon suivi
        </h2>
        {/* Sans lien : les collections « soumissions » et « commandes » sont des
            écrans de traitement réservés à TIM. Le chiffre suffit ici, et le
            détail d'une mission se lit dans le catalogue. */}
        <div className="dash__kpis">
          <StatTile
            icon={Icons.check()}
            label="Missions validées"
            value={plain(m.submissions.approved)}
          />
          <StatTile
            icon={Icons.mission()}
            label="En attente de validation"
            value={plain(m.submissions.pending)}
            tone={m.submissions.pending > 0 ? "warn" : "default"}
          />
          <StatTile
            icon={Icons.gift()}
            label="Commandes en cours"
            value={plain(m.orders.pending)}
            tone={m.orders.pending > 0 ? "warn" : "default"}
          />
        </div>
      </section>
    </>
  );
}
