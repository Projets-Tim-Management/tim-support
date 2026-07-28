"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { buildCopyText } from "@/modules/editorial/import/featureTemplate";

/**
 * Panneau « Importer une feature » affiché au-dessus de la liste des features
 * (admin.components.beforeListTable). Deux temps :
 *   1. « Copier le modèle » → met dans le presse-papier le prompt + le JSON
 *      vierge à coller dans Claude ;
 *   2. on recolle le JSON rempli ici → POST vers l'endpoint qui crée un
 *      brouillon, puis redirection vers sa fiche.
 * Les images ne sont pas importées (à ajouter à la main sur la fiche).
 */
export function FeatureImport() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"idle" | "copied" | "loading" | "error">("idle");
  const [error, setError] = useState<string>("");

  const copyModel = async () => {
    try {
      await navigator.clipboard.writeText(buildCopyText());
      setStatus("copied");
      setTimeout(() => setStatus((s) => (s === "copied" ? "idle" : s)), 2500);
    } catch {
      setError("Impossible de copier automatiquement — sélectionne et copie le modèle à la main.");
    }
  };

  const runImport = async () => {
    setError("");
    const raw = value.trim();
    if (!raw) {
      setError("Colle d'abord le JSON rempli par Claude.");
      return;
    }
    // Tolère un JSON enrobé dans un bloc ```json … ``` (au cas où).
    const cleaned = raw.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
    let parsed: unknown;
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      setError("JSON invalide : vérifie qu'il commence par { et finit par } (sans texte autour).");
      return;
    }

    setStatus("loading");
    try {
      const res = await fetch("/payload-api/features/import", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setError(data?.error || "Échec de l'import.");
        return;
      }
      // Succès → on ouvre le brouillon créé.
      router.push(`/admin/collections/features/${data.id}`);
    } catch {
      setStatus("error");
      setError("Erreur réseau pendant l'import.");
    }
  };

  return (
    <div className="feat-import">
      <button
        type="button"
        className="feat-import__toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span className="feat-import__toggle-icon">⇪</span>
        Importer une feature depuis Claude
        <span className="feat-import__chevron">{open ? "▾" : "▸"}</span>
      </button>

      {open && (
        <div className="feat-import__panel">
          <ol className="feat-import__steps">
            <li>
              <strong>Copie le modèle</strong> et colle-le dans Claude sur ton poste.
              <button type="button" className="feat-import__copy" onClick={copyModel}>
                {status === "copied" ? "✓ Copié !" : "Copier le modèle"}
              </button>
            </li>
            <li>Claude te renvoie un JSON rempli. <strong>Copie-le.</strong></li>
            <li><strong>Colle-le ci-dessous</strong> puis lance l'import (un brouillon est créé).</li>
          </ol>

          <textarea
            className="feat-import__textarea"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder='Colle ici le JSON renvoyé par Claude ({ "title": … })'
            rows={10}
            spellCheck={false}
          />

          {error && <p className="feat-import__error">{error}</p>}

          <div className="feat-import__actions">
            <span className="feat-import__hint">
              Les images ne sont pas importées — à ajouter à la main sur la fiche.
            </span>
            <button
              type="button"
              className="feat-import__submit"
              onClick={runImport}
              disabled={status === "loading"}
            >
              {status === "loading" ? "Import en cours…" : "Importer → créer le brouillon"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
