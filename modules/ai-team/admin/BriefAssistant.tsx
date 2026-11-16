"use client";

import { useDocumentInfo } from "@payloadcms/ui";
import { useEffect, useState } from "react";

import { BRIEF_SECTIONS } from "@/modules/ai-team/lib/brief-sections";

/**
 * L'assistant de la fiche produit & positionnement, en tête de la page : il
 * rédige un premier jet ou relit la fiche, puis chaque proposition s'accepte
 * (remplacer, ajouter) ou s'ignore, rubrique par rubrique, citation par
 * citation. Après une décision, la page se recharge pour montrer la fiche à
 * jour.
 */
type Quote = { quote: string; tag?: string | null; who?: string | null; source?: string | null };
type Proposals = { sections: Record<string, string>; quotes: Quote[]; note: string } | null;

async function post(body: unknown): Promise<string | null> {
  const res = await fetch("/api/admin/ai-team/brief", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (res?.ok) return null;
  const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
  return data?.error ?? "L'opération n'a pas abouti.";
}

export function BriefAssistant() {
  const { savedDocumentData } = useDocumentInfo();
  const [proposals, setProposals] = useState<Proposals>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setProposals(((savedDocumentData as { proposals?: Proposals } | undefined)?.proposals ?? null) as Proposals), [savedDocumentData]);

  const run = async () => {
    setBusy("run");
    setError(null);
    const err = await post({ run: true });
    setBusy(null);
    if (err) return setError(err);
    window.location.reload();
  };
  const decide = async (body: Record<string, unknown>, key: string) => {
    setBusy(key);
    const err = await post(body);
    setBusy(null);
    if (err) return setError(err);
    window.location.reload();
  };
  const sections = Object.entries(proposals?.sections ?? {});
  const quotes = proposals?.quotes ?? [];
  const label = (k: string) => BRIEF_SECTIONS.find((s) => s.key === k)?.label ?? k;

  return (
    <div className="brf">
      <div className="brf__head">
        <div>
          <strong>La fiche que lisent tous les agents</strong>
          <span>L&apos;assistant lit le site, le CRM (clients signés, affaires perdues, notes, e-mails reçus) et propose ; vous décidez, rubrique par rubrique. Une citation n&apos;est retenue que si elle existe mot pour mot dans le CRM.</span>
        </div>
        <button type="button" className="brf__run" onClick={run} disabled={busy !== null}>
          {busy === "run" ? "Lecture en cours… (1 à 2 min)" : sections.length || quotes.length ? "Relire à nouveau" : "Rédiger / relire avec l'IA"}
        </button>
      </div>
      {error && <p className="brf__error">{error}</p>}
      {proposals?.note && <p className="brf__note">{proposals.note}</p>}
      {sections.map(([k, text]) => (
        <div key={k} className="brf__prop">
          <span className="brf__prop-label">Proposition · {label(k)}</span>
          <p>{text}</p>
          <div className="brf__buttons">
            <button type="button" onClick={() => decide({ section: k, mode: "remplacer" }, k)} disabled={busy !== null}>
              Remplacer
            </button>
            <button type="button" onClick={() => decide({ section: k, mode: "ajouter" }, k)} disabled={busy !== null}>
              Ajouter à la fin
            </button>
            <button type="button" className="brf__ghost" onClick={() => decide({ section: k, mode: "ignorer" }, k)} disabled={busy !== null}>
              Ignorer
            </button>
          </div>
        </div>
      ))}
      {quotes.length > 0 && (
        <div className="brf__prop">
          <span className="brf__prop-label">Mots des clients trouvés dans le CRM</span>
          <ul className="brf__quotes">
            {quotes.map((q, i) => (
              <li key={`${q.quote}${i}`}>
                <span>
                  « {q.quote} »<small>{[q.tag, q.who, q.source].filter(Boolean).join(" · ")}</small>
                </span>
                <span className="brf__buttons">
                  <button type="button" onClick={() => decide({ quote: q.quote, mode: "ajouter" }, `q${i}`)} disabled={busy !== null}>
                    Garder
                  </button>
                  <button type="button" className="brf__ghost" onClick={() => decide({ quote: q.quote, mode: "ignorer" }, `q${i}`)} disabled={busy !== null}>
                    Ignorer
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
