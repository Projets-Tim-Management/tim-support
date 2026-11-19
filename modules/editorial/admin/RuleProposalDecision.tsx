"use client";

import { useConfig, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useState } from "react";

/**
 * Décision de Charlie sur une recommandation de Sergey (barre latérale) :
 * « Valider » (le changement s'applique et crée une nouvelle version des
 * règles ; socle = à développer) ou « Refuser » avec un motif.
 */
export function RuleProposalDecision() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { id } = useDocumentInfo();
  const status = useFormFields(([f]) => f.status?.value) as string | undefined;
  const part = useFormFields(([f]) => f.part?.value) as string | undefined;
  const [refusing, setRefusing] = useState(false);
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!id || status !== "proposee") return null;
  const socle = /^\s*A\d*\b/i.test(String(part ?? ""));

  const send = async (action: "valider" | "refuser") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${api}/article-rule-proposals/${id}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, motif }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="art-decision">
      <strong className="art-decision__title">Ta décision</strong>
      <p className="art-decision__label">
        {socle ? "Cette recommandation touche le socle vérifié par le code (partie A) : validée, elle devient un développement." : "Validée, elle s'applique aux règles et crée une nouvelle version, que suivra le rédacteur."}
      </p>
      {refusing ? (
        <>
          <label className="art-decision__label" htmlFor="rule-motif">
            Pourquoi la refuser ? (elle ne sera plus reproposée)
          </label>
          <textarea id="rule-motif" className="art-decision__motif" rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} />
          <div className="art-decision__row">
            <button type="button" className="art-btn" disabled={busy || !motif.trim()} onClick={() => send("refuser")}>
              Confirmer le refus
            </button>
            <button type="button" className="art-btn art-btn--ghost" disabled={busy} onClick={() => setRefusing(false)}>
              Annuler
            </button>
          </div>
        </>
      ) : (
        <div className="art-decision__row">
          <button type="button" className="art-btn" disabled={busy} onClick={() => send("valider")}>
            Valider
          </button>
          <button type="button" className="art-btn art-btn--danger" disabled={busy} onClick={() => setRefusing(true)}>
            Refuser
          </button>
        </div>
      )}
      {error && <p className="art-decision__error">{error}</p>}
    </div>
  );
}
