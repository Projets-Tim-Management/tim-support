import Link from "next/link";

import { runStatusMeta } from "@/modules/marketing/lib/journey";

import { actorLabel, type TestCard } from "./data-home";

/**
 * Les phases de test en cours, une carte par parcours.
 *
 * Ce qu'on cherche en un regard : où en est le test (la barre, J+9 sur 28),
 * ce qui l'attend (l'étape courante) et QUI doit la faire. Un test qui finit
 * sous sept jours le dit en clair — c'est la semaine où tout se joue.
 *
 * La plus pressée d'abord : celle qui finit le plus tôt. Sur UNE ligne qui
 * défile : les moins avancées sont à droite, on va les chercher.
 */

const fmtDate = (iso: string | null): string =>
  iso
    ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "numeric", month: "short" }).format(new Date(iso))
    : "—";

/** « Termine dans 3 jours », « Dernier jour », « Démarre le 22 sept. ». */
const echeance = (t: TestCard): { texte: string; ton: "soon" | "late" | "neutral" } => {
  if (t.status === "preparation") {
    return { texte: t.startDate ? `Démarre le ${fmtDate(t.startDate)}` : "Date de démarrage à fixer", ton: "neutral" };
  }
  if (t.daysLeft == null) return { texte: "Fin non datée", ton: "neutral" };
  if (t.daysLeft < 0) return { texte: `Dépassée de ${-t.daysLeft} j`, ton: "late" };
  if (t.daysLeft === 0) return { texte: "Dernier jour", ton: "soon" };
  if (t.daysLeft <= 7) return { texte: `Termine dans ${t.daysLeft} j`, ton: "soon" };
  return { texte: `Fin le ${fmtDate(t.endDate)}`, ton: "neutral" };
};

export default function TestCards({ tests, showPartner }: { tests: TestCard[]; showPartner: boolean }) {
  return (
    <section className="home-tests" aria-label="Phases de test en cours">
      <header className="home-section__head">
        <h2 className="home-section__title">Phases de test</h2>
        {tests.length > 0 && <span className="home-section__count">{tests.length}</span>}
        <Link className="home-section__more" href="/admin/collections/journey-runs">
          Tous les parcours ›
        </Link>
      </header>

      {tests.length === 0 ? (
        <div className="home-empty">
          <p className="home-empty__text">Aucune phase de test en cours.</p>
        </div>
      ) : (
        <ul className="home-tests__grid">
          {tests.map((t) => {
            const e = echeance(t);
            const statut = runStatusMeta(t.status);
            return (
              <li key={String(t.runId)}>
                <Link href={t.href} className={`home-test home-test--${e.ton}`}>
                  <div className="home-test__top">
                    <span className="home-test__client">{t.client}</span>
                    <span className={`home-test__due home-test__due--${e.ton}`}>{e.texte}</span>
                  </div>
                  {showPartner && t.partner && <span className="home-test__partner">{t.partner}</span>}

                  <div className="home-test__progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={t.progress}>
                    <span className="home-test__bar" style={{ width: `${t.progress}%` }} />
                  </div>
                  <div className="home-test__days">
                    {t.day != null && t.total != null ? (
                      <>
                        <strong>J+{t.day}</strong> sur {t.total}
                      </>
                    ) : (
                      (statut?.label ?? t.status)
                    )}
                  </div>

                  {t.next ? (
                    <div className="home-test__next">
                      <span className={`home-test__actor home-test__actor--${t.next.actor || "none"}`}>
                        {t.next.blocked ? "Bloqué" : actorLabel(t.next.actor)}
                      </span>
                      <span className="home-test__step">{t.next.label}</span>
                    </div>
                  ) : (
                    <div className="home-test__next">
                      <span className="home-test__actor home-test__actor--done">Terminé</span>
                      <span className="home-test__step">Toutes les étapes sont acquises</span>
                    </div>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
