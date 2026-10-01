"use client";

import { useState } from "react";

import { fmtDay, type Day } from "@/modules/training/admin/TrainingPlanParts";
import { checklistProgress, customKey, dayChecklist, type StoredChecklist } from "@/modules/training/lib/checklist";
import { sessionsOfDay, type PlanContact, type PlanSession } from "@/modules/training/lib/plan";

/**
 * Onglet « Préparation » du plan : la checklist de chaque journée.
 *
 * À gauche, ce que le logiciel CONSTATE (date, lieu, formateur, mots de passe,
 * convocations) — rien à cocher, il suffit de faire la chose là où elle se
 * fait. À droite, les GESTES faits hors du logiciel (salle, écran, wifi…),
 * cochés à la main, avec qui l'a fait. On peut ajouter ses propres points.
 */
export function TrainingPreparation({
  days,
  sessions,
  contacts,
  readOnly,
  userName,
  onPatchDay,
}: {
  days: (Day & { checklist?: StoredChecklist | null })[];
  sessions: PlanSession[];
  contacts: (PlanContact & { timPassword?: string | null })[];
  readOnly: boolean;
  userName?: string | null;
  onPatchDay: (id: Day["id"], patch: Partial<Day> & { checklist?: StoredChecklist }) => void;
}) {
  if (!days.length) {
    return <p className="tr-plan__empty">Construisez d&apos;abord le plan : la préparation se fait journée par journée.</p>;
  }
  return (
    <div className="tr-prep">
      <p className="tr-section-hint">
        Ce que le logiciel constate se coche tout seul ; ce qui se fait sur le terrain se coche ici, à la main.
      </p>
      {days.map((day, i) => (
        <PrepDay
          key={day.id}
          index={i + 1}
          day={day}
          sessions={sessionsOfDay(sessions, day.id)}
          contacts={contacts}
          readOnly={readOnly}
          userName={userName}
          onChange={(checklist) => onPatchDay(day.id, { checklist })}
        />
      ))}
    </div>
  );
}

function PrepDay({
  index,
  day,
  sessions,
  contacts,
  readOnly,
  userName,
  onChange,
}: {
  index: number;
  day: Day & { checklist?: StoredChecklist | null };
  sessions: PlanSession[];
  contacts: (PlanContact & { timPassword?: string | null })[];
  readOnly: boolean;
  userName?: string | null;
  onChange: (c: StoredChecklist) => void;
}) {
  const [adding, setAdding] = useState("");
  const items = dayChecklist({ day: day as never, sessions, contacts });
  const { done, total } = checklistProgress(items);
  const stored: StoredChecklist = day.checklist ?? {};
  const constats = items.filter((i) => i.kind === "constat");
  const gestes = items.filter((i) => i.kind === "geste");

  const toggle = (key: string, on: boolean) => {
    const next = { ...(stored.done ?? {}) };
    if (on) next[key] = { at: new Date().toISOString(), by: userName ?? null };
    else delete next[key];
    onChange({ ...stored, done: next });
  };
  const add = () => {
    const label = adding.trim();
    if (!label) return;
    const taken = [...(stored.custom ?? []).map((c) => c.key), ...items.map((i) => i.key)];
    onChange({ ...stored, custom: [...(stored.custom ?? []), { key: customKey(label, taken), label }] });
    setAdding("");
  };
  const remove = (key: string) => {
    const nextDone = { ...(stored.done ?? {}) };
    delete nextDone[key];
    onChange({ ...stored, custom: (stored.custom ?? []).filter((c) => c.key !== key), done: nextDone });
  };

  return (
    <section className="tr-day" aria-label={`Préparation, journée ${index}`}>
      <div className="tr-day__top">
        <span className="tr-day__badge">Journée {index}</span>
        <h3 className={`tr-day__title${day.date ? "" : " is-missing"}`}>{fmtDay(day.date)}</h3>
        <span className={`tr-prep__count${done === total ? " is-done" : ""}`}>
          {done}/{total}
        </span>
      </div>
      <div className="tr-prep__cols">
        <div>
          <h4 className="tr-prep__col-title">Constaté par le logiciel</h4>
          <ul className="tr-prep__list">
            {constats.map((c) => (
              <li key={c.key} className={`tr-prep__item${c.done ? " is-done" : ""}`}>
                <span className="tr-prep__mark" aria-hidden="true">
                  {c.done ? "✓" : "○"}
                </span>
                <span>
                  {c.label}
                  {c.hint && <span className="tr-prep__hint">{c.hint}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="tr-prep__col-title">À faire sur le terrain</h4>
          <ul className="tr-prep__list">
            {gestes.map((g) => (
              <li key={g.key} className={`tr-prep__item${g.done ? " is-done" : ""}`}>
                <label className="tr-prep__check">
                  <input type="checkbox" checked={g.done} disabled={readOnly} onChange={(e) => toggle(g.key, e.target.checked)} />
                  <span>
                    {g.label}
                    {g.hint && <span className="tr-prep__hint">{g.hint}</span>}
                  </span>
                </label>
                {g.custom && !readOnly && (
                  <button type="button" className="tr-icon-btn" aria-label={`Retirer « ${g.label} »`} onClick={() => remove(g.key)}>
                    ×
                  </button>
                )}
              </li>
            ))}
          </ul>
          {!readOnly && (
            <form
              className="tr-prep__add"
              onSubmit={(e) => {
                e.preventDefault();
                add();
              }}
            >
              <input
                type="text"
                className="tr-input"
                placeholder="Ajouter un point (ex. badge d'accès au chantier)"
                maxLength={120}
                value={adding}
                onChange={(e) => setAdding(e.target.value)}
              />
              <button type="submit" className="tr-text-btn tr-text-btn--strong" disabled={!adding.trim()}>
                Ajouter
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
