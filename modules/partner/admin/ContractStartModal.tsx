"use client";

import { useState } from "react";
import { createPortal } from "react-dom";

/**
 * Demande la DATE DE DÉBUT DE CONTRAT au moment où une affaire passe « Gagnée ».
 *
 * C'est cette date qui enclenche le calcul des licences mensuelles : la
 * collecter ici, dans le geste qui gagne l'affaire, évite une fiche « Gagnée »
 * à zéro euro dont personne ne comprend pourquoi elle ne rapporte rien (et un
 * refus du serveur, cf. requireContractStart).
 *
 * Rendu par PORTAIL sur <body> : le champ « Statut » vit dans le formulaire,
 * parfois lui-même dans un drawer — à l'intérieur, l'overlay resterait prisonnier
 * du contexte d'empilement. Réutilise l'habillage `tim-archive` (même famille de
 * modal de confirmation).
 */
export function ContractStartModal({
  companyName,
  onCancel,
  onConfirm,
}: {
  companyName?: string;
  onCancel: () => void;
  /** Reçoit la date au format ISO (début de journée locale). */
  onConfirm: (iso: string) => void;
}) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));

  if (typeof document === "undefined") return null;

  return createPortal(
    <div className="tim-archive" onClick={onCancel}>
      <div className="tim-archive__panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="tim-archive__title">
          Affaire gagnée{companyName ? ` — ${companyName}` : ""}
        </h2>
        <p className="tim-archive__text">
          Indiquez la <strong>date de début de contrat</strong> : le calcul des licences
          mensuelles (CA et commission du partenaire) démarre à cette date. Un contrat qui
          commence plus tard ne sera compté qu'à partir de ce jour-là.
        </p>
        <label className="tim-archive__label" htmlFor="tim-contract-start">
          Date de début de contrat
        </label>
        <input
          id="tim-contract-start"
          type="date"
          className="tim-archive__input"
          value={date}
          autoFocus
          onChange={(e) => setDate(e.target.value)}
        />
        <div className="tim-archive__actions">
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--ghost"
            onClick={onCancel}
          >
            Annuler
          </button>
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--primary"
            disabled={!date}
            onClick={() => onConfirm(new Date(`${date}T00:00:00`).toISOString())}
          >
            Confirmer
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
