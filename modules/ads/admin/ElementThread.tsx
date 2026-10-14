"use client";

import { toast, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { claudeCodeLink } from "@/modules/dev/lib/claude-code-link";
import { paramSpecs } from "@/modules/ads/video/element-params";
import { isElementType } from "@/modules/ads/video/elements";

/**
 * Le fil d'amélioration d'un élément (atelier des éléments) : les idées de
 * Charlie, les propositions de l'IA (réglages et explication) et ce qui en a
 * été fait. Chaque bouton EST le geste : proposer, appliquer, en faire une
 * variante, écarter, transmettre au développement, ouvrir dans Claude Code,
 * dupliquer, restaurer une version.
 */

type Note = {
  id: number;
  kind: "idee" | "proposition" | "decision";
  body: string;
  status?: string | null;
  proposal?: { params?: Record<string, unknown>; name?: string; whenToUse?: string; outside?: string } | null;
  author?: { name?: string; email?: string } | null;
  variant?: { id: number; name: string } | number | null;
  development?: { id: number; title: string } | number | null;
  createdAt: string;
};
type Version = { n: number; at: string; by: string | null; note: string };

const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const STATUS: Record<string, { label: string; tone: string }> = {
  "a-decider": { label: "À décider", tone: "orange" },
  appliquee: { label: "Appliquée", tone: "vert" },
  variante: { label: "Devenue variante", tone: "vert" },
  ecartee: { label: "Écartée", tone: "gris" },
  "hors-reglages": { label: "Hors réglages", tone: "rouge" },
  developpement: { label: "Transmise au développement", tone: "bleu" },
};

export function ElementThread() {
  const { id } = useDocumentInfo();
  const base = useFormFields(([f]) => f?.base?.value as string | undefined);
  const versions = useFormFields(([f]) => (f?.versions?.value as Version[] | undefined) ?? []);
  const [notes, setNotes] = useState<Note[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const router = useRouter();

  const load = useCallback(async () => {
    if (!id) return;
    const r = await fetch(`/payload-api/ad-element-notes?where[element][equals]=${encodeURIComponent(String(id))}&sort=createdAt&depth=1&limit=200`, { credentials: "include" });
    if (r.ok) setNotes(((await r.json()) as { docs: Note[] }).docs);
  }, [id]);
  useEffect(() => {
    void load();
  }, [load]);

  const act = async (what: string, body: Record<string, unknown>, done: string, reload = false) => {
    setBusy(what);
    try {
      const res = await fetch(`/api/admin/ads/elements/${encodeURIComponent(String(id))}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json().catch(() => ({}))) as { error?: string; variant?: number; id?: number };
      if (!res.ok) throw new Error(data.error || String(res.status));
      toast.success(done);
      if (body.action === "dupliquer" && data.id) router.push(`/admin/collections/ad-elements/${data.id}`);
      else if (body.decision === "variante" && data.variant) router.push(`/admin/collections/ad-elements/${data.variant}`);
      else if (reload) window.location.reload();
      else await load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!id) return <p className="ads-elthread__hint">Enregistrez l&apos;élément pour ouvrir son fil d&apos;amélioration.</p>;
  const labels = isElementType(base) ? new Map(paramSpecs(base).map((s) => [s.key, s.label])) : new Map<string, string>();

  return (
    <section className="ads-elthread" aria-label="Fil d'amélioration">
      <div className="ads-elthread__head">
        <h4>Fil d&apos;amélioration</h4>
        <button type="button" className="tim-btn" disabled={busy != null} onClick={() => act("dupliquer", { action: "dupliquer" }, "Copie créée en brouillon.")}>
          Dupliquer en variante
        </button>
      </div>

      <ol className="ads-elthread__list">
        {notes.map((n) => {
          const st = n.status ? STATUS[n.status] : null;
          const dev = n.development && typeof n.development === "object" ? n.development : null;
          const variant = n.variant && typeof n.variant === "object" ? n.variant : null;
          return (
            <li key={n.id} className={`ads-elthread__note ads-elthread__note--${n.kind}`}>
              <div className="ads-elthread__meta">
                <strong>{n.kind === "idee" ? (n.author?.name ?? n.author?.email ?? "Idée") : n.kind === "proposition" ? "Proposition de l'IA" : "Décision"}</strong>
                <span>{when(n.createdAt)}</span>
                {st && <span className={`tim-status-pill ads-rush-stage ads-rush-stage--${st.tone}`}>{st.label}</span>}
              </div>
              <p className="ads-elthread__body">{n.body}</p>
              {n.kind === "proposition" && n.proposal?.params && Object.keys(n.proposal.params).length > 0 && (
                <ul className="ads-elthread__params">
                  {Object.entries(n.proposal.params).map(([k, v]) => (
                    <li key={k}>
                      {labels.get(k) ?? k} : <strong>{String(v)}</strong>
                    </li>
                  ))}
                </ul>
              )}
              {n.proposal?.outside && n.status !== "a-decider" && <p className="ads-elthread__outside">À développer : {n.proposal.outside}</p>}
              {n.status === "a-decider" && (
                <div className="ads-elthread__actions">
                  <button type="button" className="tim-btn tim-btn--primary" disabled={busy != null} onClick={() => act(`a${n.id}`, { action: "decider", note: n.id, decision: "appliquer" }, "Appliquée : nouvelle version de l'élément.", true)}>
                    Appliquer
                  </button>
                  <button type="button" className="tim-btn" disabled={busy != null} onClick={() => act(`v${n.id}`, { action: "decider", note: n.id, decision: "variante" }, "Variante créée en brouillon.")}>
                    Créer une variante{n.proposal?.name ? ` « ${n.proposal.name} »` : ""}
                  </button>
                  <button type="button" className="tim-btn" disabled={busy != null} onClick={() => act(`e${n.id}`, { action: "decider", note: n.id, decision: "ecarter" }, "Proposition écartée.")}>
                    Écarter
                  </button>
                </div>
              )}
              {n.status === "hors-reglages" && (
                <div className="ads-elthread__actions">
                  <button type="button" className="tim-btn tim-btn--primary" disabled={busy != null} onClick={() => act(`d${n.id}`, { action: "developpement", note: n.id }, "Demande créée dans le Suivi des développements.")}>
                    Transmettre au développement
                  </button>
                </div>
              )}
              {variant && (
                <a className="ads-elthread__link" href={`/admin/collections/ad-elements/${variant.id}`}>
                  Ouvrir la variante « {variant.name} »
                </a>
              )}
              {dev && (
                <div className="ads-elthread__actions">
                  <a className="tim-btn" href={`/admin/collections/developments/${dev.id}`}>
                    Voir la demande n°{dev.id}
                  </a>
                  <a className="tim-btn tim-btn--primary" href={claudeCodeLink(dev)}>
                    Ouvrir dans Claude Code
                  </a>
                </div>
              )}
            </li>
          );
        })}
        {!notes.length && <li className="ads-elthread__hint">Aucune note pour l&apos;instant : écrivez une idée ci-dessous.</li>}
      </ol>

      <div className="ads-elthread__form">
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} maxLength={2000} placeholder="Votre idée : « la coche devrait rebondir plus », « une version en verre dépoli pour poser sur les rushes »…" aria-label="Votre idée" />
        <div className="ads-elthread__actions">
          <button
            type="button"
            className="tim-btn"
            disabled={busy != null || text.trim().length < 3}
            onClick={async () => {
              await act("idee", { action: "idee", texte: text }, "Idée ajoutée au fil.");
              setText("");
            }}
          >
            Ajouter l&apos;idée
          </button>
          <button type="button" className="tim-btn tim-btn--primary" disabled={busy != null || !notes.some((n) => n.kind === "idee")} onClick={() => act("proposer", { action: "proposer" }, "Proposition de l'IA ajoutée au fil.")}>
            {busy === "proposer" ? "L'IA réfléchit…" : "Proposer une amélioration"}
          </button>
        </div>
      </div>

      {versions.length > 0 && (
        <details className="ads-elthread__versions">
          <summary>Versions ({versions.length})</summary>
          <ol>
            {[...versions].reverse().map((v, i) => (
              <li key={v.n}>
                <span>
                  v{v.n} · {when(v.at)}
                  {v.by ? ` · ${v.by}` : ""} — {v.note}
                </span>
                {i > 0 && (
                  <button type="button" className="tim-btn" disabled={busy != null} onClick={() => act(`r${v.n}`, { action: "restaurer", version: v.n }, `Version ${v.n} restaurée.`, true)}>
                    Restaurer
                  </button>
                )}
              </li>
            ))}
          </ol>
        </details>
      )}
    </section>
  );
}
