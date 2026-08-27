"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { clientStatusMeta, needsEndDate } from "@/modules/partner/lib/clientStatus";
import { LOSS_SCOPE_BY_STATUS, reasonsFor } from "@/modules/partner/lib/lossReason";

/**
 * Pourquoi l'affaire s'arrête — demandé AU MOMENT où on la clôt.
 *
 * Trois statuts ferment une opportunité : « Perdue », « Résilié », « Archivé ».
 * Les deux derniers demandent en plus une date de fin, puisque la commission du
 * partenaire s'arrête là. Le modal réunit les deux questions : c'est le même
 * geste, il ne doit pas produire deux écrans.
 *
 * Les motifs proposés dépendent de la situation : un prospect qui n'a jamais
 * signé et un client qui s'en va ne se perdent pas pour les mêmes raisons (voir
 * lib/lossReason.ts).
 *
 * Écran PARTAGÉ par le Kanban et la fiche : deux copies auraient divergé au
 * premier ajout de motif, et l'une aurait accepté ce que l'autre refuse.
 */

export interface LossOutcome {
  reason: string;
  detail: string;
  /** ISO, seulement pour les statuts qui exigent une date de fin. */
  endDate?: string;
}

export function LossReasonModal({
  status,
  companyName,
  defaultDate,
  busy,
  error,
  onCancel,
  onConfirm,
}: {
  /** Statut visé : `perdue`, `resilie` ou `archive`. */
  status: string;
  companyName?: string;
  /** Date de fin pré-remplie (`yyyy-mm-dd`). */
  defaultDate?: string;
  busy?: boolean;
  error?: string | null;
  onCancel: () => void;
  onConfirm: (outcome: LossOutcome) => void;
}) {
  const scope = LOSS_SCOPE_BY_STATUS[status] ?? "prospect";
  const withDate = needsEndDate(status);
  const label = clientStatusMeta(status)?.label ?? status;

  const [reason, setReason] = useState("");
  const [detail, setDetail] = useState("");
  const [date, setDate] = useState(defaultDate ?? new Date().toISOString().slice(0, 10));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [busy, onCancel]);

  if (typeof document === "undefined") return null;

  const ready = Boolean(reason) && (!withDate || Boolean(date));

  return createPortal(
    <div className="tim-archive" onClick={() => !busy && onCancel()}>
      <div className="tim-archive__panel" onClick={(e) => e.stopPropagation()}>
        <h2 className="tim-archive__title">
          {label} — {companyName || "cette opportunité"}
        </h2>
        <p className="tim-archive__text">
          {scope === "client"
            ? "L'abonnement mensuel s'arrête. Indiquez pourquoi : c'est ce qui permettra de compter les départs par motif, et d'agir dessus."
            : "Indiquez pourquoi l'affaire ne s'est pas faite. C'est ce qui permettra de compter les pertes par motif, et d'agir dessus."}
        </p>

        {/* Un motif se CHOISIT dans une liste fermée : saisi librement, il
            deviendrait incomptable dès la troisième formulation. */}
        <span className="tim-archive__label">Motif</span>
        <div className="tim-loss__reasons">
          {reasonsFor(scope).map((r) => (
            <button
              key={r.value}
              type="button"
              className={`tim-loss__reason${reason === r.value ? " is-on" : ""}`}
              onClick={() => setReason(r.value)}
            >
              {r.label}
            </button>
          ))}
        </div>

        <label className="tim-archive__label" htmlFor="tim-loss-detail">
          Précision <span className="tim-loss__opt">(facultatif)</span>
        </label>
        <textarea
          id="tim-loss-detail"
          className="tim-archive__input tim-loss__detail"
          rows={3}
          value={detail}
          onChange={(e) => setDetail(e.target.value)}
          placeholder="Ce que le motif ne dit pas : le concurrent retenu, le prix visé…"
        />

        {withDate && (
          <>
            <label className="tim-archive__label" htmlFor="tim-loss-date">
              Date de fin de contrat
            </label>
            <input
              id="tim-loss-date"
              type="date"
              className="tim-archive__input"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </>
        )}

        {error && <p className="tim-loss__error">{error}</p>}

        <div className="tim-archive__actions">
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--ghost"
            onClick={onCancel}
            disabled={busy}
          >
            Annuler
          </button>
          <button
            type="button"
            className="tim-archive__btn tim-archive__btn--danger"
            disabled={busy || !ready}
            onClick={() =>
              onConfirm({
                reason,
                detail: detail.trim(),
                ...(withDate ? { endDate: new Date(`${date}T00:00:00`).toISOString() } : {}),
              })
            }
          >
            {busy ? "En cours…" : `Passer en « ${label} »`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
