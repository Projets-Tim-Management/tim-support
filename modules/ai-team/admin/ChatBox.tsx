"use client";

import { useEffect, useRef, useState } from "react";

import { Portrait } from "@/modules/ai-team/lib/portraits";

/**
 * La conversation avec un chef de l'équipe IA, sur sa fiche (Équipe IA).
 *
 * Une messagerie : la direction à droite, le chef à gauche avec son visage,
 * « Margaux écrit… » pendant qu'elle répond. Au départ, trois questions toutes
 * faites pour lancer la discussion. Les échanges sont gardés côté serveur
 * (ai-team-messages) : la page les relit à chaque visite.
 */

export type ChatMessage = { id: string; from: "direction" | "agent"; text: string; at: string };

const STARTERS = ["Où en sont nos campagnes ?", "Qu'est-ce qui attend ma décision ?", "Que fait ton équipe en ce moment ?"];

const time = (iso: string) => new Date(iso).toLocaleString("fr-FR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" });

export function ChatBox({ memberKey, name, portrait, initial }: { memberKey: string; name: string; portrait: string; initial: ChatMessage[] }) {
  const [messages, setMessages] = useState<ChatMessage[]>(initial);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [messages.length, busy]);

  const send = async (text: string) => {
    const t = text.trim();
    if (!t || busy) return;
    setError(null);
    setBusy(true);
    setDraft("");
    setMessages((m) => [...m, { id: `local-${Date.now()}`, from: "direction", text: t, at: new Date().toISOString() }]);
    try {
      const res = await fetch("/api/admin/ai-team/chat", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ member: memberKey, text: t }),
      });
      const data = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (!res.ok || !data.answer) throw new Error(data.error ?? "La réponse n'a pas pu être obtenue.");
      setMessages((m) => [...m, { id: `local-${Date.now()}-r`, from: "agent", text: data.answer!, at: new Date().toISOString() }]);
    } catch (e) {
      // Le message n'a pas été gardé : on le retire et on le rend au champ, pour réessayer.
      setMessages((m) => m.slice(0, -1));
      setDraft(t);
      setError(e instanceof Error ? e.message : "La réponse n'a pas pu être obtenue.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ait-chat" aria-label={`Conversation avec ${name}`}>
      <h3 className="ait-h3">💬 Écrire à {name}</h3>
      <div className="ait-chat__thread">
        {messages.length === 0 && (
          <div className="ait-msg">
            <Portrait portrait={portrait} size={34} title={name} />
            <div className="ait-bubble">
              <p className="ait-bubble__text">Bonjour ! Posez-moi vos questions sur nos campagnes et sur le travail de l&apos;équipe : je vous réponds avec ce que je sais.</p>
            </div>
          </div>
        )}
        {messages.map((m) =>
          m.from === "agent" ? (
            <div key={m.id} className="ait-msg">
              <Portrait portrait={portrait} size={34} title={name} />
              <div className="ait-bubble">
                <p className="ait-bubble__text ait-bubble__text--long">{m.text}</p>
                <span className="ait-bubble__when">{time(m.at)}</span>
              </div>
            </div>
          ) : (
            <div key={m.id} className="ait-msg ait-msg--reply">
              <div className="ait-bubble ait-bubble--reply">
                <p className="ait-bubble__text ait-bubble__text--long">{m.text}</p>
                <span className="ait-bubble__when">{time(m.at)}</span>
              </div>
            </div>
          ),
        )}
        {busy && (
          <div className="ait-msg">
            <Portrait portrait={portrait} size={34} title={name} />
            <div className="ait-bubble ait-typing" role="status">
              <span>{name} écrit</span>
              <span className="ait-typing__dots" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </div>
          </div>
        )}
        <div ref={end} />
      </div>

      {messages.length === 0 && !busy && (
        <div className="ait-chat__starters">
          {STARTERS.map((s) => (
            <button key={s} type="button" className="ait-starter" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}

      {error && <p className="ait-chat__error">{error}</p>}

      <form
        className="ait-chat__form"
        onSubmit={(e) => {
          e.preventDefault();
          void send(draft);
        }}
      >
        <textarea
          className="ait-chat__input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void send(draft);
            }
          }}
          placeholder={`Votre message à ${name}… (Entrée pour envoyer)`}
          rows={2}
          maxLength={1500}
          disabled={busy}
        />
        <button type="submit" className="ait-chat__send" disabled={busy || !draft.trim()}>
          Envoyer
        </button>
      </form>
    </section>
  );
}
