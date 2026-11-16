"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * La case « en service » d'un membre de l'équipe IA, sur l'organigramme.
 *
 * Elle écrit la fiche par l'API de Payload (`/payload-api`) : c'est le contrôle
 * d'accès de la collection qui décide — seule la direction peut modifier. La
 * page se relit ensuite (router.refresh) pour que les pastilles suivent.
 */
export function ActiveToggle({ id, name, active }: { id: number | string; name: string; active: boolean }) {
  const router = useRouter();
  const [on, setOn] = useState(active);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    const next = !on;
    setOn(next);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/payload-api/ai-team-members/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: next }),
      });
      if (!res.ok) throw new Error(String(res.status));
      router.refresh();
    } catch {
      setOn(!next);
      setError("Pas enregistré, réessayez.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="ait-toggle-wrap">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`${name} : ${on ? "en service" : "en pause"}`}
        className={`ait-toggle${on ? " ait-toggle--on" : ""}`}
        onClick={toggle}
        disabled={busy}
      >
        <span className="ait-toggle__track" aria-hidden>
          <span className="ait-toggle__thumb" />
        </span>
        <span className="ait-toggle__label">{on ? "En service" : "En pause"}</span>
      </button>
      {error && <span className="ait-toggle__error">{error}</span>}
    </span>
  );
}
