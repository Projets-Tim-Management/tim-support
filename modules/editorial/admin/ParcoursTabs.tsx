"use client";

import Link from "next/link";
import { useState } from "react";

import { ParcoursCardSteps } from "./ParcoursCardSteps";

/**
 * Onglets de la vue Parcours : un onglet par profil cible (Admin, Conducteur,
 * Chef de chantier, Compagnon, + « Autres » si besoin). L'onglet actif affiche
 * les cartes de ses parcours + un bouton « + Ajouter » (profil pré-rempli).
 * Données passées par le server component (sérialisables).
 */

type Step = { id: number | string; title?: string };
type ParcoursCardData = {
  id: number | string;
  title: string;
  intro: string;
  isDraft: boolean;
  steps: Step[];
};
export type ParcoursGroup = {
  key: string;
  label: string;
  createHref: string;
  parcours: ParcoursCardData[];
};

const PARCOURS_URL = (id: number | string) => `/admin/collections/parcours/${id}`;

function Card({ p }: { p: ParcoursCardData }) {
  return (
    <article className="pcard">
      <header className="pcard__head">
        <Link className="pcard__title" href={PARCOURS_URL(p.id)}>
          {p.title}
        </Link>
        <div className="pcard__meta">
          <span className="pcard__count">
            {p.steps.length} étape{p.steps.length > 1 ? "s" : ""}
          </span>
          {p.isDraft && <span className="pcard__badge pcard__badge--draft">Brouillon</span>}
        </div>
      </header>

      {p.intro && <p className="pcard__intro">{p.intro}</p>}

      {p.steps.length === 0 ? (
        <p className="pcard__empty">Aucune étape pour l'instant.</p>
      ) : (
        <ParcoursCardSteps parcoursId={p.id} steps={p.steps} />
      )}
    </article>
  );
}

export function ParcoursTabs({ groups, canCreate }: { groups: ParcoursGroup[]; canCreate: boolean }) {
  const [active, setActive] = useState<string>(groups[0]?.key ?? "");
  const current = groups.find((g) => g.key === active) ?? groups[0];

  if (!current) {
    return <p className="parcours-view__empty">Aucun parcours pour l'instant.</p>;
  }

  return (
    <div className="parcours-tabs">
      <div className="parcours-tabs__nav" role="tablist">
        {groups.map((g) => (
          <button
            key={g.key}
            type="button"
            role="tab"
            aria-selected={g.key === active}
            className={`parcours-tab${g.key === active ? " parcours-tab--active" : ""}`}
            onClick={() => setActive(g.key)}
          >
            {g.label}
            <span className="parcours-tab__count">{g.parcours.length}</span>
          </button>
        ))}
      </div>

      <div className="parcours-tabs__panel" role="tabpanel">
        <div className="parcours-tabs__bar">
          <span className="parcours-tabs__bar-label">
            {current.parcours.length} parcours · {current.label}
          </span>
          {canCreate && (
            <Link className="parcours-group__add" href={current.createHref}>
              + Ajouter
            </Link>
          )}
        </div>

        {current.parcours.length === 0 ? (
          <p className="parcours-view__empty">Aucun parcours pour ce profil.</p>
        ) : (
          <div className="parcours-cards">
            {current.parcours.map((p) => (
              <Card key={String(p.id)} p={p} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
