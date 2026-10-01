"use client";

import { useEffect, useRef, useState } from "react";

import { PROFILS } from "@/modules/partner/lib/pricing";
import {
  chronoSessions,
  contactName,
  dayKey,
  draftFromFormula,
  sessionTitle,
  FORMULAS,
  type Formula,
  type PlanContact,
  type PlanDay,
  type PlanSession,
  type PlanWarning,
} from "@/modules/training/lib/plan";
import { AddressSearch } from "@/modules/training/admin/AddressSearch";
import { joinAddress } from "@/modules/training/lib/address";
import { ACCESS_DELIVERY, TRAINER_TYPES, TRAINING_MODES } from "@/modules/training/lib/training";

/**
 * Les morceaux d'affichage du plan de formation : choix d'une formule, le
 * DÉROULÉ (une carte par journée, une ligne par créneau) et le tableau « Qui va
 * à quelle séance » (contacts × créneaux). Sans état serveur — l'éditeur
 * (TrainingPlanEditor) charge, enregistre et leur passe les données.
 *
 * Les participants se choisissent dans le TABLEAU, pas dans chaque créneau : on
 * y voit d'un coup d'œil qui va où, et qui n'a aucune séance. Le groupe d'un
 * créneau (« Admin + Conducteur de travaux ») se déduit des personnes cochées.
 */

export type User = {
  id: number | string;
  firstName?: string | null;
  lastName?: string | null;
  email?: string | null;
};
export type Day = PlanDay & { trainerName?: string | null; locationDetails?: string | null };

/** L'adresse de facturation de la fiche, proposée comme lieu en un clic. */
export type ClientAddress = { address?: string | null; complement?: string | null };

export const userName = (u: User) =>
  [u.firstName, u.lastName].filter(Boolean).join(" ").trim() || u.email || `Compte ${u.id}`;

/** Les ids Postgres sont des entiers : un id lu dans un <select> arrive en texte. */
export const asId = (v: string | number): number | string => (typeof v === "string" && /^\d+$/.test(v) ? Number(v) : v);

export const idOf = (ref: unknown): number | string | null =>
  ref && typeof ref === "object" ? ((ref as { id?: number | string }).id ?? null) : ((ref as number | string) ?? null);

/** « Vendredi 2 octobre 2026 » — majuscule au seul premier mot. */
export const fmtDay = (iso?: string | null) => {
  if (!iso) return "Date à fixer";
  const s = new Date(iso).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
};

/** Remise des accès, en mots courts pour une ligne de créneau. */
const ACCESS_SHORT: Record<string, string> = {
  formateur: "remis par le formateur",
  client: "distribués par le client",
};

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
                {draft.length} journée{draft.length > 1 ? "s" : ""}, {n} séance
                {n > 1 ? "s" : ""}
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
  accessDefault,
  clientAddress,
  readOnly,
  canSign = false,
  canUndoSign = false,
  onSign,
  onPatch,
  onRemove,
  onAddSession,
  onPatchSession,
  onRemoveSession,
}: {
  index: number;
  day: Day;
  clientAddress?: ClientAddress;
  /** Peut émarger les créneaux de cette journée (TIM ou son formateur, à partir du jour J). */
  canSign?: boolean;
  /** Annuler un émargement : TIM seulement (cela peut rouvrir la formation). */
  canUndoSign?: boolean;
  onSign?: (s: PlanSession, attendance: (number | string)[] | null) => Promise<boolean>;
  sessions: PlanSession[];
  contacts: PlanContact[];
  warnings: PlanWarning[];
  trainers: User[];
  accessDefault: string;
  readOnly: boolean;
  onPatch: (p: Partial<Day>) => void;
  onRemove: () => void;
  onAddSession: () => void;
  onPatchSession: (id: PlanSession["id"], p: Partial<PlanSession>) => void;
  onRemoveSession: (s: PlanSession) => void;
}) {
  // Le formateur choisi n'est pas (encore) dans la liste : on le garde visible.
  const trainerKnown = day.trainer == null || trainers.some((u) => String(u.id) === String(day.trainer));
  const distance = day.mode === "distance";

  return (
    <section className="tr-day" aria-label={`Journée ${index}`}>
      <div className="tr-day__top">
        <span className="tr-day__badge">Journée {index}</span>
        <h3 className={`tr-day__title${day.date ? "" : " is-missing"}`}>{fmtDay(day.date)}</h3>
        {!readOnly && (
          <button
            type="button"
            className="tr-icon-btn"
            onClick={onRemove}
            aria-label="Supprimer la journée"
            title="Supprimer la journée"
          >
            ×
          </button>
        )}
      </div>

      <div className="tr-day__controls">
        <label className="tr-ctl">
          <span className="tr-ctl__label">Date</span>
          <BlurInput
            type="date"
            className="tr-input"
            aria-label="Date de la journée"
            value={dayKey(day.date) ?? ""}
            disabled={readOnly}
            onCommit={(v) => onPatch({ date: v ? `${v}T12:00:00.000Z` : null })}
          />
        </label>
        <div className="tr-ctl">
          <span className="tr-ctl__label">Mode</span>
          <Segmented
            label="Mode"
            options={TRAINING_MODES}
            value={day.mode}
            disabled={readOnly}
            onChange={(v) => onPatch({ mode: v })}
          />
        </div>
        <div className="tr-ctl">
          <span className="tr-ctl__label">Formateur</span>
          <div className="tr-ctl__row">
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
              <span className="tr-ctl__value">{day.trainerName ?? "À désigner"}</span>
            ) : (
              <select
                className="tr-input tr-select"
                aria-label="Qui forme"
                value={day.trainer != null ? String(day.trainer) : ""}
                onChange={(e) =>
                  onPatch({
                    trainer: e.target.value ? asId(e.target.value) : null,
                  })
                }
              >
                <option value="">À désigner</option>
                {!trainerKnown && (
                  <option value={String(day.trainer)}>{day.trainerName ?? `Compte ${day.trainer}`}</option>
                )}
                {trainers.map((u) => (
                  <option key={u.id} value={String(u.id)}>
                    {userName(u)}
                  </option>
                ))}
              </select>
            )}
          </div>
          {!readOnly && day.trainerType === "partenaire" && !trainers.length && (
            <span className="tr-ctl__hint">Le partenaire de ce client n&apos;a aucun compte utilisateur.</span>
          )}
        </div>
        <div className="tr-day__place">
          {distance ? (
            <label className="tr-ctl">
              <span className="tr-ctl__label">Lien de la visio</span>
              <BlurField
                className="tr-input"
                value={day.link ?? ""}
                placeholder="https://meet.google.com/…"
                disabled={readOnly}
                onCommit={(v) => onPatch({ link: v })}
              />
            </label>
          ) : (
            <div className="tr-ctl">
              <span className="tr-ctl__label">Adresse</span>
              <AddressSearch
                value={day.location ?? ""}
                placeholder="Rechercher une adresse…"
                disabled={readOnly}
                onCommit={(v) => onPatch({ location: v })}
              />
              {!readOnly && !day.location && clientAddress?.address && (
                <button
                  type="button"
                  className="tr-chip-btn"
                  // Le complément de facturation (bâtiment, étage) rejoint le
                  // complément du lieu, s'il est encore vide.
                  onClick={() =>
                    onPatch({
                      location: clientAddress.address ?? "",
                      ...(!day.locationDetails && clientAddress.complement
                        ? { locationDetails: clientAddress.complement }
                        : {}),
                    })
                  }
                >
                  Utiliser l&apos;adresse du client : {joinAddress(clientAddress.address, clientAddress.complement)}
                </button>
              )}
            </div>
          )}
          <label className="tr-ctl">
            <span className="tr-ctl__label">{distance ? "Consignes" : "Complément"}</span>
            <BlurField
              multiline
              className="tr-input"
              value={day.locationDetails ?? ""}
              placeholder={
                distance
                  ? "Code d'accès, numéro à appeler en cas de souci…"
                  : "Salle, étage, interlocuteur sur place, parking…"
              }
              disabled={readOnly}
              onCommit={(v) => onPatch({ locationDetails: v })}
            />
          </label>
        </div>
      </div>

      <ol className="tr-slots">
        {sessions.map((s) => (
          <SessionRow
            key={s.id}
            session={s}
            contacts={contacts}
            warnings={warnings.filter((w) => w.sessionId != null && String(w.sessionId) === String(s.id))}
            accessDefault={accessDefault}
            readOnly={readOnly}
            canSign={canSign}
            canUndoSign={canUndoSign}
            onSign={onSign ? (attendance) => onSign(s, attendance) : undefined}
            onPatch={(p) => onPatchSession(s.id, p)}
            onRemove={() => onRemoveSession(s)}
          />
        ))}
        {sessions.length === 0 && <li className="tr-slots__empty">Aucun créneau dans cette journée.</li>}
      </ol>
      {!readOnly && (
        <button type="button" className="tr-link-add" onClick={onAddSession}>
          + Ajouter un créneau
        </button>
      )}
    </section>
  );
}

/** Une ligne du déroulé : l'horaire, le groupe, qui vient, la remise des accès. */
function SessionRow({
  session,
  contacts,
  warnings,
  accessDefault,
  readOnly,
  canSign,
  canUndoSign,
  onSign,
  onPatch,
  onRemove,
}: {
  session: PlanSession;
  canUndoSign: boolean;
  contacts: PlanContact[];
  warnings: PlanWarning[];
  accessDefault: string;
  readOnly: boolean;
  canSign: boolean;
  onSign?: (attendance: (number | string)[] | null) => Promise<boolean>;
  onPatch: (p: Partial<PlanSession>) => void;
  onRemove: () => void;
}) {
  const cancelled = session.status === "annulee";
  const done = session.status === "realisee";
  const ids = new Set((session.participants ?? []).map(String));
  const participants = contacts.filter((c) => ids.has(String(c.id)));
  const people = participants.map(contactName);
  const present = new Set((session.attendance ?? []).map(String));
  const alert = warnings.some((w) => w.level === "alerte");
  const [signing, setSigning] = useState(false);

  return (
    <li className={`tr-slot${cancelled ? " is-cancelled" : ""}${signing ? " is-signing" : ""}`}>
      <div className="tr-slot__time">
        <BlurInput
          type="time"
          className="tr-input tr-input--time"
          aria-label="Début"
          value={session.startTime ?? ""}
          disabled={readOnly || cancelled || done}
          onCommit={(v) => onPatch({ startTime: v })}
        />
        <span aria-hidden="true">–</span>
        <BlurInput
          type="time"
          className="tr-input tr-input--time"
          aria-label="Fin"
          value={session.endTime ?? ""}
          disabled={readOnly || cancelled || done}
          onCommit={(v) => onPatch({ endTime: v })}
        />
      </div>

      <div className="tr-slot__main">
        <span className="tr-slot__title">
          {sessionTitle(session.profiles)}
          {warnings.length > 0 && (
            <span
              className={`tr-slot__flag${alert ? " is-alert" : ""}`}
              title={warnings.map((w) => w.text).join("\n")}
              aria-label={`${warnings.length} point${warnings.length > 1 ? "s" : ""} d'attention`}
            >
              !
            </span>
          )}
        </span>
        {done ? (
          <span className="tr-slot__people">
            <strong className="tr-slot__present">
              {present.size} présent{present.size > 1 ? "s" : ""} sur {participants.length}
            </strong>
            {participants.some((c) => !present.has(String(c.id))) &&
              ` · absent${participants.filter((c) => !present.has(String(c.id))).length > 1 ? "s" : ""} : ${participants
                .filter((c) => !present.has(String(c.id)))
                .map(contactName)
                .join(", ")}`}
          </span>
        ) : (
          <span className={`tr-slot__people${people.length ? "" : " is-empty"}`}>
            {people.length
              ? people.join(", ")
              : "Personne pour l'instant — cochez les participants dans le tableau ci-dessous."}
          </span>
        )}
      </div>

      <div className="tr-slot__side">
        {cancelled && <span className="tr-badge">Annulé</span>}
        {done && <span className="tr-badge tr-badge--done">Réalisé</span>}
        {canSign && onSign && !cancelled && participants.length > 0 && !signing && (
          <button
            type="button"
            className={done ? "tr-text-btn" : "tr-sign-btn"}
            onClick={() => setSigning(true)}
          >
            {done ? "Modifier l'émargement" : "Émarger"}
          </button>
        )}
        {/* Réalisé : la remise des accès est un fait passé, plus un réglage. */}
        {!cancelled && !done && (
          <select
            className="tr-quiet-select"
            aria-label="Remise des accès"
            value={session.accessDelivery ?? ""}
            disabled={readOnly}
            onChange={(e) => onPatch({ accessDelivery: e.target.value || null })}
          >
            <option value="">Accès {ACCESS_SHORT[accessDefault] ?? ""} (par défaut)</option>
            {ACCESS_DELIVERY.map((a) => (
              <option key={a.value} value={a.value}>
                Accès {ACCESS_SHORT[a.value] ?? a.label}
              </option>
            ))}
          </select>
        )}
        {!readOnly && !done && !signing && (
          <>
            <button
              type="button"
              className="tr-text-btn"
              onClick={() => onPatch({ status: cancelled ? "planifiee" : "annulee" })}
            >
              {cancelled ? "Rétablir" : "Annuler"}
            </button>
            <button
              type="button"
              className="tr-icon-btn"
              onClick={onRemove}
              aria-label="Supprimer le créneau"
              title="Supprimer le créneau"
            >
              ×
            </button>
          </>
        )}
      </div>

      {signing && onSign && (
        <AttendancePanel
          participants={participants}
          initial={done ? [...present] : []}
          canUndo={done && canUndoSign}
          onCancel={() => setSigning(false)}
          onSubmit={async (attendance) => {
            if (await onSign(attendance)) setSigning(false);
          }}
        />
      )}
    </li>
  );
}

/**
 * Qui est présent ? On coche ceux qui sont là — rien n'est coché d'avance :
 * l'émargement constate, il ne présume pas. « Tous présents » pour le cas
 * courant. Personne n'est venu ? On annule le créneau plutôt que de l'émarger
 * vide.
 */
function AttendancePanel({
  participants,
  initial,
  canUndo,
  onCancel,
  onSubmit,
}: {
  participants: PlanContact[];
  initial: string[];
  canUndo: boolean;
  onCancel: () => void;
  onSubmit: (attendance: (number | string)[] | null) => Promise<void>;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set(initial));
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) =>
    setChecked((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const submit = async (value: (number | string)[] | null) => {
    setBusy(true);
    try {
      await onSubmit(value);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="tr-attend" role="group" aria-label="Émargement">
      <div className="tr-attend__head">
        <span className="tr-attend__title">Qui est présent ?</span>
        <button
          type="button"
          className="tr-text-btn"
          onClick={() => setChecked(new Set(participants.map((c) => String(c.id))))}
        >
          Tous présents
        </button>
      </div>
      <div className="tr-attend__people">
        {participants.map((c) => (
          <label key={c.id} className="tr-attend__person">
            <input type="checkbox" checked={checked.has(String(c.id))} onChange={() => toggle(String(c.id))} />
            {contactName(c)}
          </label>
        ))}
      </div>
      <div className="tr-attend__foot">
        {canUndo && (
          <button type="button" className="tr-text-btn tr-attend__undo" disabled={busy} onClick={() => void submit(null)}>
            Annuler l&apos;émargement
          </button>
        )}
        <button type="button" className="tr-text-btn" disabled={busy} onClick={onCancel}>
          Fermer
        </button>
        <button
          type="button"
          className="tr-sign-btn"
          disabled={busy || checked.size === 0}
          title={checked.size === 0 ? "Personne n'est venu ? Annulez plutôt le créneau." : undefined}
          onClick={() => void submit([...checked].map(asId))}
        >
          {busy ? "Enregistrement…" : `Valider : ${checked.size} présent${checked.size > 1 ? "s" : ""}`}
        </button>
      </div>
    </div>
  );
}

/** Case à trois états (tout / une partie / rien) pour un groupe de contacts. */
function GroupCheckbox({
  checked,
  partial,
  disabled,
  label,
  onChange,
}: {
  checked: boolean;
  partial: boolean;
  disabled?: boolean;
  label: string;
  onChange: (on: boolean) => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = partial;
  }, [partial]);
  return (
    <input
      ref={ref}
      type="checkbox"
      aria-label={label}
      checked={checked}
      disabled={disabled}
      onChange={(e) => onChange(e.target.checked)}
    />
  );
}

/**
 * « Qui va à quelle séance » — une ligne par contact (rangés par profil), une
 * colonne par créneau. La case de groupe coche tout un profil dans un créneau.
 * La dernière colonne dit combien de séances a chacun : « Aucune » saute aux
 * yeux, sans être une erreur (on ne forme parfois que l'admin).
 */
export function PeopleMatrix({
  days,
  sessions,
  contacts,
  readOnly,
  onToggle,
}: {
  days: PlanDay[];
  sessions: PlanSession[];
  contacts: PlanContact[];
  readOnly: boolean;
  onToggle: (session: PlanSession, contactIds: (number | string)[], on: boolean) => void;
}) {
  const cols = chronoSessions(days, sessions);
  if (!cols.length) return null;

  const groups = [
    ...PROFILS.map((p) => ({ key: p.key as string, label: p.label })),
    { key: "", label: "Sans profil de licence" },
  ]
    .map((g) => ({
      ...g,
      members: contacts
        .filter((c) => (c.licenceProfile ?? "") === g.key)
        .sort((a, b) => contactName(a).localeCompare(contactName(b))),
    }))
    .filter((g) => g.members.length);

  const has = (s: PlanSession, id: number | string) => (s.participants ?? []).some((p) => String(p) === String(id));

  return (
    <section className="tr-matrix" aria-label="Qui va à quelle séance">
      <div className="tr-matrix__head">
        <h3 className="tr-section-title">Qui va à quelle séance</h3>
        <p className="tr-section-hint">
          Cochez les participants de chaque créneau. Le groupe du créneau se déduit des personnes cochées.
        </p>
      </div>
      <div className="tr-matrix__scroll">
        <table className="tr-matrix__table">
          <thead>
            <tr>
              <th scope="col" className="tr-matrix__corner">
                Contact
              </th>
              {cols.map(({ session, dayIndex }) => (
                <th key={session.id} scope="col" className="tr-matrix__col">
                  <span className="tr-matrix__col-when">
                    J{dayIndex} · {session.startTime || "—"}
                    {session.endTime ? `–${session.endTime}` : ""}
                  </span>
                  <span className="tr-matrix__col-what">{sessionTitle(session.profiles)}</span>
                </th>
              ))}
              <th scope="col" className="tr-matrix__count">
                Séances
              </th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <GroupRows
                key={g.key || "none"}
                group={g}
                cols={cols.map((c) => c.session)}
                has={has}
                readOnly={readOnly}
                onToggle={onToggle}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GroupRows({
  group,
  cols,
  has,
  readOnly,
  onToggle,
}: {
  group: { key: string; label: string; members: PlanContact[] };
  cols: PlanSession[];
  has: (s: PlanSession, id: number | string) => boolean;
  readOnly: boolean;
  onToggle: (session: PlanSession, contactIds: (number | string)[], on: boolean) => void;
}) {
  const ids = group.members.map((c) => c.id);
  return (
    <>
      <tr className="tr-matrix__group">
        <th scope="row">
          {group.label} <span className="tr-matrix__n">{group.members.length}</span>
        </th>
        {cols.map((s) => {
          const n = ids.filter((id) => has(s, id)).length;
          return (
            <td key={s.id}>
              {/* Un profil d'une seule personne : sa propre case suffit. */}
              {ids.length > 1 && (
                <GroupCheckbox
                  label={`${group.label} — tous dans ce créneau`}
                  checked={n === ids.length}
                  partial={n > 0 && n < ids.length}
                  disabled={readOnly || s.status === "realisee"}
                  onChange={(on) => onToggle(s, ids, on)}
                />
              )}
            </td>
          );
        })}
        <td />
      </tr>
      {group.members.map((c) => {
        const count = cols.filter((s) => has(s, c.id)).length;
        return (
          <tr key={c.id}>
            <th scope="row" className="tr-matrix__person">
              <span className="tr-matrix__who">
                <span className="tr-matrix__name">{contactName(c)}</span>
                {!c.email && <span className="tr-person__flag">sans e-mail</span>}
              </span>
            </th>
            {cols.map((s) => (
              <td key={s.id}>
                <input
                  type="checkbox"
                  aria-label={`${contactName(c)} — ${sessionTitle(s.profiles)} ${s.startTime ?? ""}`}
                  checked={has(s, c.id)}
                  // Réalisé : les participants sont figés (l'émargement s'appuie dessus).
                  disabled={readOnly || s.status === "realisee"}
                  onChange={(e) => onToggle(s, [c.id], e.target.checked)}
                />
              </td>
            ))}
            <td className={`tr-matrix__count${count ? "" : " is-none"}`}>{count || "Aucune"}</td>
          </tr>
        );
      })}
    </>
  );
}
