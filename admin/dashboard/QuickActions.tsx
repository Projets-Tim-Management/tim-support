import Link from "next/link";

import { Icons, type IconName } from "./icons";

/**
 * Barre d'actions rapides : créer une entité depuis le dashboard.
 * Chaque bouton = ICÔNE (de la collection) + badge « + » + TOOLTIP (data-tooltip
 * rendu en CSS) + aria-label. Ne liste que les collections où la création est
 * autorisée (les tickets, en création désactivée, en sont volontairement absents).
 */

const ACTIONS: Array<{ slug: string; label: string; icon: IconName }> = [
  { slug: "features", label: "feature", icon: "feature" },
  { slug: "parcours", label: "parcours", icon: "parcours" },
  { slug: "missions", label: "mission", icon: "mission" },
  { slug: "rewards", label: "récompense", icon: "gift" },
  { slug: "partners", label: "partenaire", icon: "partner" },
  { slug: "partner-clients", label: "client partenaire", icon: "users" },
];

export default function QuickActions({ adminRoute }: { adminRoute: string }) {
  return (
    <div className="dash-qa" role="group" aria-label="Actions rapides">
      {ACTIONS.map(({ slug, label, icon }) => {
        const tip = `Ajouter — ${label}`;
        return (
          <Link
            key={slug}
            href={`${adminRoute}/collections/${slug}/create`}
            className="dash-qa__btn"
            aria-label={tip}
            data-tooltip={tip}
            title={tip}
          >
            <span className="dash-qa__icon" aria-hidden>
              {Icons[icon]()}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
