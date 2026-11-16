"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Le budget IA du mois d'un chef, modifiable sur sa carte de l'organigramme.
 *
 * Écrit la fiche par l'API de Payload (seule la direction peut modifier) ; le
 * moteur le relit avant chaque appel payant. Vide = pas de budget d'équipe,
 * seul le plafond global des agents s'applique.
 */
export function BudgetEditor({ id, name, budgetEur, capMonthEur }: { id: number | string; name: string; budgetEur: number | null; capMonthEur: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(budgetEur != null ? String(budgetEur) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fmt = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

  const save = async () => {
    const raw = value.trim().replace(",", ".");
    const next = raw === "" ? null : Number(raw);
    if (next != null && (!Number.isFinite(next) || next < 0)) {
      setError("Un montant positif, ou vide pour aucun budget d'équipe.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/payload-api/ai-team-members/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ monthlyAiBudgetEur: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      setEditing(false);
      router.refresh();
    } catch {
      setError("Pas enregistré, réessayez.");
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <span className="ait-budget-edit">
        <span>
          Budget IA du mois : <strong>{budgetEur != null ? fmt(budgetEur) : "non fixé"}</strong>
          {budgetEur == null && capMonthEur != null ? ` (plafond global ${fmt(capMonthEur)})` : ""}
        </span>
        <button type="button" className="ait-budget-edit__btn" onClick={() => setEditing(true)} aria-label={`Modifier le budget IA du mois de ${name}`}>
          ✏️ Modifier
        </button>
      </span>
    );
  }
  return (
    <span className="ait-budget-edit ait-budget-edit--on">
      <label>
        Budget IA du mois de {name} (€)
        <input
          type="number"
          min={0}
          step={1}
          inputMode="decimal"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
            if (e.key === "Escape") setEditing(false);
          }}
          autoFocus
          disabled={busy}
        />
      </label>
      <span className="ait-budget-edit__actions">
        <button type="button" className="ait-budget-edit__save" onClick={() => void save()} disabled={busy}>
          Enregistrer
        </button>
        <button type="button" className="ait-budget-edit__btn" onClick={() => setEditing(false)} disabled={busy}>
          Annuler
        </button>
      </span>
      {capMonthEur != null && value && Number(value.replace(",", ".")) > capMonthEur && <span className="ait-budget-edit__note">Au-delà du plafond global ({fmt(capMonthEur)}) : c&apos;est lui qui s&apos;appliquera.</span>}
      {error && <span className="ait-budget-edit__error">{error}</span>}
    </span>
  );
}
