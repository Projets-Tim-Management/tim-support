"use client";

import { useAuth } from "@payloadcms/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import React, { useCallback, useEffect, useRef, useState } from "react";

import type { AssistantData, AssistantItem } from "./data-assistant";

/**
 * L'assistant : une bulle fixée en bas à droite, un panneau à deux onglets.
 *
 *   - « À faire » : les rappels, calculés sans IA (data-assistant.ts) — une
 *     phrase par sujet, du plus pressé au moins pressé, chacun avec le lien
 *     qui mène au geste. La bulle porte leur nombre.
 *   - « Discussion » : Claude (core/lib/ai-assistant.ts), qui lit le support
 *     par des outils et répond. Le fil défile, le champ reste en bas. Chaque
 *     rappel a un « ? » qui pose la question à Claude — c'est le pont entre
 *     les deux.
 *
 * Rechargé à chaque changement de page et toutes les cinq minutes ; ouvert ou
 * fermé, l'onglet courant aussi, c'est retenu sur ce navigateur. La
 * conversation, elle, repart de zéro à chaque session.
 */
const REFRESH_MS = 5 * 60_000;
const OPEN_KEY = "tim-assistant-open";
const TAB_KEY = "tim-assistant-tab";

type Tab = "todo" | "chat";
type Turn = { role: "user" | "assistant"; content: string; pending?: boolean };
type Data = AssistantData & { ai?: boolean };

const SUGGESTIONS = ["Pourquoi ai-je ce rappel ?", "Comment est calculé le CA mensuel ?", "Quelles factures restent à valider ?"];

const salutation = (prenom: string | null) => {
  const heure = Number(
    new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", hourCycle: "h23" })
      .formatToParts(new Date())
      .find((p) => p.type === "hour")?.value ?? "12",
  );
  return `${heure < 18 ? "Bonjour" : "Bonsoir"}${prenom ? ` ${prenom}` : ""} 👋`;
};

const heure = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });

const remember = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* stockage indisponible */
  }
};
const recall = (key: string): string | null => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

/**
 * Le texte de Claude, rendu SANS HTML : on ne reconnaît que le markdown
 * simple qu'on lui demande — titres, listes, gras, italique, liens du support
 * (/admin/…) et URL. Tout le reste est du texte : une réponse de modèle n'est
 * jamais injectée telle quelle.
 */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|https?:\/\/\S+|\/admin\/[\w\-/?=&[\].%,]+)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (/^\*\*[^*]+\*\*$/.test(p)) return <strong key={i}>{p.slice(2, -2)}</strong>;
        if (/^\*[^*\n]+\*$/.test(p)) return <em key={i}>{p.slice(1, -1)}</em>;
        if (/^\/admin\//.test(p)) {
          const clean = p.replace(/[).,;]+$/, "");
          return (
            <Link key={i} href={clean} prefetch={false}>
              {clean}
            </Link>
          );
        }
        if (/^https?:\/\//.test(p)) {
          const clean = p.replace(/[).,;]+$/, "");
          return (
            <a key={i} href={clean} target="_blank" rel="noreferrer">
              {clean}
            </a>
          );
        }
        return <span key={i}>{p}</span>;
      })}
    </>
  );
}

function Rich({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  const blocks: React.ReactNode[] = [];
  let list: string[] = [];
  const flush = () => {
    if (list.length) {
      blocks.push(
        <ul key={`l${blocks.length}`} className="ta-md__list">
          {list.map((li, i) => (
            <li key={i}>
              <Inline text={li} />
            </li>
          ))}
        </ul>,
      );
      list = [];
    }
  };
  lines.forEach((raw, i) => {
    const line = raw.trimEnd();
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(line);
    if (item) {
      list.push(item[1]);
      return;
    }
    flush();
    if (line.trim() === "") return;
    const head = /^#{1,3}\s+(.*)$/.exec(line);
    if (head) {
      blocks.push(
        <p key={i} className="ta-md__head">
          <Inline text={head[1]} />
        </p>,
      );
      return;
    }
    blocks.push(
      <p key={i} className="ta-md__p">
        <Inline text={line} />
      </p>,
    );
  });
  flush();
  return <div className="ta-turn__text">{blocks}</div>;
}

function Reminder({ item, onAsk }: { item: AssistantItem; onAsk?: (q: string) => void }) {
  return (
    <li className={`ta-msg ta-msg--${item.tone}`}>
      <div className="ta-msg__body">
        <p className="ta-msg__text">{item.text}</p>
        {item.hint && <p className="ta-msg__hint">{item.hint}</p>}
        <Link className="ta-msg__cta" href={item.cta.href} prefetch={false}>
          {item.cta.label} ›
        </Link>
      </div>
      {onAsk && (
        <button
          type="button"
          className="ta-msg__ask"
          title="Demander à l'assistant pourquoi"
          aria-label="Demander à l'assistant pourquoi"
          onClick={() => onAsk(`Pourquoi ai-je ce rappel : « ${item.text} » ? Que dois-je faire ?`)}
        >
          ?
        </button>
      )}
    </li>
  );
}

export default function AssistantWidget() {
  const { user } = useAuth();
  const pathname = usePathname();
  const [data, setData] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("todo");
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setOpen(recall(OPEN_KEY) === "1");
    if (recall(TAB_KEY) === "chat") setTab("chat");
  }, []);

  const toggle = () => {
    setOpen((o) => {
      remember(OPEN_KEY, o ? "0" : "1");
      return !o;
    });
  };
  const switchTab = (t: Tab) => {
    setTab(t);
    remember(TAB_KEY, t);
  };

  useEffect(() => {
    if (!user) return;
    let active = true;
    const load = () =>
      fetch("/api/admin/assistant", { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: Data | null) => {
          if (active && d) setData(d);
        })
        .catch(() => {});
    void load();
    const t = setInterval(load, REFRESH_MS);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [user, pathname]);

  // Le fil descend au dernier message, comme une conversation.
  useEffect(() => {
    if (tab === "chat") endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, tab, open]);

  const ask = useCallback(
    async (question: string) => {
      const q = question.trim();
      if (!q || busy) return;
      const next: Turn[] = [...turns, { role: "user", content: q }];
      setTurns([...next, { role: "assistant", content: "", pending: true }]);
      setDraft("");
      setBusy(true);
      setAiError(null);
      try {
        const res = await fetch("/api/admin/assistant/ask", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: next.map(({ role, content }) => ({ role, content })) }),
        });
        const d = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
        if (!res.ok || !d.text) throw new Error(d.error || String(res.status));
        setTurns([...next, { role: "assistant", content: d.text }]);
      } catch (e) {
        setTurns(next);
        setAiError((e as Error).message || "Claude n'a pas répondu.");
      } finally {
        setBusy(false);
      }
    },
    [busy, turns],
  );

  /** Depuis un rappel : on bascule sur la discussion et on pose la question. */
  const askFromReminder = (q: string) => {
    switchTab("chat");
    void ask(q);
  };

  if (!user || !data) return null;
  const n = data.items.length;
  const ai = Boolean(data.ai);
  const showChat = ai && tab === "chat";

  return (
    <div className={`ta${open ? " ta--open" : ""}`}>
      {open && (
        <section className="ta-panel" aria-label="Assistant">
          <header className="ta-head">
            <span className="ta-head__avatar" aria-hidden>
              T
            </span>
            <span className="ta-head__title">
              <span className="ta-head__name">Assistant TIM</span>
              <span className="ta-head__sub">{n ? `${n} sujet${n > 1 ? "s" : ""} à traiter` : "Rien ne presse"}</span>
            </span>
            <button type="button" className="ta-head__close" aria-label="Réduire" onClick={toggle}>
              ×
            </button>
          </header>

          {ai && (
            <nav className="ta-tabs" aria-label="Sections de l'assistant">
              <button type="button" className={`ta-tab${!showChat ? " ta-tab--on" : ""}`} aria-pressed={!showChat} onClick={() => switchTab("todo")}>
                À faire
                {n > 0 && <span className="ta-tab__count">{n}</span>}
              </button>
              <button type="button" className={`ta-tab${showChat ? " ta-tab--on" : ""}`} aria-pressed={showChat} onClick={() => switchTab("chat")}>
                Discussion
                {turns.length > 0 && <span className="ta-tab__count ta-tab__count--soft">{Math.ceil(turns.length / 2)}</span>}
              </button>
            </nav>
          )}

          {!showChat ? (
            <div className="ta-thread" key="todo">
              <div className="ta-bubble">
                <p>{salutation(data.prenom)}</p>
                {(n > 0 || data.today > 0) && (
                  <p>
                    {n > 0
                      ? `Voici ce qui vous attend${data.today ? `, et ${data.today} action${data.today > 1 ? "s" : ""} prévue${data.today > 1 ? "s" : ""} aujourd'hui` : ""}.`
                      : `${data.today} action${data.today > 1 ? "s" : ""} prévue${data.today > 1 ? "s" : ""} aujourd'hui.`}
                  </p>
                )}
              </div>
              {n > 0 && (
                <ul className="ta-list">
                  {data.items.map((it) => (
                    <Reminder key={it.key} item={it} onAsk={ai ? askFromReminder : undefined} />
                  ))}
                </ul>
              )}
              <p className="ta-time">Mis à jour à {heure(data.generatedAt)}</p>
            </div>
          ) : (
            <>
              <div className="ta-thread" key="chat">
                {turns.length === 0 ? (
                  <>
                    <div className="ta-bubble">
                      <p>
                        Posez-moi une question sur les données ou les règles du support — je lis les fiches, les parcours, le rapprochement, et
                        j&apos;explique.
                      </p>
                    </div>
                    <div className="ta-suggest">
                      {SUGGESTIONS.map((s) => (
                        <button key={s} type="button" className="ta-suggest__btn" onClick={() => void ask(s)}>
                          {s}
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  turns.map((t, i) => (
                    <div key={i} className={`ta-turn ta-turn--${t.role}${t.pending ? " ta-turn--pending" : ""}`}>
                      {t.pending ? (
                        <span className="ta-dots" aria-label="Claude réfléchit">
                          <i />
                          <i />
                          <i />
                        </span>
                      ) : (
                        <Rich text={t.content} />
                      )}
                    </div>
                  ))
                )}
                {aiError && <p className="ta-error">{aiError}</p>}
                <div ref={endRef} />
              </div>

              <form
                className="ta-ask"
                onSubmit={(e) => {
                  e.preventDefault();
                  void ask(draft);
                }}
              >
                <input
                  type="text"
                  className="ta-ask__input"
                  placeholder="Poser une question…"
                  value={draft}
                  disabled={busy}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                />
                <button type="submit" className="ta-ask__send" disabled={busy || !draft.trim()} aria-label="Envoyer">
                  ➤
                </button>
              </form>
              <p className="ta-ask__note">
                Lecture seule ; Claude peut se tromper — vérifiez sur la fiche.
                {turns.length > 0 && (
                  <>
                    {" · "}
                    <button type="button" className="ta-ask__clear" onClick={() => setTurns([])}>
                      Effacer
                    </button>
                  </>
                )}
              </p>
            </>
          )}
        </section>
      )}

      <button type="button" className="ta-fab" aria-label={open ? "Réduire l'assistant" : "Ouvrir l'assistant"} aria-expanded={open} onClick={toggle}>
        <span className="ta-fab__icon" aria-hidden>
          {open ? "×" : "💬"}
        </span>
        {!open && n > 0 && <span className="ta-fab__badge">{n}</span>}
      </button>
    </div>
  );
}
