"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

import type { ClosedItem, InboxItem } from "@/modules/ai-team/lib/inbox";
import { Portrait } from "@/modules/ai-team/lib/portraits";

/**
 * « Vos demandes », en tête de l'organigramme : ce que les chefs attendent de
 * la direction, sous deux formes seulement —
 *  - 🔗 « À faire » : le bouton qui ouvre la bonne page, les étapes, puis
 *    « C'est fait » (un mot facultatif) ;
 *  - 💬 « Question » : la réponse en texte.
 * Les rappels de « À valider » s'y trouvent aussi ; ils se ferment en décidant
 * là-bas.
 */

type Who = { name: string; portrait: string };

const ago = (iso: string) => {
  const d = Math.round((Date.now() - Date.parse(iso)) / 86400_000);
  return d <= 0 ? "aujourd'hui" : d === 1 ? "hier" : `il y a ${d} jours`;
};

function Card({ item, who }: { item: InboxItem; who: Who | undefined }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = item.source === "chef" ? item.id.replace(/^r-/, "") : null;
  const external = item.url ? /^https:/.test(item.url) : false;

  const close = async (action: "fait" | "repondre" | "retirer") => {
    if (!requestId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/ai-team/requests/${requestId}`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, texte: text }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Pas enregistré, réessayez.");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pas enregistré, réessayez.");
      setBusy(false);
    }
  };

  return (
    <li className={`ait-req ait-req--${item.kind}`}>
      <header className="ait-req__head">
        {who && <Portrait portrait={who.portrait} size={34} title={who.name} />}
        <span className="ait-req__who">
          <span className="ait-req__tag">{item.kind === "question" ? "💬 Question" : "🔗 À faire"}</span>
          <strong className="ait-req__title">{item.title}</strong>
          <span className="ait-req__meta">
            {who ? `${who.name} · ` : ""}
            {ago(item.at)}
            {item.campaign ? ` · ${item.campaign}` : ""}
          </span>
        </span>
      </header>
      {item.why && <p className="ait-req__why">{item.why}</p>}

      {item.kind === "a-faire" ? (
        <>
          {item.steps.length > 0 && (
            <ol className="ait-req__steps">
              {item.steps.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          )}
          <div className="ait-req__actions">
            {item.url &&
              (external ? (
                <a className="ait-req__go" href={item.url} target="_blank" rel="noreferrer noopener">
                  Ouvrir la page ↗
                </a>
              ) : (
                <Link className="ait-req__go" href={item.url} prefetch={false}>
                  Ouvrir la page →
                </Link>
              ))}
            {item.source === "chef" ? (
              <>
                <input className="ait-req__note" value={text} onChange={(e) => setText(e.target.value)} placeholder="Un mot pour l'équipe (facultatif)" maxLength={2000} disabled={busy} />
                <button type="button" className="ait-req__done" onClick={() => close("fait")} disabled={busy}>
                  ✓ C&apos;est fait
                </button>
              </>
            ) : (
              <span className="ait-req__hint">Se ferme quand vous décidez dans « À valider ».</span>
            )}
          </div>
        </>
      ) : (
        <>
          {item.question && <p className="ait-req__question">{item.question}</p>}
          <div className="ait-req__answer">
            <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Votre réponse…" rows={2} maxLength={2000} disabled={busy} />
            <button type="button" className="ait-req__done" onClick={() => close("repondre")} disabled={busy || !text.trim()}>
              Envoyer la réponse
            </button>
          </div>
        </>
      )}
      {item.source === "chef" && (
        <button type="button" className="ait-req__dismiss" onClick={() => close("retirer")} disabled={busy}>
          Retirer cette demande
        </button>
      )}
      {error && <p className="ait-req__error">{error}</p>}
    </li>
  );
}

export function Inbox({ open, closed, people }: { open: InboxItem[]; closed: ClosedItem[]; people: Record<string, Who> }) {
  return (
    <section className="ait-inbox" aria-label="Vos demandes">
      <h2 className="ait-inbox__title">
        📬 Vos demandes {open.length > 0 && <span className="ait-inbox__count">{open.length}</span>}
      </h2>
      {open.length ? (
        <ol className="ait-inbox__list">
          {open.map((item) => (
            <Card key={item.id} item={item} who={item.memberKey ? people[item.memberKey] : undefined} />
          ))}
        </ol>
      ) : (
        <p className="ait-inbox__empty">🎉 Rien ne vous attend : l&apos;équipe a tout ce qu&apos;il lui faut.</p>
      )}
      {closed.length > 0 && (
        <details className="ait-detail">
          <summary>Traitées récemment ({closed.length})</summary>
          <ul className="ait-inbox__closed">
            {closed.map((c) => (
              <li key={c.id}>
                <span>{c.status === "repondue" ? "💬" : "✓"}</span> <strong>{c.title}</strong>
                {c.memberKey && people[c.memberKey] ? ` — ${people[c.memberKey].name}` : ""}
                {c.answer ? <span className="ait-inbox__answer"> · « {c.answer.length > 140 ? `${c.answer.slice(0, 139)}…` : c.answer} »</span> : null}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}
