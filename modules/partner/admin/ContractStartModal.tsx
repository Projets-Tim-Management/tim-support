"use client";

import { dayKey } from "@/core/lib/dates";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { fetchContractStart } from "@/modules/partner/admin/contract-api";

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
  clientId,
  initialDate,
  onCancel,
  onConfirm,
}: {
  companyName?: string;
  /** Pour proposer la date prévue AU CONTRAT (elle prime, reste modifiable). */
  clientId?: number | string | null;
  /** Date déjà connue (fiche), « AAAA-MM-JJ ». */
  initialDate?: string | null;
  onCancel: () => void;
  /** Reçoit la date au format ISO (début de journée locale). */
  onConfirm: (iso: string) => void;
}) {
  const [date, setDate] = useState(() => initialDate || dayKey(new Date()));
  const [source, setSource] = useState<string | null>(null);
  /** Date saisie à la main : la proposition du contrat, arrivée après, ne l'écrase pas. */
  const edited = useRef(false);

  useEffect(() => {
    if (clientId == null) return;
    const ctrl = new AbortController();
    void fetchContractStart(clientId, ctrl.signal).then((start) => {
      if (!start || ctrl.signal.aborted || edited.current) return;
      setDate(start.date);
      setSource(start.reference);
    });
    return () => ctrl.abort();
  }, [clientId]);

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
          onChange={(e) => {
            edited.current = true;
            setDate(e.target.value);
          }}
        />
        {source ? <p className="tim-archive__hint">Date prévue au contrat {source} — modifiable.</p> : null}
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

