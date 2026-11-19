"use client";

import { useConfig } from "@payloadcms/ui";
import { useState } from "react";

/**
 * En tête des recommandations de Sergey : « Ce que montrent nos résultats » (étape 6).
 * Chaque critère de la note croisé avec les clics, la position, les visites venues des IA
 * et les citations dans la réponse IA de Google. Repliable ; chargé à l'ouverture.
 * Ce sont des corrélations, jamais des preuves : l'avertissement est toujours affiché.
 */
type Group = { contenus: number; clics28jMedian: number | null; positionMediane: number | null; visitesIAMoyenne: number | null; citeDansLaReponseIAdeGoogle: string };
type Row = { id: string; critere: string; poids: number; niveauDePreuve: string; respecte: Group; nonRespecte: Group; verdict: string };
type Evidence = { avertissement: string; articles: number; parCritere: Row[]; variationsDuesAuxRegles: { contenu: string; avant: string; apres: string }[] };

const cell = (g: Group) => `${g.contenus} · ${g.clics28jMedian ?? "—"} clics · pos. ${g.positionMediane ?? "—"} · IA ${g.visitesIAMoyenne ?? "—"} · ${g.citeDansLaReponseIAdeGoogle}`;

export function RuleEvidencePanel() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Evidence | null>(null);
  const [error, setError] = useState<string | null>(null);

  const toggle = () => {
    setOpen((v) => !v);
    if (!data && !error)
      fetch(`${api}/article-rule-proposals/evidence`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`Erreur ${r.status}`))))
        .then(setData)
        .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  };

  return (
    <div className="art-board">
      <button type="button" className="art-btn art-btn--ghost" onClick={toggle} aria-expanded={open}>
        {open ? "Masquer" : "Voir"} ce que montrent nos résultats, critère par critère
      </button>
      {open && (
        <div className="cdr-diff">
          {error && <p className="cdr-muted">Indisponible : {error}</p>}
          {!data && !error && <p className="cdr-muted">Calcul…</p>}
          {data && (
            <>
              <p className="cdr-muted">{data.avertissement}</p>
              <div className="rev-table-wrap">
                <table className="rev-table">
                  <thead>
                    <tr>
                      <th>Critère</th>
                      <th>Respecté (contenus · clics 28 j médians · position · visites IA · cité par l'IA de Google)</th>
                      <th>Non respecté</th>
                      <th>Lecture</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.parCritere.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.critere}</strong>
                          <br />
                          <span className="cdr-muted">
                            {r.id} · poids {r.poids} · preuve {r.niveauDePreuve}
                          </span>
                        </td>
                        <td>{cell(r.respecte)}</td>
                        <td>{cell(r.nonRespecte)}</td>
                        <td>{r.verdict}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {data.variationsDuesAuxRegles.length > 0 && (
                <>
                  <h4>Notes changées par une nouvelle version des règles</h4>
                  <ul className="cdr-list">
                    {data.variationsDuesAuxRegles.map((v) => (
                      <li key={v.contenu}>
                        {v.contenu} : {v.avant} → {v.apres}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
