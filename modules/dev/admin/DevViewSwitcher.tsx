"use client";

import { useEffect, useState } from "react";

import { DevBoard } from "./DevBoard";
import { DevPhaseTabs } from "./DevPhaseTabs";

/**
 * En-tête de la liste « Développements » (slot `beforeListTable`) : bascule
 * entre le KANBAN par statut et le TABLEAU natif de Payload.
 *
 * - Tableau : les vues rapides par phase s'affichent au-dessus du tableau, qui
 *   reste inchangé (tri par colonne, filtres avancés, sélection multiple).
 * - Kanban : la classe `tim-dev-kanban` sur <body> efface le tableau natif, et
 *   le board prend sa place.
 *
 * Vue par défaut = KANBAN, parce que c'est la question de cet écran : où en est
 * chaque chose. Le tableau répond à une autre — laquelle est la plus demandée,
 * laquelle traîne — et reste à un clic, avec son tri par « Clients demandeurs ».
 *
 * Le choix est mémorisé (localStorage) : on retrouve sa vue en revenant.
 */

const STORAGE_KEY = "tim-dev-view";
const BODY_CLASS = "tim-dev-kanban";

type View = "table" | "kanban";

export function DevViewSwitcher() {
  // Rendu initial sur la valeur par défaut avant relecture du choix mémorisé :
  // partir du tableau ferait clignoter l'écran de qui a choisi le Kanban.
  const [view, setView] = useState<View>("kanban");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "kanban" || saved === "table") setView(saved);
  }, []);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, view);
    document.body.classList.toggle(BODY_CLASS, view === "kanban");
    return () => document.body.classList.remove(BODY_CLASS);
  }, [view]);

  return (
    <div className="dev-header">
      <div className="tim-view-switch" role="tablist" aria-label="Type de vue">
        <button
          type="button"
          role="tab"
          aria-selected={view === "kanban"}
          className={`tim-view-switch__btn${view === "kanban" ? " tim-view-switch__btn--active" : ""}`}
          onClick={() => setView("kanban")}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2.5" width="3.5" height="11" rx="1" />
            <rect x="6.5" y="2.5" width="3.5" height="8" rx="1" />
            <rect x="11" y="2.5" width="3.5" height="11" rx="1" />
          </svg>
          Kanban
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "table"}
          className={`tim-view-switch__btn${view === "table" ? " tim-view-switch__btn--active" : ""}`}
          onClick={() => setView("table")}
        >
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5">
            <rect x="2" y="2.5" width="12" height="11" rx="1.5" />
            <path d="M2 6.5h12M2 10h12M6 6.5v7" strokeLinecap="round" />
          </svg>
          Tableau
        </button>
      </div>

      {view === "table" ? <DevPhaseTabs /> : <DevBoard />}
    </div>
  );
}
