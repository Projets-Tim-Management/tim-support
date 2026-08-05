"use client";

import { useField } from "@payloadcms/ui";
import { useEffect, useRef, useState } from "react";

/**
 * Champ de recherche INSEE (onglet « Facturation client ») : on tape la raison
 * sociale (ou un SIREN/SIRET), on choisit dans la liste, et les champs
 * disponibles se préremplissent (raison sociale, SIREN, N° TVA, adresse, et le
 * nom de l'entreprise s'il est vide). Les champs restent modifiables.
 *
 * Les données viennent de l'API Sirene INSEE via notre proxy /api/insee/search.
 */

type InseeResult = {
  siret: string | null;
  siren: string | null;
  denomination: string;
  adresse: string;
  codePostal: string | null;
  ville: string | null;
};

/** TVA intracommunautaire FR calculée depuis le SIREN. */
function frVat(siren: string | null): string {
  if (!siren || !/^\d{9}$/.test(siren)) return "";
  const key = (12 + 3 * (Number(siren) % 97)) % 97;
  return `FR${String(key).padStart(2, "0")}${siren}`;
}

export function InseeLookup() {
  const companyName = useField<string>({ path: "companyName" });
  const raisonSociale = useField<string>({ path: "raisonSociale" });
  const siren = useField<string>({ path: "siren" });
  const vatNumber = useField<string>({ path: "vatNumber" });
  const billingAddress = useField<string>({ path: "billingAddress" });

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<InseeResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);

  // Recherche débouncée dès 3 caractères.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/insee/search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
        });
        const data = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(
            data?.error === "insee_not_configured"
              ? "Recherche INSEE non configurée (clé API manquante)."
              : "Recherche INSEE indisponible pour le moment.",
          );
          setResults([]);
        } else {
          setError(null);
          setResults((data?.results ?? []) as InseeResult[]);
          setOpen(true);
        }
      } catch {
        if (!cancelled) {
          setError("Recherche INSEE indisponible.");
          setResults([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query]);

  // Ferme la liste au clic extérieur.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const select = (r: InseeResult) => {
    raisonSociale.setValue(r.denomination);
    if (r.siren) {
      siren.setValue(r.siren);
      vatNumber.setValue(frVat(r.siren));
    }
    if (r.adresse) billingAddress.setValue(r.adresse);
    if (!companyName.value) companyName.setValue(r.denomination);
    setQuery(r.denomination);
    setOpen(false);
  };

  return (
    <div className="tim-insee" ref={boxRef}>
      <label className="field-label" htmlFor="tim-insee-input">
        Rechercher l'entreprise (INSEE)
      </label>
      <p className="tim-insee__hint">
        Raison sociale, SIREN (9 chiffres) ou SIRET (14) → préremplit les champs de facturation.
      </p>
      <div className="tim-insee__control">
        <input
          id="tim-insee-input"
          className="tim-insee__input"
          type="text"
          autoComplete="off"
          placeholder="Ex : Tim Management, ou 908…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
        />
        {loading && <span className="tim-insee__spin" aria-hidden="true" />}
      </div>

      {error && <p className="tim-insee__error">{error}</p>}

      {open && results.length > 0 && (
        <ul className="tim-insee__list">
          {results.map((r) => (
            <li key={r.siret ?? r.siren}>
              <button type="button" className="tim-insee__item" onClick={() => select(r)}>
                <span className="tim-insee__name">{r.denomination}</span>
                <span className="tim-insee__meta">
                  {r.siren ? `SIREN ${r.siren}` : ""}
                  {r.ville ? ` · ${r.ville}` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && !error && results.length === 0 && query.trim().length >= 3 && (
        <p className="tim-insee__empty">Aucune entreprise trouvée (essayez le SIREN).</p>
      )}
    </div>
  );
}
