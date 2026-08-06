"use client";

import { useAuth } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { hasAdminRole } from "@/core/access";

/**
 * Cellule « Stock » ÉDITABLE depuis la liste des récompenses : ajuster un stock
 * ne mérite pas d'ouvrir la fiche, de saisir, d'enregistrer, puis de revenir.
 *
 * Convention du champ : `-1` = illimité, `0` = épuisé (la récompense disparaît
 * alors du catalogue partenaire). Le bouton ∞ bascule entre les deux régimes.
 *
 * L'écriture passe par l'API Payload, donc l'access control s'applique : un rôle
 * sans droit d'écriture reçoit un refus et la valeur revient à son état d'avant.
 * Pour ces rôles, la cellule est affichée en lecture seule.
 */

type Props = { cellData?: unknown; rowData?: { id?: number | string } };

const toNumber = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function RewardStockCell({ cellData, rowData }: Props) {
  const { user } = useAuth();
  const id = rowData?.id;
  const [value, setValue] = useState<number>(toNumber(cellData));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // La liste se recharge (tri, filtre, pagination) → on resuit la valeur servie.
  useEffect(() => {
    setValue(toNumber(cellData));
  }, [cellData]);

  if (!hasAdminRole(user) || id == null) {
    return <span>{toNumber(cellData) < 0 ? "Illimité" : toNumber(cellData)}</span>;
  }

  const save = async (next: number) => {
    const previous = value;
    setValue(next); // optimiste : le tableau reste réactif
    setState("saving");
    try {
      const res = await fetch(`/payload-api/rewards/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ stock: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      // Rien n'est enregistré : on remet la valeur d'avant plutôt que de laisser
      // le tableau afficher un stock qui n'existe pas en base.
      setValue(previous);
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  };

  const unlimited = value < 0;

  return (
    <span className={`rstock rstock--${state}`}>
      <button
        type="button"
        className="rstock__btn"
        onClick={() => void save(Math.max(0, value - 1))}
        disabled={unlimited || value <= 0 || state === "saving"}
        aria-label="Retirer une unité"
      >
        −
      </button>

      {unlimited ? (
        <span className="rstock__infinite">illimité</span>
      ) : (
        <input
          type="number"
          className="rstock__input"
          min={0}
          value={value}
          onChange={(e) => setValue(Math.max(0, Number(e.target.value) || 0))}
          // Enregistré à la sortie du champ (ou sur Entrée) : pas une requête
          // par frappe pendant la saisie.
          onBlur={(e) => {
            const next = Math.max(0, Number(e.target.value) || 0);
            if (next !== toNumber(cellData)) void save(next);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          disabled={state === "saving"}
          aria-label="Stock"
        />
      )}

      <button
        type="button"
        className="rstock__btn"
        onClick={() => void save(unlimited ? 1 : value + 1)}
        disabled={state === "saving"}
        aria-label="Ajouter une unité"
      >
        +
      </button>

      <button
        type="button"
        className={`rstock__inf${unlimited ? " is-on" : ""}`}
        onClick={() => void save(unlimited ? 0 : -1)}
        title={unlimited ? "Repasser en stock limité (0 = épuisé)" : "Stock illimité"}
        disabled={state === "saving"}
      >
        ∞
      </button>

      {state === "error" && <span className="rstock__err">échec</span>}
    </span>
  );
}
