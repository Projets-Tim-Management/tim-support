"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { actionTone, fmtValue as fmt, gapText, goalTone, OutcomeBadge, postJson as post, progressToDate, ProgressRing, t } from "@/modules/ai-team/admin/roadmap-ui";
import { ACTION_WHO, HORIZONS as HORIZON_LIST, ROADMAP_TEAMS, TEAM_SHORT as TEAM_LABEL } from "@/modules/ai-team/lib/roadmap-constants";
import { CheckBox, RoadmapTimeline } from "@/modules/ai-team/admin/RoadmapTimeline";
import { Sparkline } from "@/modules/analytics/admin/ui";
import { INDICATOR_GROUPS, INDICATORS, indicatorOf, WEEKLY_INDICATORS } from "@/modules/ai-team/lib/indicators-meta";
import { beforeAfter, type SeriesPoint } from "@/modules/ai-team/lib/roadmap-calc";
import type { ActionView, GoalTeam, GoalView, RoadmapView } from "@/modules/ai-team/lib/roadmap";

/**
 * LA FEUILLE DE ROUTE, à l'écran (14/11/2026, refaite après relecture de la
 * direction : « trop de texte », « je n'arrive pas à me projeter », « je veux
 * fixer des objectifs et dire ce que font les équipes hors IA »).
 *
 * Les briques des Analyses (tuiles, filtres, cartes) ; quatre chiffres en tête,
 * puis quatre onglets : les OBJECTIFS (chacun avec ses actions faites et
 * prévues), le CALENDRIER (12 mois, passé et à venir), les COURBES (un
 * indicateur, les actions posées dessus, l'avant / après d'un clic), et CE QUI
 * MARCHE. « + Objectif » et « + Action » : la direction fixe ses objectifs et
 * note ce que font les équipes humaines.
 */

type TeamFilter = GoalTeam | "all";
const HORIZONS = HORIZON_LIST.map((h) => ({ key: h.value, label: `${h.label.replace(/ \((\d+) mois\)$/, " · $1 mois")}` }));
const PACE: Record<string, { label: string; tone: string }> = {
  atteint: { label: "Atteint", tone: "ok" },
  avance: { label: "En avance", tone: "ok" },
  "dans-les-temps": { label: "Dans les temps", tone: "muted" },
  retard: { label: "En retard", tone: "bad" },
};
const dayFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });
const weekFr = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });

/* ─── Les fenêtres « + Objectif » et « + Action » ───────────────────────── */

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  return (
    <dialog ref={ref} className="rdm-dialog" onClose={onClose} onCancel={onClose} aria-label={title}>
      <header className="rdm-dialog__head">
        <h2>{title}</h2>
        <button type="button" className="rdm-dialog__x" onClick={onClose} aria-label="Fermer">
          ✕
        </button>
      </header>
      {children}
    </dialog>
  );
}

function GoalForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ team: "tous", horizon: "court", kind: "chiffre", title: "", metric: "mrr", param: "", target: "", start: "", dueDate: "", why: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const meta = indicatorOf(f.metric);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await post("/api/admin/ai-team/goals", { create: f });
    setBusy(false);
    if (err) return setError(err);
    onClose();
    router.refresh();
  };
  return (
    <Dialog title="Nouvel objectif" onClose={onClose}>
      <form className="rdm-form" onSubmit={submit}>
        <label className="rdm-form__wide">
          Objectif
          <input required value={f.title} onChange={set("title")} placeholder="Ex. : 5 000 € de MRR au 31 décembre" />
        </label>
        <div className="rdm-form__wide an-filters an-filters--small" role="radiogroup" aria-label="Sorte">
          {[
            ["chiffre", "Chiffré"],
            ["jalon", "Jalon (un livrable daté)"],
          ].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={f.kind === k} className={`an-filter${f.kind === k ? " an-filter--on" : ""}`} onClick={() => setF({ ...f, kind: k })}>
              {l}
            </button>
          ))}
        </div>
        {f.kind === "chiffre" && (
          <>
            <label className="rdm-form__wide">
              Indicateur
              <select value={f.metric} onChange={set("metric")}>
                {INDICATOR_GROUPS.map((g) => (
                  <optgroup key={g} label={g}>
                    {INDICATORS.filter((x) => x.group === g).map((x) => (
                      <option key={x.key} value={x.key}>
                        {x.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
              {meta && <span className="rdm-form__help">{meta.help}</span>}
            </label>
            {meta?.param && (
              <label>
                {meta.param.label}
                <input required value={f.param} onChange={set("param")} placeholder={meta.param.placeholder} />
              </label>
            )}
            {f.metric === "manuel" && (
              <label>
                Valeur aujourd&apos;hui
                <input type="number" step="any" value={f.start} onChange={set("start")} />
              </label>
            )}
            <label>
              Cible {meta?.unit === "€" ? "(€)" : meta?.unit === "%" ? "(%)" : ""}
              <input required type="number" step="any" value={f.target} onChange={set("target")} />
            </label>
          </>
        )}
        <label>
          Équipe
          <select value={f.team} onChange={set("team")}>
            {ROADMAP_TEAMS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Horizon
          <select value={f.horizon} onChange={set("horizon")}>
            {HORIZON_LIST.map((h) => (
              <option key={h.value} value={h.value}>
                {h.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Échéance
          <input type="date" value={f.dueDate} onChange={set("dueDate")} />
        </label>
        <label className="rdm-form__wide">
          Pourquoi (facultatif)
          <textarea rows={2} value={f.why} onChange={set("why")} />
        </label>
        {error && <p className="rdm-error rdm-form__wide">{error}</p>}
        <div className="rdm-form__actions rdm-form__wide">
          <button type="button" className="an-btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="an-btn rdm-btn--primary" disabled={busy}>
            {busy ? "Création…" : "Créer l'objectif"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function ActionForm({ goals, goal, onClose }: { goals: GoalView[]; goal: string | null; onClose: () => void }) {
  const router = useRouter();
  const [f, setF] = useState({ title: "", who: "direction", team: goals.find((g) => g.id === goal)?.team ?? "tous", status: "prevue", plannedDate: "", doneDate: "", goal: goal ?? "", notes: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const err = await post("/api/admin/ai-team/actions", { create: f });
    setBusy(false);
    if (err) return setError(err);
    onClose();
    router.refresh();
  };
  return (
    <Dialog title="Nouvelle action" onClose={onClose}>
      <form className="rdm-form" onSubmit={submit}>
        <label className="rdm-form__wide">
          Action
          <input required value={f.title} onChange={set("title")} placeholder="Ex. : vidéo de démo du pointage tournée" />
        </label>
        <label>
          Qui
          <select value={f.who} onChange={set("who")}>
            {ACTION_WHO.map(({ value: k, label: l }) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Pour
          <select value={f.team} onChange={set("team")}>
            {ROADMAP_TEAMS.map((x) => (
              <option key={x.value} value={x.value}>
                {x.label}
              </option>
            ))}
          </select>
        </label>
        <div className="rdm-form__wide an-filters an-filters--small" role="radiogroup" aria-label="État">
          {[
            ["prevue", "Prévue"],
            ["en-cours", "En cours"],
            ["faite", "Faite"],
          ].map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={f.status === k} className={`an-filter${f.status === k ? " an-filter--on" : ""}`} onClick={() => setF({ ...f, status: k })}>
              {l}
            </button>
          ))}
        </div>
        {f.status === "faite" ? (
          <label>
            Faite le
            <input type="date" value={f.doneDate} onChange={set("doneDate")} />
          </label>
        ) : (
          <label>
            Prévue pour le
            <input required type="date" value={f.plannedDate} onChange={set("plannedDate")} />
          </label>
        )}
        <label>
          Sert l&apos;objectif
          <select value={f.goal} onChange={set("goal")}>
            <option value="">Aucun en particulier</option>
            {goals
              .filter((g) => g.status === "valide" || g.status === "propose")
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
          </select>
        </label>
        <label className="rdm-form__wide">
          Détail (facultatif)
          <textarea rows={2} value={f.notes} onChange={set("notes")} />
        </label>
        {error && <p className="rdm-error rdm-form__wide">{error}</p>}
        <div className="rdm-form__actions rdm-form__wide">
          <button type="button" className="an-btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="an-btn rdm-btn--primary" disabled={busy}>
            Ajouter l&apos;action
          </button>
        </div>
      </form>
    </Dialog>
  );
}

/* ─── Onglet « Objectifs » : une ligne par objectif, avec ses actions ───── */

function ActionChip({ a, today }: { a: ActionView; today: string }) {
  const late = a.status !== "faite" && a.date.slice(0, 10) < today;
  return (
    <li className={`rdm-act rdm-act--${actionTone(a)}${a.status === "faite" ? " rdm-act--done" : ""}`}>
      <CheckBox a={a} />
      <span className="rdm-act__date">{dayFr(a.date)}</span>
      <a className={`rdm-act__title${a.status === "faite" ? " rdt-done" : ""}`} href={a.href}>
        {a.title}
      </a>
      <span className="rdm-act__by">{a.by}</span>
      {a.outcome ? <OutcomeBadge outcome={a.outcome} /> : late ? <span className="an-badge an-badge--warn">En retard</span> : null}
    </li>
  );
}

function GoalRow({ g, actions, today, onAddAction }: { g: GoalView; actions: ActionView[]; today: string; onAddAction: (goal: string) => void }) {
  const router = useRouter();
  const m = g.metric ? indicatorOf(g.metric) : null;
  const [value, setValue] = useState("");
  const [target, setTarget] = useState(g.target == null ? "" : String(g.target));
  const [due, setDue] = useState(g.dueDate.slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const act = async (action: string) => {
    setBusy(true);
    const err = await post("/api/admin/ai-team/goals", { id: g.id, action, target, dueDate: due });
    setBusy(false);
    if (err) return setError(err);
    router.refresh();
  };
  const pace = g.pace ? PACE[g.pace] : null;
  const done = actions.filter((a) => a.status === "faite");
  const planned = actions.filter((a) => a.status !== "faite").sort((a, b) => a.date.localeCompare(b.date));
  return (
    <li className={`rdm-goal${g.status === "propose" ? " rdm-goal--propose" : ""}${g.status === "abandonne" || g.status === "manque" ? " rdm-goal--off" : ""}`}>
      <div className="rdm-goal__main">
        <div className="rdm-goal__badges">
          <span className="an-badge an-badge--muted">{TEAM_LABEL[g.team]}</span>
          {g.kind === "jalon" && <span className="an-badge an-badge--muted">Jalon</span>}
          {g.status === "propose" && <span className="an-badge an-badge--warn">Proposé{g.by ? ` par ${g.by}` : ""}</span>}
          {g.status === "atteint" && <span className="an-badge an-badge--ok">🎉 Atteint{g.reachedAt ? ` le ${dayFr(g.reachedAt)}` : ""}</span>}
          {g.status === "manque" && <span className="an-badge an-badge--bad">Manqué</span>}
          {pace && g.status === "valide" && <span className={`an-badge an-badge--${pace.tone}`}>{pace.label}</span>}
        </div>
        <div className="rdm-goal__hero">
          {m ? (
            <ProgressRing pct={g.progress} expected={g.status === "valide" ? g.expected : null} tone={goalTone(g)} />
          ) : (
            <span className={`rdm-goal__flag rdm-goal__flag--${goalTone(g)}`} aria-hidden>
              {g.pace === "atteint" ? "✓" : "⚑"}
            </span>
          )}
          <div className="rdm-goal__headline">
            <strong className="rdm-goal__title">{g.title}</strong>
            {m && (
              <div className="rdm-goal__figures">
                <span className="rdm-goal__value">{fmt(g.current, m.unit)}</span>
                <span className="rdm-goal__target">/ {fmt(g.target, m.unit)}</span>
                {g.series.length > 1 && <Sparkline values={g.series.map((p) => p.value)} tone={goalTone(g) === "bad" ? "red" : goalTone(g) === "ok" || goalTone(g) === "good" ? "green" : "blue"} />}
              </div>
            )}
            <span className={`rdm-goal__gap rdm-goal__gap--${goalTone(g)}`}>{gapText(g, today)}</span>
            <span className="rdm-goal__meta">
              {m ? `${m.label}${g.param ? ` ${g.param}` : ""} · ` : ""}échéance {dayFr(g.dueDate)}
              {g.by ? ` · ${g.by}` : ""}
            </span>
          </div>
        </div>
        {g.review && <p className="rdm-goal__review">{g.review}</p>}
        {g.status === "propose" && (
          <div className="rdm-goal__decide">
            {g.kind === "chiffre" && <input aria-label="Cible" type="number" step="any" value={target} onChange={(e) => setTarget(e.target.value)} />}
            <input aria-label="Échéance" type="date" value={due} onChange={(e) => setDue(e.target.value)} />
            <button type="button" className="an-btn rdm-btn--primary" onClick={() => act("valider")} disabled={busy}>
              Accepter cet objectif
            </button>
            <button type="button" className="an-btn" onClick={() => act("refuser")} disabled={busy}>
              Refuser
            </button>
          </div>
        )}
        {g.status === "valide" && g.metric === "manuel" && (
          <div className="rdm-goal__decide">
            <input aria-label="Nouvelle valeur" type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Nouvelle valeur" />
            <button
              type="button"
              className="an-btn"
              disabled={busy || value === ""}
              onClick={async () => {
                setBusy(true);
                const err = await post("/api/admin/ai-team/goals", { id: g.id, measure: value });
                setBusy(false);
                if (err) return setError(err);
                setValue("");
                router.refresh();
              }}
            >
              Mettre à jour
            </button>
          </div>
        )}
        {g.status === "valide" && (
          <div className="rdm-goal__links">
            {g.kind === "jalon" && <span className="rdm-goal__auto">Atteint : déclaré par le chef de l&apos;équipe, preuve à l&apos;appui.</span>}
            {g.kind === "chiffre" && <span className="rdm-goal__auto">Atteint tout seul dès que le chiffre touche la cible.</span>}
            <button type="button" className="rdm-link" onClick={() => act("abandonner")} disabled={busy}>
              Abandonner
            </button>
          </div>
        )}
        {g.why && (
          <details className="rdm-goal__why">
            <summary>Pourquoi</summary>
            <p>{g.why}</p>
          </details>
        )}
        {error && <p className="rdm-error">{error}</p>}
      </div>
      <div className="rdm-goal__actions">
        {planned.length > 0 && (
          <ul className="rdm-acts">
            {planned.map((a) => (
              <ActionChip key={a.id} a={a} today={today} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <ul className="rdm-acts">
            {done.slice(0, 6).map((a) => (
              <ActionChip key={a.id} a={a} today={today} />
            ))}
          </ul>
        )}
        {!actions.length && <p className="rdm-none">Aucune action encore.</p>}
        <button type="button" className="rdm-link" onClick={() => onAddAction(g.id)}>
          + Action pour cet objectif
        </button>
      </div>
    </li>
  );
}

/* ─── Onglet « Courbes » : un indicateur, les actions dessus ────────────── */

const W = 760;
const H = 240;
const PAD = { top: 16, right: 20, bottom: 44, left: 56 };

function Chart({ series, unit, actions, selected, onSelect, target, label }: { series: SeriesPoint[]; unit: string; actions: ActionView[]; selected: string | null; onSelect: (id: string) => void; target: number | null; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  if (series.length < 2) return <p className="an-empty">Pas encore assez de points pour « {label} ».</p>;
  const t0 = t(series[0].week);
  const t1 = t(series[series.length - 1].week);
  const values = [...series.map((p) => p.value), ...(target != null ? [target] : [])];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.2);
  const yMin = Math.max(0, lo - span * 0.15);
  const yMax = hi + span * 0.15;
  const x = (ms: number) => PAD.left + ((ms - t0) / Math.max(1, t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const path = series.map((p, i) => `${i ? "L" : "M"}${x(t(p.week)).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const shown = actions.filter((a) => a.status === "faite" && Date.parse(a.date) >= t0 && Date.parse(a.date) <= t1 + 7 * 86_400_000);
  const h = hover != null ? series[hover] : null;
  const base = H - PAD.bottom + 14;
  return (
    <figure className="ait-chart rdm-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} avec ${shown.length} action(s)`} onMouseLeave={() => setHover(null)}>
        {[yMin, (yMin + yMax) / 2, yMax].map((v) => (
          <g key={v}>
            <line className="ait-chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} />
            <text className="ait-chart__tick" x={PAD.left - 6} y={y(v) + 4} textAnchor="end">
              {fmt(v, unit)}
            </text>
          </g>
        ))}
        {target != null && (
          <>
            <line className="ait-chart__ref ait-chart__ref--target" x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} />
            <text className="ait-chart__reflabel ait-chart__reflabel--target" x={W - PAD.right} y={y(target) - 6} textAnchor="end">
              Cible {fmt(target, unit)}
            </text>
          </>
        )}
        <path className="ait-chart__line" d={path} />
        {series.map((p, i) => (
          <circle key={p.week} className="ait-chart__dot" cx={x(t(p.week))} cy={y(p.value)} r={hover === i ? 5 : 3.5} />
        ))}
        {series.map((p, i) => (
          <rect key={`h${p.week}`} className="ait-chart__hit" x={x(t(p.week)) - 10} y={PAD.top} width={20} height={H - PAD.top - PAD.bottom} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0} aria-label={`${weekFr(p.week)} : ${fmt(p.value, unit)}`} />
        ))}
        {shown.map((a) => {
          const ax = x(Math.min(t1, Date.parse(a.date)));
          return (
            <g key={a.id} className={`rdm-marker rdm-marker--${actionTone(a)}${selected === a.id ? " rdm-marker--on" : ""}`} onClick={() => onSelect(a.id)} role="button" tabIndex={0} aria-label={`${dayFr(a.date)} : ${a.title}`} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onSelect(a.id)}>
              <line x1={ax} x2={ax} y1={PAD.top} y2={base - 6} className="rdm-marker__stem" />
              <rect x={ax - 5} y={base - 5} width={10} height={10} rx={2} transform={`rotate(45 ${ax} ${base})`} className="rdm-marker__diamond" />
            </g>
          );
        })}
        <text className="ait-chart__tick" x={PAD.left} y={H - 4}>
          {weekFr(series[0].week)}
        </text>
        <text className="ait-chart__tick" x={W - PAD.right} y={H - 4} textAnchor="end">
          {weekFr(series[series.length - 1].week)}
        </text>
      </svg>
      {h && (
        <div className="ait-chart__tip" style={{ left: `${(x(t(h.week)) / W) * 100}%` }}>
          <strong>{fmt(h.value, unit)}</strong>
          <span>{weekFr(h.week)}</span>
        </div>
      )}
    </figure>
  );
}

function ActionDetail({ a, series, unit, better, label, bare = false }: { a: ActionView; series: SeriesPoint[]; unit: string; better: "up" | "down"; label: string; bare?: boolean }) {
  const m = { unit, label };
  const ba = beforeAfter(series, a.date, better);
  // Dans le tiroir d'une tâche, son titre est déjà en tête : seul l'avant / après et le verdict comptent ici.
  if (bare && !series.length && !a.outcome && !a.verdict) return null;
  return (
    <div className="an-card rdm-detail">
      {bare ? (
        <h3 className="rdm-h2">Avant / après{label ? ` · ${label}` : ""}</h3>
      ) : (
        <div>
          <strong>{a.title}</strong>
          <p className="an-muted">
            {dayFr(a.date)} · {a.type}
            {a.by && a.by !== a.type ? ` · ${a.by}` : ""}
          </p>
        </div>
      )}
      <div className="rdm-ba">
        <span className="rdm-ba__cell">
          <small>Avant</small>
          {fmt(ba.before, m.unit)}
        </span>
        {ba.after.map((x) => (
          <span key={x.days} className={`rdm-ba__cell${x.good == null ? "" : x.good ? " rdm-ba__cell--good" : " rdm-ba__cell--bad"}`}>
            <small>+{x.days} j</small>
            {x.value == null ? "—" : fmt(x.value, m.unit)}
            {x.changePct != null && <em>{`${x.changePct > 0 ? "+" : ""}${x.changePct.toLocaleString("fr-FR")} %`}</em>}
          </span>
        ))}
      </div>
      {(a.outcome || a.verdict) && (
        <p className="rdm-detail__verdict">
          {a.outcome && <OutcomeBadge outcome={a.outcome} />} {a.verdict}
        </p>
      )}
    </div>
  );
}

/* ─── La page ───────────────────────────────────────────────────────────── */

const TABS = [
  { key: "chronologie", label: "Chronologie" },
  { key: "objectifs", label: "Objectifs" },
  { key: "courbes", label: "Courbes" },
  { key: "marche", label: "Ce qui marche" },
] as const;

export function RoadmapBoard({ view }: { view: RoadmapView }) {
  const [team, setTeam] = useState<TeamFilter>("all");
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("chronologie");
  // La courbe : celle d'un objectif chiffré, ou d'un indicateur suivi chaque semaine (photo du lundi).
  const [source, setSource] = useState<string>(() => {
    const first = view.goals.find((g) => g.kind === "chiffre" && g.series.length > 1);
    return first ? `goal:${first.id}` : "metric:leads-qualifies-total";
  });
  const [months, setMonths] = useState(12);
  const [selected, setSelected] = useState<string | null>(null);
  const [dialog, setDialog] = useState<{ kind: "goal" } | { kind: "action"; goal: string | null } | null>(null);
  const inTeam = (x: GoalTeam) => team === "all" || x === team || x === "tous";

  // Mémorisés : la frise recalcule ses couloirs seulement quand l'équipe ou les données changent.
  const goals = useMemo(() => view.goals.filter((g) => g.status !== "abandonne" && (team === "all" || g.team === team || g.team === "tous")), [view.goals, team]);
  const actions = useMemo(() => view.actions.filter((a) => team === "all" || a.team === team || a.team === "tous"), [view.actions, team]);
  const byGoal = useMemo(() => {
    const m = new Map<string, ActionView[]>();
    for (const a of actions) if (a.goal) (m.get(a.goal) ?? m.set(a.goal, []).get(a.goal)!).push(a);
    return m;
  }, [actions]);
  const today = view.today;
  const metrics = WEEKLY_INDICATORS.filter((x) => team === "all" || team === "tous" || x.teams.includes(team));
  const chartGoals = goals.filter((g) => g.kind === "chiffre" && g.metric);
  const sourceGoal = source.startsWith("goal:") ? view.goals.find((g) => `goal:${g.id}` === source) : undefined;
  const sourceMetric = source.startsWith("metric:") ? WEEKLY_INDICATORS.find((x) => x.key === source.slice(7)) : undefined;
  const chartMeta = sourceGoal ? indicatorOf(sourceGoal.metric) : sourceMetric;
  const chartLabel = sourceGoal ? sourceGoal.title : (sourceMetric?.label ?? "");
  const fullSeries = useMemo(() => (sourceGoal ? sourceGoal.series : sourceMetric ? (view.series[sourceMetric.key] ?? []) : []), [sourceGoal, sourceMetric, view.series]);
  const series = useMemo(() => {
    const last = fullSeries.length ? Date.parse(`${fullSeries[fullSeries.length - 1].week}T12:00:00Z`) : null;
    return last == null ? fullSeries : fullSeries.filter((p) => Date.parse(`${p.week}T12:00:00Z`) >= last - months * 30.5 * 86_400_000);
  }, [fullSeries, months]);

  const toValidate = goals.filter((g) => g.status === "propose").length;
  const pace = useMemo(() => progressToDate(actions, today), [actions, today]);
  const works = view.works.filter((w) => inTeam(w.team));
  const current = actions.find((a) => a.id === selected) ?? null;

  return (
    <div className="rdm">
      <div className="rdm-bar">
        <div className="an-filters" role="radiogroup" aria-label="Équipe">
          {(
            [
              ["all", "Tout"],
              ...ROADMAP_TEAMS.filter((x) => x.value !== "tous").map((x) => [x.value, x.short]),
            ] as [TeamFilter, string][]
          ).map(([k, l]) => (
            <button key={k} type="button" role="radio" aria-checked={team === k} className={`an-filter${team === k ? " an-filter--on" : ""}`} onClick={() => (setTeam(k), setSelected(null))}>
              {l}
            </button>
          ))}
        </div>
        <div className="rdm-bar__right">
          <div
            className={`rdm-pace${pace.pct === 100 ? " rdm-pace--ok" : pace.pct < 50 ? " rdm-pace--bad" : ""}`}
            title={pace.due ? `${pace.done} tâche${pace.done > 1 ? "s" : ""} faite${pace.done > 1 ? "s" : ""} sur ${pace.due} prévue${pace.due > 1 ? "s" : ""} à aujourd'hui${pace.late ? ` · ${pace.late} en retard` : ""}` : "Aucune tâche prévue à ce jour."}
          >
            <span className="rdm-pace__label">{pace.pct === 100 ? "✅ À jour" : "À date"}</span>
            <span className="rdm-pace__track" role="progressbar" aria-label="Tâches faites à date" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pace.pct}>
              <span className="rdm-pace__fill" style={{ width: `${pace.pct}%` }} />
            </span>
            <span className="rdm-pace__pct">{pace.pct} %</span>
          </div>
          <div className="rdm-bar__buttons">
            <button type="button" className="an-btn" onClick={() => setDialog({ kind: "action", goal: null })}>
              + Action
            </button>
            <button type="button" className="an-btn rdm-btn--primary" onClick={() => setDialog({ kind: "goal" })}>
              + Objectif
            </button>
          </div>
        </div>
      </div>

      <nav className="an-filters rdm-tabs" role="tablist" aria-label="Vues">
        {TABS.map((x) => (
          <button key={x.key} type="button" role="tab" aria-selected={tab === x.key} className={`an-filter${tab === x.key ? " an-filter--on" : ""}`} onClick={() => setTab(x.key)}>
            {x.label}
            {x.key === "objectifs" && toValidate > 0 && <span className="rdm-count">{toValidate}</span>}
          </button>
        ))}
      </nav>

      {tab === "objectifs" &&
        (goals.length ? (
          HORIZONS.map((h) => {
            const list = goals.filter((g) => g.horizon === h.key);
            if (!list.length) return null;
            return (
              <section key={h.key} className="rdm-horizon">
                <h2 className="rdm-h2">{h.label}</h2>
                <ul className="rdm-goals">
                  {list.map((g) => (
                    <GoalRow key={g.id} g={g} actions={byGoal.get(g.id) ?? []} today={today} onAddAction={(goal) => setDialog({ kind: "action", goal })} />
                  ))}
                </ul>
              </section>
            );
          })
        ) : (
          <div className="an-empty rdm-start">
            <p>Aucun objectif. Fixez le premier, ou lancez la revue de Serge ou de Margaux : ils proposeront les leurs.</p>
            <button type="button" className="an-btn rdm-btn--primary" onClick={() => setDialog({ kind: "goal" })}>
              + Objectif
            </button>
          </div>
        ))}

      {tab === "chronologie" && (
        <RoadmapTimeline
          goals={goals}
          actions={actions}
          today={today}
          renderGoal={(g) => <GoalRow key={g.id} g={g} actions={byGoal.get(g.id) ?? []} today={today} onAddAction={(goal) => setDialog({ kind: "action", goal })} />}
          renderAction={(a) => {
            const goal = goals.find((g) => g.id === a.goal);
            const meta = goal?.metric ? indicatorOf(goal.metric) : undefined;
            return <ActionDetail a={a} series={goal?.series ?? []} unit={meta?.unit ?? "nb"} better={meta?.better ?? "up"} label={goal?.title ?? ""} bare />;
          }}
        />
      )}

      {tab === "courbes" && (
        <section className="an-card">
          <div className="rdm-bar">
            <select className="an-select" value={source} onChange={(e) => (setSource(e.target.value), setSelected(null))} aria-label="Courbe">
              {chartGoals.length > 0 && (
                <optgroup label="Objectifs">
                  {chartGoals.map((g) => (
                    <option key={g.id} value={`goal:${g.id}`}>
                      {g.title}
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label="Suivis chaque semaine">
                {metrics.map((x) => (
                  <option key={x.key} value={`metric:${x.key}`}>
                    {x.label}
                  </option>
                ))}
              </optgroup>
            </select>
            <div className="an-filters an-filters--small" role="radiogroup" aria-label="Période">
              {[3, 6, 12].map((n) => (
                <button key={n} type="button" role="radio" aria-checked={months === n} className={`an-filter${months === n ? " an-filter--on" : ""}`} onClick={() => setMonths(n)}>
                  {n} mois
                </button>
              ))}
            </div>
          </div>
          <Chart series={series} unit={chartMeta?.unit ?? "nb"} actions={sourceGoal ? actions.filter((a) => !a.goal || a.goal === sourceGoal.id) : actions} selected={selected} onSelect={setSelected} target={sourceGoal?.target ?? null} label={chartLabel} />
          <p className="rdm-legend">
            <span className="rdm-legend__item rdm-legend__item--ok">◆ a marché</span>
            <span className="rdm-legend__item rdm-legend__item--muted">◆ sans effet</span>
            <span className="rdm-legend__item rdm-legend__item--bad">◆ a empiré</span>
            <span className="rdm-legend__item rdm-legend__item--pending">◆ à juger</span>
            <span className="rdm-legend__item rdm-legend__item--decision">◆ décision</span>
          </p>
          {current && chartMeta && <ActionDetail a={current} series={fullSeries} unit={chartMeta.unit} better={chartMeta.better} label={chartLabel} />}
        </section>
      )}

      {tab === "marche" &&
        (works.length ? (
          <section className="an-card">
            <div className="an-scroll">
              <table className="an-table">
                <thead>
                  <tr>
                    <th className="an-th">Type d&apos;action</th>
                    <th className="an-th">Équipe</th>
                    <th className="an-th">Ont marché</th>
                    <th className="an-th">À juger</th>
                  </tr>
                </thead>
                <tbody>
                  {works.map((w) => (
                    <tr key={`${w.team}${w.type}`} className="an-row">
                      <td>{w.type}</td>
                      <td>{TEAM_LABEL[w.team]}</td>
                      <td>
                        <span className="rdm-works">
                          <span className="an-meter__track">
                            <span className="an-meter__fill" style={{ width: `${w.judged ? (w.worked / w.judged) * 100 : 0}%` }} />
                          </span>
                          {w.judged ? `${w.worked} / ${w.judged}` : "—"}
                        </span>
                      </td>
                      <td>{w.pending || "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        ) : (
          <p className="an-empty">Le bilan se construit avec les verdicts des chefs, deux semaines après chaque action faite.</p>
        ))}

      {dialog?.kind === "goal" && <GoalForm onClose={() => setDialog(null)} />}
      {dialog?.kind === "action" && <ActionForm goals={view.goals} goal={dialog.goal} onClose={() => setDialog(null)} />}
    </div>
  );
}
