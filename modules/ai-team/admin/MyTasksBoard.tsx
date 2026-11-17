"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ChatBox, type ChatMessage } from "@/modules/ai-team/admin/ChatBox";
import { postJson } from "@/modules/ai-team/admin/roadmap-ui";
import { groupOf, sortTasks, TASK_CATEGORIES, weekProgress, type MyTask, type TaskCategory, type TaskGroup } from "@/modules/ai-team/lib/my-tasks-shared";
import { Portrait } from "@/modules/ai-team/lib/portraits";

/**
 * « MES TÂCHES » (16/11/2026) — le seul endroit où la direction coche. Une ligne par tâche, la couleur de son bureau
 * (Commercial, SEO & GEO, Publicité, Entreprise) ; on l'ouvre pour voir le détail, cocher les étapes, copier les
 * prompts, répondre à une question, et en parler au chef qui l'a confiée.
 */

type Person = { name: string; portrait: string };

const GROUPS: { key: TaskGroup; label: string; icon: string; empty?: string }[] = [
  { key: "retard", label: "En retard", icon: "⏰" },
  { key: "semaine", label: "Cette semaine", icon: "📌", empty: "Rien d'autre cette semaine. 🎉" },
  { key: "plus-tard", label: "Plus tard", icon: "🗓️" },
  { key: "fait", label: "Fait ces 14 derniers jours", icon: "✅" },
  // Ce que Serge n'a pas vu finir et a reporté : repris cette semaine ou mis de côté — rien ne disparaît sans être vu.
  { key: "reportees", label: "Reportées la semaine passée", icon: "↪️" },
];

const dayFr = (d: string) => new Date(`${d.slice(0, 10)}T12:00:00Z`).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });
const slotFr = (s: { start: string; end: string }) => {
  const o = { timeZone: "Europe/Paris" } as const;
  return `${new Date(s.start).toLocaleDateString("fr-FR", { ...o, weekday: "short", day: "numeric", month: "short" })} ${new Date(s.start).toLocaleTimeString("fr-FR", { ...o, hour: "2-digit", minute: "2-digit" })}–${new Date(s.end).toLocaleTimeString("fr-FR", { ...o, hour: "2-digit", minute: "2-digit" })}`;
};
const duration = (m: number | null) => (m == null ? null : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);
const CAT = Object.fromEntries(TASK_CATEGORIES.map((c) => [c.value, c])) as Record<TaskCategory, (typeof TASK_CATEGORIES)[number]>;

/** L'appel au serveur qui correspond à un geste sur une tâche. */
function call(t: MyTask, gesture: { done?: boolean; step?: number; stepDone?: boolean; answer?: string; note?: string; drop?: boolean }): [string, unknown] {
  const n = t.id.slice(1);
  if (t.source === "demande") {
    if (gesture.step != null) return [`/api/admin/ai-team/requests/${n}`, { action: "etape", step: gesture.step, done: gesture.stepDone }];
    if (gesture.answer != null) return [`/api/admin/ai-team/requests/${n}`, { action: "repondre", texte: gesture.answer }];
    if (gesture.drop) return [`/api/admin/ai-team/requests/${n}`, { action: "retirer", texte: gesture.note ?? "" }];
    return [`/api/admin/ai-team/requests/${n}`, { action: gesture.done ? "fait" : "rouvrir", texte: gesture.note ?? "" }];
  }
  if (t.source === "objectif") {
    if (gesture.step != null) return [`/api/admin/ai-team/objectives/${n}`, { step: gesture.step, done: gesture.stepDone }];
    return [`/api/admin/ai-team/objectives/${n}`, { status: gesture.drop ? "abandonne" : gesture.done ? "fait" : "a-faire" }];
  }
  return ["/api/admin/ai-team/actions", { id: n, status: gesture.drop ? "abandonnee" : gesture.done ? "faite" : "prevue" }];
}

function Task({ t, today, people, chats, open, onOpen }: { t: MyTask; today: string; people: Record<string, Person>; chats: Record<string, ChatMessage[]>; open: boolean; onOpen: (id: string | null) => void }) {
  const router = useRouter();
  const [done, setDone] = useState(t.status === "fait");
  const [steps, setSteps] = useState(t.steps);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [talk, setTalk] = useState(false);
  const ref = useRef<HTMLLIElement>(null);
  // Après un rafraîchissement, l'état du serveur fait foi.
  useEffect(() => setDone(t.status === "fait"), [t.status]);
  useEffect(() => setSteps(t.steps), [t.steps]);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [open]);

  const chief = t.chief ? people[t.chief] : undefined;
  const group = groupOf({ ...t, status: done ? "fait" : t.status }, today);
  const doneSteps = steps.filter((s) => s.done).length;
  const nextStep = steps.findIndex((s) => !s.done);
  const total = steps.reduce((n, s) => n + (s.minutes ?? 0), 0) || t.minutes;
  // Le texte d'ouverture : ce qu'on voit, sinon pourquoi, sinon le détail ; le reste se déplie.
  const texts = [
    { icon: "🔍", label: "Ce qu'on voit", text: t.diagnosis },
    { icon: "💡", label: "Pourquoi", text: t.why },
    { icon: "📝", label: "Détail", text: t.notes },
    { icon: "🏆", label: "Ce que fait le mieux classé", text: t.benchmark },
    { icon: "📏", label: "Ce qu'on mesurera", text: t.measure },
  ].filter((b): b is { icon: string; label: string; text: string } => Boolean(b.text));
  const lead = texts.find((b) => b.label !== "Ce que fait le mieux classé" && b.label !== "Ce qu'on mesurera");
  const more = texts.filter((b) => b !== lead);
  const reported = t.status === "reporte";
  const checkable = t.source !== "a-valider" && t.form === "a-faire" && !reported;

  const send = async (gesture: Parameters<typeof call>[1], optimistic?: () => void, rollback?: () => void) => {
    setBusy(true);
    setError(null);
    optimistic?.();
    const [url, body] = call(t, gesture);
    const err = await postJson(url, body, "Pas enregistré, réessayez.");
    setBusy(false);
    if (err) {
      rollback?.();
      setError(err);
      return;
    }
    setText("");
    router.refresh();
  };
  const toggle = () =>
    send(
      { done: !done, note: text },
      () => setDone(!done),
      () => setDone(done),
    );
  const toggleStep = (i: number) => {
    const before = steps;
    const next = steps.map((s, k) => (k === i ? { ...s, done: !s.done } : s));
    void send(
      { step: i, stepDone: next[i].done },
      () => {
        setSteps(next);
        if (next.every((s) => s.done)) setDone(true);
        else if (done) setDone(false);
      },
      () => {
        setSteps(before);
        setDone(t.status === "fait");
      },
    );
  };

  return (
    <li ref={ref} className={`mt-task mt-cat--${t.category}${done ? " mt-task--done" : ""}${group === "retard" ? " mt-task--late" : ""}${open ? " mt-task--open" : ""}`}>
      <div className="mt-task__row">
        {checkable ? (
          <button type="button" className={`mt-check${done ? " mt-check--on" : ""}`} onClick={toggle} disabled={busy} aria-pressed={done} aria-label={done ? `Rouvrir « ${t.title} »` : `Cocher « ${t.title} » : faite`}>
            {done ? "✓" : ""}
          </button>
        ) : (
          <span className="mt-check mt-check--fixed" aria-hidden>
            {t.source === "a-valider" ? "↗" : reported ? "↪" : done ? "✓" : "?"}
          </span>
        )}
        <button type="button" className="mt-task__main" onClick={() => onOpen(open ? null : t.id)} aria-expanded={open}>
          <span className="mt-task__title">
            {t.urgent && <span className="mt-urgent">Urgent</span>}
            {t.form === "question" && !done && <span className="mt-kind">Question</span>}
            {t.title.replace(/^\s*🔴\s*(Urgent\s*—\s*)?/, "")}
          </span>
          <span className="mt-task__meta">
            <span className="mt-tag">
              {CAT[t.category].icon} {CAT[t.category].label}
            </span>
            {chief && (
              <span className="mt-task__who">
                <Portrait portrait={chief.portrait} size={18} title={chief.name} /> {t.from}
              </span>
            )}
            {!chief && t.from && <span>{t.from}</span>}
            {reported ? (
              <span className={t.carriedOver ? "mt-carried" : "mt-late"}>{t.carriedOver ? "Repris cette semaine par Serge" : "Mis de côté par Serge"}</span>
            ) : done && t.doneAt ? <span>fait le {dayFr(t.doneAt)}</span> : t.due ? <span className={group === "retard" ? "mt-late" : undefined}>{group === "retard" ? "en retard · " : "avant "}{dayFr(t.due)}</span> : <span>dès que possible</span>}
            {steps.length > 0 && t.stepsCheckable && (
              <span className="mt-steps-count">
                {doneSteps}/{steps.length} étapes
              </span>
            )}
            {t.minutes ? <span>⏱ {duration(t.minutes)}</span> : null}
          </span>
        </button>
        <span className="mt-task__chevron" aria-hidden>
          {open ? "▾" : "▸"}
        </span>
      </div>
      {steps.length > 0 && t.stepsCheckable && (
        <span className="mt-task__bar" aria-hidden>
          <span style={{ width: `${(doneSteps / steps.length) * 100}%` }} />
        </span>
      )}

      {open && (
        <div className="mt-detail">
          {/* L'essentiel d'abord : ce qu'on voit (ou pourquoi), puis les repères en pastilles. */}
          {lead && <p className="mt-lead">{lead.text}</p>}
          {(t.goal || t.page || total || t.slots.length > 0) && (
            <div className="mt-chips">
              {t.goal && <span className="mt-chip">🎯 {t.goal}</span>}
              {t.page && <span className="mt-chip">📄 {t.page}</span>}
              {total ? <span className="mt-chip">⏱ {duration(total)} au total</span> : null}
              {t.slots.map((s) =>
                s.link ? (
                  <a key={s.start} className="mt-chip mt-chip--link" href={s.link} target="_blank" rel="noopener noreferrer">
                    📅 {slotFr(s)}
                  </a>
                ) : (
                  <span key={s.start} className="mt-chip">
                    📅 {slotFr(s)}
                  </span>
                ),
              )}
            </div>
          )}
          {more.length > 0 && (
            <details className="mt-more">
              <summary>Le contexte complet</summary>
              {more.map((b) => (
                <div key={b.label} className="mt-more__item">
                  <h4>
                    {b.icon} {b.label}
                  </h4>
                  <p>{b.text}</p>
                </div>
              ))}
            </details>
          )}

          {steps.length > 0 && (
            <section className="mt-stepper" aria-label="Les étapes">
              <header className="mt-stepper__head">
                <h4>Les étapes</h4>
                {t.stepsCheckable && (
                  <span className="mt-stepper__count">
                    {doneSteps}/{steps.length} faite{doneSteps > 1 ? "s" : ""}
                  </span>
                )}
              </header>
              <ol className="mt-stepper__list">
                {steps.map((s, i) => {
                  const now = t.stepsCheckable && !done && i === nextStep;
                  return (
                    <li key={i} className={`mt-step${s.done ? " mt-step--done" : ""}${now ? " mt-step--now" : ""}`}>
                      {t.stepsCheckable ? (
                        <button type="button" className="mt-step__node" onClick={() => toggleStep(i)} disabled={busy} aria-pressed={s.done} aria-label={s.done ? `Décocher l'étape ${i + 1}` : `Cocher l'étape ${i + 1} : faite`}>
                          {s.done ? "✓" : i + 1}
                        </button>
                      ) : (
                        <span className="mt-step__node">{s.done ? "✓" : i + 1}</span>
                      )}
                      <div className="mt-step__body">
                        {now && <span className="mt-step__now">À faire maintenant</span>}
                        <p className="mt-step__text">{s.text}</p>
                        {(s.minutes || s.prompt) && (
                          <div className="mt-step__meta">
                            {s.minutes ? <span>⏱ {duration(s.minutes)}</span> : null}
                            {s.prompt && <StepPrompt prompt={s.prompt} />}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          )}

          {t.form === "question" && (
            <section className="mt-question">
              <h4>❓ La question</h4>
              {t.question && <p>{t.question}</p>}
              {done ? (
                t.answer && <p className="mt-answer">Votre réponse : « {t.answer} »</p>
              ) : (
                <div className="mt-answer-form">
                  <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Votre réponse…" rows={3} maxLength={2000} disabled={busy} />
                  <button type="button" className="an-btn rdm-btn--primary" onClick={() => send({ answer: text }, () => setDone(true), () => setDone(false))} disabled={busy || !text.trim()}>
                    Envoyer la réponse
                  </button>
                </div>
              )}
            </section>
          )}
          {t.form === "a-faire" && done && t.answer && <p className="mt-answer">Votre mot : « {t.answer} »</p>}

          {/* La barre d'action : ce qu'on fait de la tâche, en un endroit. */}
          <footer className="mt-bar">
            {checkable && !done && t.source === "demande" && <input className="mt-note" value={text} onChange={(e) => setText(e.target.value)} placeholder={`Un mot pour ${chief?.name ?? "l'équipe"} (facultatif)`} maxLength={2000} disabled={busy} />}
            <div className="mt-bar__row">
              {t.url &&
                (/^https:/.test(t.url) ? (
                  <a className="an-btn" href={t.url} target="_blank" rel="noreferrer noopener">
                    Ouvrir la page ↗
                  </a>
                ) : (
                  <a className={`an-btn${t.source === "a-valider" ? " rdm-btn--primary" : ""}`} href={t.url}>
                    {t.source === "a-valider" ? "Décider dans « À valider » →" : "Ouvrir la page →"}
                  </a>
                ))}
              {checkable && !done && (
                <button type="button" className="an-btn rdm-btn--primary" onClick={toggle} disabled={busy}>
                  ✓ {steps.length > 1 && t.stepsCheckable && doneSteps < steps.length ? "Tout est fait" : "C'est fait"}
                </button>
              )}
              {checkable && done && (
                <button type="button" className="an-btn" onClick={toggle} disabled={busy}>
                  ↺ Rouvrir
                </button>
              )}
              {chief && t.chief && !talk && (
                <button type="button" className="mt-talk__open" onClick={() => setTalk(true)}>
                  <Portrait portrait={chief.portrait} size={24} title={chief.name} /> En parler à {chief.name}
                </button>
              )}
              <span className="mt-bar__spacer" />
              {reported && (
                <button type="button" className="an-btn rdm-btn--primary" onClick={() => send({ done: false })} disabled={busy}>
                  ↺ Le remettre cette semaine
                </button>
              )}
              {!done && !reported && t.source !== "a-valider" && (
                <button type="button" className="mt-link" onClick={() => send({ drop: true, note: text })} disabled={busy}>
                  {t.source === "demande" ? "Retirer" : t.source === "objectif" ? "Abandonner (retire ses créneaux)" : "Abandonner"}
                </button>
              )}
            </div>
            {t.source === "a-valider" && <span className="mt-hint">Se ferme quand vous décidez dans « À valider ».</span>}
            {reported && (
              <span className="mt-hint">
                {t.carriedOver ? `Serge l'a repris dans « ${t.carriedOver} » : rien à faire ici, sauf si vous voulez aussi garder celui-ci.` : "Serge l'a jugé moins prioritaire que les objectifs de cette semaine. Remettez-le si vous n'êtes pas d'accord : il repart, échéance vendredi."}
              </span>
            )}
            {error && <p className="mt-error">{error}</p>}
          </footer>

          {chief && t.chief && talk && (
            <div className="mt-talk">
              <ChatBox
                memberKey={t.chief}
                name={chief.name}
                portrait={chief.portrait}
                initial={chats[t.chief] ?? []}
                context={t.title}
                starters={["Pourquoi cette tâche maintenant ?", "Aide-moi à la faire, pas à pas.", "Je ne pense pas la faire : qu'en dis-tu ?"]}
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}

/** Le prompt d'une étape : le copier d'un clic, ou le lire sous l'étape. */
function StepPrompt({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const [shown, setShown] = useState(false);
  return (
    <>
      <button
        type="button"
        className="mt-step__btn"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          } catch {
            setShown(true);
          }
        }}
      >
        {copied ? "✓ Prompt copié" : "📋 Copier le prompt"}
      </button>
      <button type="button" className="mt-step__btn mt-step__btn--muted" onClick={() => setShown(!shown)} aria-expanded={shown}>
        {shown ? "Masquer" : "Voir le prompt"}
      </button>
      {shown && <pre className="mt-step__prompt">{prompt}</pre>}
    </>
  );
}

export function MyTasksBoard({ tasks, today, people, chats, focus }: { tasks: MyTask[]; today: string; people: Record<string, Person>; chats: Record<string, ChatMessage[]>; focus: string | null }) {
  const [cat, setCat] = useState<TaskCategory | "tout">("tout");
  const [openId, setOpenId] = useState<string | null>(focus && tasks.some((t) => t.id === focus) ? focus : null);
  const progress = weekProgress(tasks, today);
  const shown = useMemo(() => (cat === "tout" ? tasks : tasks.filter((t) => t.category === cat)), [tasks, cat]);
  const grouped = useMemo(() => {
    const by = new Map<TaskGroup, MyTask[]>();
    for (const t of shown) by.set(groupOf(t, today), [...(by.get(groupOf(t, today)) ?? []), t]);
    return GROUPS.map((g) => ({ ...g, list: g.key === "fait" ? [...(by.get(g.key) ?? [])].sort((a, b) => (b.doneAt ?? "").localeCompare(a.doneAt ?? "")) : sortTasks(by.get(g.key) ?? [], today) }));
  }, [shown, today]);
  const openOf = (c: TaskCategory | "tout") => tasks.filter((t) => (c === "tout" || t.category === c) && t.status !== "fait" && t.status !== "reporte").length;
  // La tâche ouverte par un lien (?tache=…) reste visible même si elle est faite : son groupe s'ouvre.
  const focused = openId ? tasks.find((t) => t.id === openId) : undefined;
  const focusGroup = focused ? groupOf(focused, today) : null;

  return (
    <div className="mt">
      <section className={`mt-progress${progress.late ? " mt-progress--late" : progress.pct === 100 ? " mt-progress--ok" : ""}`} aria-label="Où j'en suis cette semaine">
        <div className="mt-progress__head">
          <strong>Cette semaine : {progress.pct} %</strong>
          <span>
            {progress.done} faite{progress.done > 1 ? "s" : ""} · {progress.left} à faire{progress.late ? ` · ${progress.late} en retard` : ""}
          </span>
        </div>
        <span className="mt-progress__track" role="progressbar" aria-valuenow={progress.pct} aria-valuemin={0} aria-valuemax={100}>
          <span style={{ width: `${progress.pct}%` }} />
        </span>
      </section>

      <div className="mt-cats" role="radiogroup" aria-label="Catégorie">
        <button type="button" role="radio" aria-checked={cat === "tout"} className={`mt-cat${cat === "tout" ? " mt-cat--on" : ""}`} onClick={() => setCat("tout")}>
          Tout <span className="mt-cat__n">{openOf("tout")}</span>
        </button>
        {TASK_CATEGORIES.map((c) => (
          <button key={c.value} type="button" role="radio" aria-checked={cat === c.value} className={`mt-cat mt-cat--${c.value}${cat === c.value ? " mt-cat--on" : ""}`} onClick={() => setCat(c.value)}>
            <span className="mt-cat__dot" aria-hidden />
            {c.icon} {c.label} <span className="mt-cat__n">{openOf(c.value)}</span>
          </button>
        ))}
      </div>

      {grouped.map((g) => {
        if (!g.list.length && g.key !== "semaine") return null;
        const items = (
          <ol className="mt-list">
            {g.list.map((t) => (
              <Task key={t.id} t={t} today={today} people={people} chats={chats} open={openId === t.id} onOpen={setOpenId} />
            ))}
          </ol>
        );
        const title = (
          <>
            {g.icon} {g.label} <span className="mt-group__n">{g.list.length}</span>
          </>
        );
        return g.key === "fait" || g.key === "plus-tard" || g.key === "reportees" ? (
          <details key={g.key} className={`mt-group mt-group--${g.key}`} open={focusGroup === g.key || undefined}>
            <summary className="mt-group__title">{title}</summary>
            {items}
          </details>
        ) : (
          <section key={g.key} className={`mt-group mt-group--${g.key}`}>
            <h2 className="mt-group__title">{title}</h2>
            {g.list.length ? items : <p className="mt-empty">{g.empty}</p>}
          </section>
        );
      })}
    </div>
  );
}
