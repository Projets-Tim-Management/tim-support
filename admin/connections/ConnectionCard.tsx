"use client";

import { toast } from "@payloadcms/ui";
import { useState } from "react";

import type { EnvState, SupportConnection } from "@/core/lib/support-connections";

/**
 * Une connexion du support, en carte REPLIÉE : la barre dit le nom, l'état
 * (liseré et texte) et porte le bouton « Tester » ; dépliée, on lit à quoi
 * elle sert, ses variables (posée ou manquante — jamais la valeur), le dernier
 * résultat, et des notes qu'on garde. Quatre cartes ouvertes faisaient un mur ;
 * quatre barres se lisent d'un coup d'œil, et on n'ouvre que celle qui pose
 * question.
 *
 * Le test et les notes passent par /api/admin/support-connections ; aucune clé
 * ne transite, dans un sens ni dans l'autre.
 */
export type Entry = {
  notes?: string | null;
  lastTestAt?: string | null;
  lastTestOk?: boolean | null;
  lastTestMessage?: string | null;
};

const quand = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

export function ConnectionCard({ def, env, configured, initial }: { def: SupportConnection; env: EnvState[]; configured: boolean; initial: Entry }) {
  const [entry, setEntry] = useState<Entry>(initial);
  const [notes, setNotes] = useState(initial.notes ?? "");
  const [busy, setBusy] = useState<"test" | "notes" | null>(null);

  const call = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/admin/support-connections", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: def.key, ...body }),
    });
    const data = (await res.json().catch(() => ({}))) as { entry?: Entry; error?: string };
    if (!res.ok || !data.entry) throw new Error(data.error || String(res.status));
    return data.entry;
  };

  const test = async () => {
    setBusy("test");
    try {
      const e = await call({ action: "test" });
      setEntry(e);
      if (e.lastTestOk) toast.success(`${def.name} : ${e.lastTestMessage}`);
      else toast.error(`${def.name} : ${e.lastTestMessage}`);
    } catch (err) {
      toast.error((err as Error).message || "Le test n'a pas pu être lancé.");
    } finally {
      setBusy(null);
    }
  };

  const saveNotes = async () => {
    if (notes === (entry.notes ?? "")) return;
    setBusy("notes");
    try {
      setEntry(await call({ action: "notes", notes }));
      toast.success("Notes enregistrées.");
    } catch (err) {
      toast.error((err as Error).message || "Les notes n'ont pas pu être enregistrées.");
    } finally {
      setBusy(null);
    }
  };

  const tone = !configured ? "missing" : entry.lastTestAt == null ? "untested" : entry.lastTestOk ? "ok" : "ko";
  const etat = !configured
    ? "Variables manquantes"
    : entry.lastTestAt == null
      ? "Jamais testée"
      : entry.lastTestOk
        ? `OK le ${quand(entry.lastTestAt)}`
        : `Échec le ${quand(entry.lastTestAt)}`;

  return (
    <details className={`sc-card sc-card--${tone}`}>
      {/* La barre plie et déplie ; le bouton « Tester » y vit sans la faire
          bouger (stopPropagation + preventDefault sur un <summary>). */}
      <summary className="sc-card__head">
        <span className="sc-card__mark" aria-hidden>
          {def.mark}
        </span>
        <span className="sc-card__title">
          <span className="sc-card__name">{def.name}</span>
          <span className={`sc-card__state sc-card__state--${tone}`}>{etat}</span>
        </span>
        <span className="sc-card__actions">
          <button
            type="button"
            className="tim-btn tim-btn--primary"
            disabled={busy != null || !configured}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              void test();
            }}
            title={def.testLabel}
          >
            {busy === "test" ? "Test en cours…" : "Tester"}
          </button>
          <span className="sc-card__chevron" aria-hidden>
            ›
          </span>
        </span>
      </summary>

      <div className="sc-card__body">
      <p className="sc-card__purpose">{def.purpose}</p>

      <div className="sc-card__cols">
        <section className="sc-card__section">
          <h3 className="sc-card__h">Variables — sur Vercel</h3>
          <ul className="sc-env">
            {env.map((v) => (
              <li key={v.name} className={`sc-env__row sc-env__row--${v.set ? "set" : v.required ? "missing" : "optional"}`}>
                <span className="sc-env__dot" aria-hidden />
                <code className="sc-env__name">{v.name}</code>
                <span className="sc-env__state">{v.set ? (v.tail ?? "posée") : v.required ? "manquante" : "par défaut"}</span>
                <span className="sc-env__hint">{v.hint}</span>
              </li>
            ))}
          </ul>
          <p className="sc-card__where">
            Se règle dans Vercel → Settings → Environment Variables (et dans <code>.env.local</code> pour le poste de dev). Une variable
            modifiée est prise au déploiement suivant.
          </p>
        </section>

        <section className="sc-card__section">
          <h3 className="sc-card__h">Ce qu'on lit et écrit</h3>
          <ul className="sc-scope">
            {def.scope.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
          <p className="sc-card__links">
            <a href={def.docUrl} target="_blank" rel="noreferrer">
              Documentation de l&apos;API ↗
            </a>
            {def.consoleUrl && (
              <a href={def.consoleUrl} target="_blank" rel="noreferrer">
                Console / clés chez eux ↗
              </a>
            )}
          </p>
          {entry.lastTestMessage && (
            <p className={`sc-card__result sc-card__result--${entry.lastTestOk ? "ok" : "ko"}`}>{entry.lastTestMessage}</p>
          )}
        </section>
      </div>

      <section className="sc-card__section sc-card__notes">
        <h3 className="sc-card__h">Notes</h3>
        <textarea
          className="sc-notes"
          rows={2}
          placeholder="Interlocuteur, date d'expiration de la clé, procédure de renouvellement…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={() => void saveNotes()}
        />
        {busy === "notes" && <span className="sc-card__saving">Enregistrement…</span>}
      </section>
      </div>
    </details>
  );
}
