"use client";

import { useEffect, useState } from "react";

import { PartnerClientsBoard } from "./PartnerClientsBoard";
import { PartnerClientsStatusTabs } from "./PartnerClientsStatusTabs";

/**
 * En-tête de la liste « Clients apportés » (slot `beforeListTable`) : bascule
 * entre le TABLEAU natif Payload et une vue KANBAN par statut.
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
  // Vue par défaut = Tableau (colonnes CA / commission, ligne de total, tri par
  // statut) ; le Kanban reste à un clic. Puis relecture du choix mémorisé.
  const [view, setView] = useState<View>("table");

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
      </div>

      {view === "table" ? <PartnerClientsStatusTabs /> : <PartnerClientsBoard />}
    </div>
  );
}
