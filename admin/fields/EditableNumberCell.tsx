"use client";

import { useAuth } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { hasAdminRole } from "@/core/access";

/**
 * Cellule de tableau NUMÉRIQUE éditable sur place : on corrige un prix ou un coût
 * depuis la liste, sans ouvrir la fiche puis revenir.
 *
 * Générique — le champ et la collection viennent des props que Payload passe à
 * toute cellule (`field.name`, `collectionSlug`), donc un seul composant sert
 * tous les champs nombre. Le suffixe affiché se règle par `clientProps`.
 *
 * L'écriture passe par l'API Payload : l'access control du champ s'applique, et
 * un refus ramène la valeur à son état d'avant plutôt que de laisser le tableau
 * afficher un chiffre qui n'existe pas en base.
 */

type Props = {
  cellData?: unknown;
  rowData?: { id?: number | string };
  field?: { name?: string };
  collectionSlug?: string;
  /** Unité affichée après la valeur (« pts », « € »…). */
  suffix?: string;
};

const toNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
};

const fmt = (n: number | null) =>
  n === null ? "—" : new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(n);

export function EditableNumberCell({ cellData, rowData, field, collectionSlug, suffix }: Props) {
  const { user } = useAuth();
  const [value, setValue] = useState<number | null>(toNumber(cellData));
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  // La liste se recharge (tri, filtre, pagination) → on resuit la valeur servie.
  useEffect(() => {
    setValue(toNumber(cellData));
  }, [cellData]);

  const id = rowData?.id;
  const name = field?.name;
  const editable = hasAdminRole(user) && id != null && name && collectionSlug;

  if (!editable) {
    return (
      <span>
        {fmt(toNumber(cellData))}
        {suffix && toNumber(cellData) !== null ? ` ${suffix}` : ""}
      </span>
    );
  }

  const save = async (next: number | null) => {
    const previous = value;
    setValue(next); // optimiste : le tableau reste réactif
    setState("saving");
    try {
      const res = await fetch(`/payload-api/${collectionSlug}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ [name]: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setState("saved");
      setTimeout(() => setState("idle"), 1500);
    } catch {
      setValue(previous);
      setState("error");
      setTimeout(() => setState("idle"), 2500);
    }
  };

  return (
    <span className={`tim-editnum tim-editnum--${state}`}>
      <input
        type="number"
        className="tim-editnum__input"
        min={0}
        step="any"
        value={value ?? ""}
        onChange={(e) => setValue(e.target.value === "" ? null : Number(e.target.value))}
        // Enregistré à la sortie du champ (ou sur Entrée) : pas une requête par
        // frappe pendant la saisie.
        onBlur={(e) => {
          const next = e.target.value === "" ? null : Number(e.target.value);
          if (next !== toNumber(cellData)) void save(next);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        disabled={state === "saving"}
        aria-label={name}
      />
      {suffix && <span className="tim-editnum__unit">{suffix}</span>}
      {state === "error" && <span className="tim-editnum__err">échec</span>}
    </span>
  );
}
