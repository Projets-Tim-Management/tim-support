"use client";

import { useEffect, useState } from "react";

import { PartnerClientsBoard } from "./PartnerClientsBoard";
import { PartnerClientsStatusTabs } from "./PartnerClientsStatusTabs";

/**
 * En-tête de la liste « Opportunités » (slot `beforeListTable`) : bascule
 * entre une vue KANBAN par statut et le TABLEAU natif Payload.
 *
 * - Mode tableau : on affiche les onglets de statut (pré-filtrage) au-dessus du
 *   tableau natif, inchangé.
 * - Mode kanban : on pose la classe `tim-clients-kanban` sur <body> — le SCSS
 *   masque alors le tableau natif et ses contrôles — et on rend le board à la
 *   place (dans ce même slot, au-dessus de l'emplacement du tableau masqué).
 *
 * Le choix est mémorisé dans le localStorage.
 */

const STORAGE_KEY = "tim-clients-view";
const BODY_CLASS = "tim-clients-kanban";

type View = "table" | "kanban";

export function PartnerClientsViewSwitcher() {
  /**
   * Vue par défaut = KANBAN.
   *
   * C'est la question qu'on se pose en ouvrant cet écran : où en est chaque
   * affaire, et qu'est-ce qui est prévu ? Le tableau répond à une autre — combien
   * ça représente — et reste à un clic, avec ses colonnes CA / commission et sa
   * ligne de total.
   *
   * Le rendu initial reste sur cette valeur avant relecture du choix mémorisé :
   * partir du tableau ferait clignoter l'écran pour qui a choisi le Kanban.
   */
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
    <div className="tim-clients-header">
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

      {view === "table" ? <PartnerClientsStatusTabs /> : <PartnerClientsBoard />}
    </div>
  );
}
