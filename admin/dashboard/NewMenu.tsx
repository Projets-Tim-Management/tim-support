"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { Icons, type IconName } from "./icons";

/**
 * Le bouton « + Nouveau » : une seule porte pour créer, au lieu de six icônes.
 *
 * Six boutons-icônes en tête de page demandaient de survoler chacun pour lire
 * son infobulle. Un menu nomme ce qu'il crée, et laisse l'en-tête à ce qui
 * compte : le jour, et ce qu'il y a à faire.
 *
 * Le bouton est LE bouton d'action TIM (`tim-btn tim-btn--primary`, voir
 * _base.scss) : le même que « Ajouter une opportunité » ou « Créer » sur les
 * listes — pas un dessin de plus.
 *
 * `<details>` natif : ouvert/fermé sans état React, accessible au clavier. On
 * ajoute seulement la fermeture au clic à l'extérieur, que le navigateur ne
 * fait pas tout seul.
 */
const ENTRIES: Array<{ slug: string; label: string; icon: IconName; adminOnly?: boolean }> = [
  { slug: "partner-clients", label: "Opportunité", icon: "users" },
  { slug: "partners", label: "Partenaire", icon: "partner", adminOnly: true },
  { slug: "features", label: "Feature", icon: "feature", adminOnly: true },
  { slug: "parcours", label: "Parcours", icon: "parcours", adminOnly: true },
  { slug: "missions", label: "Mission", icon: "mission", adminOnly: true },
  { slug: "rewards", label: "Récompense", icon: "gift", adminOnly: true },
];

export default function NewMenu({ adminRoute, admin }: { adminRoute: string; admin: boolean }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      const el = ref.current;
      if (el?.open && e.target instanceof Node && !el.contains(e.target)) el.open = false;
    };
    document.addEventListener("click", close);
    return () => document.removeEventListener("click", close);
  }, []);

  const entries = ENTRIES.filter((e) => admin || !e.adminOnly);

  return (
    <details ref={ref} className="home-new">
      <summary className="tim-btn tim-btn--primary home-new__btn" aria-label="Créer">
        <span className="home-new__plus" aria-hidden>
          {Icons.plus()}
        </span>
        Nouveau
      </summary>
      <ul className="home-new__menu" role="menu">
        {entries.map((e) => (
          <li key={e.slug} role="none">
            <Link role="menuitem" className="home-new__item" href={`${adminRoute}/collections/${e.slug}/create`}>
              <span className="home-new__icon" aria-hidden>
                {Icons[e.icon]()}
              </span>
              {e.label}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  );
}
