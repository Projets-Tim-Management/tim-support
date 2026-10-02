"use client";

import { fmtDay, type Day } from "@/modules/training/admin/TrainingPlanParts";
import { PROFILS } from "@/modules/partner/lib/pricing";
import { sessionsOfDay, type PlanSession } from "@/modules/training/lib/plan";

/**
 * Onglet « Impressions » du plan : TOUT ce qu'il y a à imprimer, au même
 * endroit, dans l'ordre où on s'en sert — et pour chaque document, à quoi il
 * sert et à qui il va. Chaque bouton ouvre une page faite pour le papier, qui
 * lance l'impression.
 *
 * Les documents qui portent des mots de passe sont réservés à TIM ; un
 * formateur partenaire voit les fiches et le kit de ses journées.
 */

const open = (href: string) => window.open(href, "_blank", "noopener,noreferrer");

function DocCard({
  step,
  title,
  what,
  who,
  secret,
  children,
}: {
  step: number;
  title: string;
  what: string;
  who: string;
  secret?: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="tr-doc">
      <span className="tr-doc__step" aria-hidden="true">
        {step}
      </span>
      <div className="tr-doc__body">
        <div className="tr-doc__head">
          <h4 className="tr-doc__title">{title}</h4>
          {secret && <span className="tr-doc__secret">Mots de passe — confidentiel</span>}
        </div>
        <p className="tr-doc__what">{what}</p>
        <p className="tr-doc__who">{who}</p>
        <div className="tr-doc__actions">{children}</div>
      </div>
    </li>
  );
}

export function TrainingPrints({
  trainingId,
  days,
  sessions,
  admin,
  userId,
}: {
  trainingId: number | string;
  days: Day[];
  sessions: PlanSession[];
  admin: boolean;
  userId?: number | string | null;
}) {
  const active = sessions.filter((s) => s.status !== "annulee");
  if (!active.length) {
    return <p className="tr-plan__empty">Rien à imprimer pour l&apos;instant : ajoutez des créneaux et leurs participants dans le plan.</p>;
  }
  const people = new Set(active.flatMap((s) => (s.participants ?? []).map(String))).size;
  const trained = new Set(active.flatMap((s) => s.profiles ?? []));
  const myDays = days.filter((d) => admin || (userId != null && String(d.trainer) === String(userId)));
  const canRoles = admin || myDays.length > 0;
  let step = 1;

  return (
    <div className="tr-prints">
      <p className="tr-section-hint">
        Dans l&apos;ordre : ce que garde le formateur, ce qu&apos;on remet à chacun, puis le kit de chaque journée. Chaque bouton ouvre le
        document prêt à imprimer.
      </p>

      <h3 className="tr-section-title tr-section-title--first">Pour toute la formation</h3>
      <ol className="tr-docs-list">
        {admin && (
          <DocCard
            step={step++}
            title="Identifiants — une feuille A4"
            what={`Les identifiants et mots de passe groupés par profil, avec une case « Remis » à cocher au stylo — des ${people} personne${people > 1 ? "s" : ""} formée${people > 1 ? "s" : ""}, ou de tous les utilisateurs du client.`}
            who="Pour le formateur : il la garde, elle ne se distribue pas."
            secret
          >
            <button type="button" className="tr-sign-btn" onClick={() => open(`/impression/formation/identifiants?training=${trainingId}`)}>
              Personnes formées
            </button>
            <button
              type="button"
              className="tr-text-btn tr-text-btn--strong"
              onClick={() => open(`/impression/formation/identifiants?training=${trainingId}&scope=tous`)}
            >
              Tous les utilisateurs du client
            </button>
          </DocCard>
        )}
        {admin && (
          <DocCard
            step={step++}
            title="Étiquettes d'identifiants"
            what="Une étiquette de 6,4 × 2,4 cm par personne (nom, identifiant, mot de passe), 33 par feuille A4, traits de coupe dans les marges."
            who="À remettre à chacun, ou à coller sur sa fiche de rôle."
            secret
          >
            <button type="button" className="tr-sign-btn" onClick={() => open(`/impression/formation/etiquettes?training=${trainingId}`)}>
              Personnes formées
            </button>
            <button
              type="button"
              className="tr-text-btn tr-text-btn--strong"
              onClick={() => open(`/impression/formation/etiquettes?training=${trainingId}&scope=tous`)}
            >
              Tous les utilisateurs du client
            </button>
          </DocCard>
        )}
        {canRoles && (
          <DocCard
            step={step++}
            title="Fiches par rôle"
            what="Une page par profil : quand il est formé, son parcours, ses premières fonctionnalités et comment démarrer."
            who="À remettre à chaque participant, une fiche de son profil chacun. Tous les profils s'impriment, formés ou non ici."
          >
            {PROFILS.map((p) => (
              <button
                key={p.key}
                type="button"
                className={`tr-chip-btn tr-chip-btn--print${trained.has(p.key) ? " is-trained" : ""}`}
                title={trained.has(p.key) ? "Profil formé dans ce plan" : "Profil sans créneau dans ce plan : fiche sans date"}
                onClick={() => open(`/impression/formation/roles?training=${trainingId}&profile=${p.key}`)}
              >
                {p.label}
              </button>
            ))}
            {trained.size > 1 && (
              <button type="button" className="tr-text-btn tr-text-btn--strong" onClick={() => open(`/impression/formation/roles?training=${trainingId}`)}>
                Toutes les fiches des profils formés
              </button>
            )}
          </DocCard>
        )}
      </ol>

      {myDays.length > 0 && (
        <>
          <h3 className="tr-section-title">Pour chaque journée</h3>
          <ol className="tr-docs-list">
            {myDays.map((d) => {
              const n = sessionsOfDay(active, d.id).length;
              if (!n) return null;
              return (
                <DocCard
                  key={d.id}
                  step={step++}
                  // Numéro dans TOUTE la formation : un formateur qui n'anime
                  // que la 2ᵉ journée doit lire « Journée 2 ».
                  title={`Kit · Journée ${days.indexOf(d) + 1} — ${fmtDay(d.date)}`}
                  what={`${n > 1 ? `Pour chacun des ${n} créneaux` : "Pour le créneau"} : le programme horodaté, la feuille de présence${admin ? ", les identifiants des participants" : ""} ; puis les fiches de rôle du jour.`}
                  who="Pour le formateur, le jour de la séance."
                  secret={admin}
                >
                  <button type="button" className="tr-sign-btn" onClick={() => open(`/impression/formation?day=${d.id}`)}>
                    Imprimer le kit
                  </button>
                </DocCard>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
