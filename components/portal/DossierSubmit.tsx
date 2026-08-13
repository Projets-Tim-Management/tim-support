"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Transmission du dossier. Le bouton reste désactivé tant que les sections
 * obligatoires ne sont pas servies ; le serveur revérifie de son côté (voir
 * /api/portal/dossier/submit) — l'écran guide, il ne garantit rien.
 */
export default function DossierSubmit({ ready }: { ready: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/portal/dossier/submit", {
        method: "POST",
        credentials: "include",
      });
      const body = await res.json();
      if (res.status === 422) {
        setError(`Il manque encore : ${(body?.sections ?? []).join(", ")}.`);
        return;
      }
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError("La transmission a échoué. Réessayez dans un instant.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        type="button"
        disabled={!ready || busy}
        onClick={() => void submit()}
        className="rounded-md bg-primary px-5 py-2.5 font-semibold text-white transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
      >
        {busy ? "Transmission…" : "Transmettre mon dossier"}
      </button>
      {!ready && (
        <p className="mt-2 text-sm text-muted">
          Complétez les sections obligatoires pour pouvoir transmettre.
        </p>
      )}
      {error && (
        <p className="mt-2 text-sm font-semibold text-primary" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
