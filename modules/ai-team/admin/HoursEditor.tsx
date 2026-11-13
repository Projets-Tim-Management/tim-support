"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Le temps que la direction consacre chaque semaine aux objectifs du chef
 * SEO/GEO — il y fait tenir ses objectifs. Écrit la fiche par l'API de Payload
 * (seule la direction peut modifier). Vide : 5 h.
 */
export function HoursEditor({ id, name, hours }: { id: number | string; name: string; hours: number | null }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(hours != null ? String(hours) : "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = async () => {
    const raw = value.trim().replace(",", ".");
    const next = raw === "" ? null : Number(raw);
    if (next != null && (!Number.isFinite(next) || next <= 0 || next > 40)) {
      setError("Entre 0,5 et 40 heures, ou vide pour 5 h.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/payload-api/ai-team-members/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ weeklyHours: next }) });
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
          Votre temps pour {name} : <strong>{(hours ?? 5).toLocaleString("fr-FR")} h / semaine</strong>
        </span>
        <button type="button" className="ait-budget-edit__btn" onClick={() => setEditing(true)} aria-label={`Modifier votre temps par semaine pour ${name}`}>
          ✏️ Modifier
        </button>
      </span>
    );
  }
  return (
    <span className="ait-budget-edit ait-budget-edit--on">
      <label>
        Heures par semaine
        <input
          type="number"
          min={0.5}
          max={40}
          step={0.5}
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
      {error && <span className="ait-budget-edit__error">{error}</span>}
    </span>
  );
}
