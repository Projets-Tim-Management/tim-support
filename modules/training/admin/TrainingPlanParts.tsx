"use client";

import { useEffect, useState } from "react";

import { PROFILS } from "@/modules/partner/lib/pricing";
import {
  contactName,
  dayKey,
  draftFromFormula,
  matchingContacts,
  profileLabel,
  FORMULAS,
  type Formula,
  type PlanContact,
  type PlanDay,
  type PlanSession,
  type PlanWarning,
} from "@/modules/training/lib/plan";
import { ACCESS_DELIVERY, TRAINER_TYPES, TRAINING_MODES } from "@/modules/training/lib/training";

/**
 * Les morceaux d'affichage du plan de formation : choix d'une formule, carte
 * d'une journée, carte d'un créneau. Sans état serveur — l'éditeur
 * (TrainingPlanEditor) charge, enregistre et leur passe les données.
 */

export type User = { id: number | string; firstName?: string | null; lastName?: string | null; email?: string | null };
export type Day = PlanDay & { trainerName?: string | null };

export const userName = (u: User) => [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || `Compte ${u.id}`;

/** Les ids Postgres sont des entiers : un id lu dans un <select> arrive en texte. */
export const asId = (v: string | number): number | string => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v);

export const idOf = (ref: unknown): number | string | null =>
  ref && typeof ref === "object" ? ((ref as { id?: number | string }).id ?? null) : ((ref as number | string) ?? null);

export const fmtDay = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : "Date à fixer";

/** Champ texte enregistré à la sortie (et non à chaque frappe). */
function BlurField({
  value,
  onCommit,
  multiline,
  ...rest
}: {
  value: string;
  onCommit: (v: string) => void;
  multiline?: boolean;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  const commit = () => {
    if (v !== value) onCommit(v);
  };
  return multiline ? (
    <textarea {...rest} rows={2} value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} />
  ) : (
    <input {...rest} type="text" value={v} onChange={(e) => setV(e.target.value)} onBlur={commit} />
  );
}

/**
 * Date ou heure enregistrée à la SORTIE du champ. Saisie au clavier, un champ
 * date passe par « 0002 », « 0020 », « 0202 » avant « 2026 » : enregistrer à
 * chaque changement enverrait ces années intermédiaires.
 */
function BlurInput({
  type,
  value,
  onCommit,
  ...rest
}: {
  type: "date" | "time";
  value: string;
  onCommit: (v: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <input
      {...rest}
      type={type}
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v)}
    />
  );
}

/** Contrôle segmenté (deux ou trois choix exclusifs). */
function Segmented({
  options,
  value,
  onChange,
  disabled,
  label,
}: {
  options: readonly { value: string; label: string }[];
  value?: string | null;
  onChange: (v: string) => void;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="tr-seg" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          className={`tr-seg__opt${value === o.value ? " is-on" : ""}`}
          disabled={disabled}
          onClick={() => value !== o.value && onChange(o.value)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Plan vide : partir d'une formule, ou d'une journée vierge. */
export function FormulaPicker({
  contacts,
  busy,
  onPick,
}: {
  contacts: PlanContact[];
  busy: boolean;
  onPick: (f: Formula | null) => void;
}) {
  return (
    <div className="tr-formulas">
      <h3 className="tr-formulas__title">Comment former ce client ?</h3>
      <p className="tr-formulas__text">
        Partez d&apos;une formule : les créneaux et les participants sont proposés d&apos;après les contacts du client,
        tout reste modifiable ensuite.
      </p>
      <div className="tr-formulas__grid">
        {FORMULAS.map((f) => {
          const draft = draftFromFormula(f, contacts);
          const n = draft.flat().length;
          return (
            <button key={f.key} type="button" className="tr-formula" disabled={busy} onClick={() => onPick(f)}>
              <span className="tr-formula__label">{f.label}</span>
              <span className="tr-formula__detail">{f.detail}</span>
              <span className="tr-formula__count">
                {draft.length} journée{draft.length > 1 ? "s" : ""}, {n} séance{n > 1 ? "s" : ""}
              </span>
            </button>
          );
        })}
        <button type="button" className="tr-formula tr-formula--blank" disabled={busy} onClick={() => onPick(null)}>
          <span className="tr-formula__label">Sur mesure</span>
          <span className="tr-formula__detail">Une journée vierge, vous ajoutez les créneaux.</span>
        </button>
      </div>
    </div>
  );
}

export function DayCard({
  index,
  day,
  sessions,
  contacts,
  warnings,
  trainers,
  accessDefaultLabel,
  readOnly,
  onPatch,
  onRemove,
  onAddSession,
  onPatchSession,
  onRemoveSession,
}: {
  index: number;
  day: Day;
  sessions: PlanSession[];
  contacts: PlanContact[];
  warnings: PlanWarning[];
  trainers: User[];
  accessDefaultLabel: string;
  readOnly: boolean;
  onPatch: (p: Partial<Day>) => void;
  onRemove: () => void;
  onAddSession: () => void;
  onPatchSession: (id: PlanSession["id"], p: Partial<PlanSession>) => void;
  onRemoveSession: (s: PlanSession) => void;
}) {
  const dayWarnings = warnings.filter((w) => w.dayId != null && String(w.dayId) === String(day.id) && w.sessionId == null);
  // Le formateur choisi n'est pas (encore) dans la liste : on le garde visible.
  const trainerKnown = day.trainer == null || trainers.some((u) => String(u.id) === String(day.trainer));

  return (
    <section className="tr-day" aria-label={`Journée ${index}`}>
      <div className="tr-day__head">
        <div className="tr-day__when">
          <h3 className="tr-day__title">Journée {index}</h3>
          <span className={`tr-day__date${day.date ? "" : " is-missing"}`}>{fmtDay(day.date)}</span>
        </div>
        <BlurInput
          type="date"
          className="tr-input tr-day__picker"
          aria-label="Date de la journée"
          value={dayKey(day.date) ?? ""}
          disabled={readOnly}
          onCommit={(v) => onPatch({ date: v ? `${v}T12:00:00.000Z` : null })}
        />
        <Segmented
          label="Mode"
          options={TRAINING_MODES}
          value={day.mode}
          disabled={readOnly}
          onChange={(v) => onPatch({ mode: v })}
        />
        {!readOnly && (
          <button type="button" className="tr-icon-btn" onClick={onRemove} aria-label="Supprimer la journée" title="Supprimer la journée">
            ×
          </button>
        )}
      </div>

      <div className="tr-day__grid">
        <label className="tr-field">
          <span className="tr-field__label">{day.mode === "distance" ? "Lien de la visio" : "Adresse et consignes"}</span>
          {day.mode === "distance" ? (
            <BlurField
              className="tr-input"
              value={day.link ?? ""}
              placeholder="https://meet.google.com/…"
              disabled={readOnly}
              onCommit={(v) => onPatch({ link: v })}
            />
          ) : (
            <BlurField
              multiline
              className="tr-input"
              value={day.location ?? ""}
              placeholder="Adresse, salle, interlocuteur sur place…"
              disabled={readOnly}
              onCommit={(v) => onPatch({ location: v })}
            />
          )}
        </label>
        <div className="tr-field">
          <span className="tr-field__label">Formateur</span>
          <div className="tr-day__trainer">
            <Segmented
              label="Type de formateur"
              options={TRAINER_TYPES}
              value={day.trainerType}
              disabled={readOnly}
              // Changer de type vide la personne : un compte TIM n'est pas un
              // compte du partenaire, et inversement.
              onChange={(v) => onPatch({ trainerType: v, trainer: null })}
            />
            {readOnly ? (
              <span className="tr-day__trainer-name">{day.trainerName ?? "À désigner"}</span>
            ) : (
              <select
                className="ctr-select"
                aria-label="Qui forme"
                value={day.trainer != null ? String(day.trainer) : ""}
                onChange={(e) => onPatch({ trainer: e.target.value ? asId(e.target.value) : null })}
              >
                <option value="">À désigner</option>
                {!trainerKnown && <option value={String(day.trainer)}>{day.trainerName ?? `Compte ${day.trainer}`}</option>}
                {trainers.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {userName(u)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!readOnly && day.trainerType === "partenaire" && !trainers.length && (
            <span className="tr-field__hint">Le partenaire de ce client n&apos;a aucun compte utilisateur.</span>
          )}
        </div>
      </div>

      {dayWarnings.length > 0 && (
        <ul className="tr-warns tr-warns--inline">
          {dayWarnings.map((w, i) => (
            <li key={i} className={`tr-warn tr-warn--${w.level}`}>
              {w.text}
            </li>
          ))}
        </ul>
      )}

      <div className="tr-day__sessions">
        {sessions.length === 0 && <p className="tr-plan__empty tr-plan__empty--small">Aucun créneau dans cette journée.</p>}
        {sessions.map((s) => (
          <SessionCard
            key={s.id}
            session={s}
            contacts={contacts}
            warnings={warnings.filter((w) => w.sessionId != null && String(w.sessionId) === String(s.id))}
            accessDefaultLabel={accessDefaultLabel}
            readOnly={readOnly}
            onPatch={(p) => onPatchSession(s.id, p)}
            onRemove={() => onRemoveSession(s)}
          />
        ))}
      </div>
      {!readOnly && (
        <button type="button" className="tr-add tr-add--small" onClick={onAddSession}>
          + Ajouter un créneau
        </button>
      )}
    </section>
  );
}

function SessionCard({
  session,
  contacts,
  warnings,
  accessDefaultLabel,
  readOnly,
  onPatch,
  onRemove,
}: {
  session: PlanSession;
  contacts: PlanContact[];
  warnings: PlanWarning[];
  accessDefaultLabel: string;
  readOnly: boolean;
  onPatch: (p: Partial<PlanSession>) => void;
  onRemove: () => void;
}) {
  const [showOthers, setShowOthers] = useState(false);
  const profiles = session.profiles ?? [];
  const participants = (session.participants ?? []).map(String);
  const matching = matchingContacts(contacts, profiles);
  const others = contacts.filter((c) => !matching.includes(c));
  // Un contact hors profil déjà coché reste visible sans déplier.
  const othersChecked = others.filter((c) => participants.includes(String(c.id)));
  const cancelled = session.status === "annulee";
  const done = session.status === "realisee";

  /**
   * Cocher un profil ajoute ses contacts ; le décocher retire ceux qui n'ont
   * que ce profil-là. On décoche ensuite qui ne vient pas.
   */
  const toggleProfile = (key: string) => {
    const on = profiles.includes(key);
    if (on && profiles.length === 1) return; // une séance forme au moins un profil
    const nextProfiles = on ? profiles.filter((p) => p !== key) : PROFILS.map((p) => p.key).filter((k) => k === key || profiles.includes(k));
    const ofProfile = contacts.filter((c) => c.licenceProfile === key).map((c) => String(c.id));
    const nextPeople = on
      ? participants.filter((id) => !ofProfile.includes(id))
      : [...participants, ...ofProfile.filter((id) => !participants.includes(id))];
    onPatch({ profiles: nextProfiles, participants: nextPeople.map(asId) });
  };

  const togglePerson = (id: string) =>
    onPatch({ participants: (participants.includes(id) ? participants.filter((p) => p !== id) : [...participants, id]).map(asId) });

  const allMatchingIn = matching.length > 0 && matching.every((c) => participants.includes(String(c.id)));
  const toggleAllMatching = () => {
    const ids = matching.map((c) => String(c.id));
    onPatch({
      participants: (allMatchingIn
        ? participants.filter((p) => !ids.includes(p))
        : [...participants, ...ids.filter((id) => !participants.includes(id))]
      ).map(asId),
    });
  };

  const person = (c: PlanContact) => {
    const id = String(c.id);
    return (
      <label key={id} className="tr-person">
        <input type="checkbox" checked={participants.includes(id)} disabled={readOnly || cancelled} onChange={() => togglePerson(id)} />
        <span className="tr-person__name">{contactName(c)}</span>
        <span className="tr-person__profile">{profileLabel(c.licenceProfile)}</span>
        {!c.email && <span className="tr-person__flag">sans e-mail</span>}
      </label>
    );
  };

  return (
    <div className={`tr-session${cancelled ? " is-cancelled" : ""}`}>
      <div className="tr-session__head">
        <div className="tr-session__time">
          <BlurInput
            type="time"
            className="tr-input"
            aria-label="Début"
            value={session.startTime ?? ""}
            disabled={readOnly || cancelled}
            onCommit={(v) => onPatch({ startTime: v })}
          />
          <span aria-hidden="true">–</span>
          <BlurInput
            type="time"
            className="tr-input"
            aria-label="Fin"
            value={session.endTime ?? ""}
            disabled={readOnly || cancelled}
            onCommit={(v) => onPatch({ endTime: v })}
          />
        </div>
        <div className="tr-chips" role="group" aria-label="Profils formés">
          {PROFILS.map((p) => {
            const on = profiles.includes(p.key);
            return (
              <button
                key={p.key}
                type="button"
                className={`tr-chip${on ? " is-on" : ""}`}
                aria-pressed={on}
                disabled={readOnly || cancelled || (on && profiles.length === 1)}
                title={on && profiles.length === 1 ? "Une séance forme au moins un profil" : undefined}
                onClick={() => toggleProfile(p.key)}
              >
                {p.label}
              </button>
            );
          })}
        </div>
        {cancelled && <span className="tr-session__badge">Annulée</span>}
        {done && <span className="tr-session__badge tr-session__badge--done">Réalisée</span>}
        {!readOnly && !done && (
          <div className="tr-session__menu">
            <button type="button" className="ctr-link" onClick={() => onPatch({ status: cancelled ? "planifiee" : "annulee" })}>
              {cancelled ? "Rétablir le créneau" : "Annuler le créneau"}
            </button>
            <button type="button" className="tr-icon-btn" onClick={onRemove} aria-label="Supprimer le créneau" title="Supprimer le créneau">
              ×
            </button>
          </div>
        )}
      </div>

      <div className="tr-session__people">
        <div className="tr-session__people-head">
          <span className="tr-field__label">
            Participants · {participants.length}
          </span>
          {!readOnly && !cancelled && matching.length > 1 && (
            <button type="button" className="ctr-link" onClick={toggleAllMatching}>
              {allMatchingIn ? "Tout décocher" : "Tout cocher"}
            </button>
          )}
        </div>
        {matching.length ? (
          <div className="tr-people">{matching.map(person)}</div>
        ) : (
          <p className="tr-field__hint">Aucun contact du client n&apos;a ces profils de licence.</p>
        )}
        {othersChecked.length > 0 && !showOthers && <div className="tr-people">{othersChecked.map(person)}</div>}
        {others.length > 0 && (
          <>
            <button type="button" className="ctr-link tr-session__others" onClick={() => setShowOthers((v) => !v)}>
              {showOthers ? "Masquer les autres contacts" : `Autres contacts (${others.length})`}
            </button>
            {showOthers && <div className="tr-people">{others.map(person)}</div>}
          </>
        )}
      </div>

      <div className="tr-session__foot">
        <label className="tr-session__access">
          <span className="tr-field__label">Remise des accès</span>
          <select
            className="ctr-select"
            value={session.accessDelivery ?? ""}
            disabled={readOnly || cancelled}
            onChange={(e) => onPatch({ accessDelivery: e.target.value || null })}
          >
            <option value="">Comme la formation ({accessDefaultLabel})</option>
            {ACCESS_DELIVERY.map((a) => (
              <option key={a.value} value={a.value}>
                {a.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {warnings.length > 0 && (
        <ul className="tr-warns tr-warns--inline">
          {warnings.map((w, i) => (
            <li key={i} className={`tr-warn tr-warn--${w.level}`}>
              {w.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
