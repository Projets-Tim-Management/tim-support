"use client";

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";

import { indicatorOf } from "@/modules/ai-team/lib/indicators-meta";
import { CopyPromptButton } from "@/modules/ai-team/admin/CopyPromptButton";
import { Drawer } from "@/modules/ai-team/admin/Drawer";
import { actionTone as toneOf, DAY, fmtValue as fmt, gapText, goalTone, OUTCOME, ProgressRing, t } from "@/modules/ai-team/admin/roadmap-ui";
import { taskHref } from "@/modules/ai-team/lib/my-tasks-shared";
import type { ActionView, GoalView } from "@/modules/ai-team/lib/roadmap";

/**
 * LA FRISE CHRONOLOGIQUE de la feuille de route (14/11/2026 : « un vrai
 * diagramme chronologique où l'on fait défiler de droite à gauche, vers le
 * passé et le futur, avec des pointes à date qu'on peut cliquer — UX, ludique,
 * simple »).
 *
 * Trois lignes : les OBJECTIFS (une barre du départ à l'échéance, remplie de
 * leur progression, un drapeau à l'échéance), les actions des AGENTS, celles
 * des ÉQUIPES. Une pointe pleine : faite ; creuse : prévue ; sa couleur : ce
 * qu'elle a donné. On fait glisser la frise à la souris (ou au pavé), on zoome
 * en semaines ou en mois ; elle s'ouvre sur aujourd'hui. Un clic : le détail,
 * et l'avant / après sur la courbe de l'objectif qu'elle sert.
 */

const ZOOMS = [
  { key: "semaines", label: "Semaines", px: 16 },
  { key: "mois", label: "Mois", px: 5 },
] as const;

const dayFr = (ms: number) => new Date(ms).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Paris" });

type Sel = { kind: "action"; a: ActionView } | { kind: "goal"; g: GoalView } | { kind: "group"; items: ActionView[]; label: string } | null;
/** Une étiquette : une action, ou un PAQUET d'actions de la même famille le même jour (la même semaine au zoom « mois »). */
type Chip = { a: ActionView; group: ActionView[]; left: number; width: number; row: number };
type Family = ActionView["kind"];
type Lane = { key: string; goal: GoalView | null; family: Family | null; chips: Chip[]; top: number; height: number };

/** Les trois familles et leur couleur : ce que les agents vous confient, ce qu'ils font, ce que font les équipes. */
const FAMILIES: { key: Family; label: string; icon: string; lane: string; hint: string }[] = [
  { key: "vous", label: "Pour vous", icon: "🙋", lane: "Vos autres tâches", hint: "qui ne servent aucun objectif" },
  { key: "ia", label: "Agents IA", icon: "🤖", lane: "Agents IA", hint: "rapports et décisions hors objectif" },
  { key: "equipe", label: "Équipes", icon: "👥", lane: "Équipes", hint: "actions hors objectif" },
];

const AXIS_H = 46;
const HEAD_H = 64;
const CHIP_H = 38;
const ROW_GAP = 10;
const PAD = 16;
const shortDay = (ms: number) => new Date(ms).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "Europe/Paris" });

/**
 * Range les actions d'une ligne en ÉTIQUETTES lisibles posées à leur date, sur autant de rangs qu'il faut pour
 * qu'aucune ne chevauche la suivante (comme les feuilles de route de Linear ou Notion). Les actions d'une même
 * famille la même semaine (le même mois au zoom « mois ») forment UN paquet — « 9 tâches · semaine du 16 nov. » —
 * qui s'ouvre d'un clic (16/11/2026 : « lourd à tout scroller » : quinze rapports du même lundi faisaient quinze
 * rangs, et les objectifs d'une semaine un escalier). Pure.
 */
export const bucketOf = (ms: number, zoom: "semaines" | "mois") => {
  const d = new Date(ms);
  if (zoom === "mois") return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
  const day = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  return String(day - ((d.getUTCDay() + 6) % 7) * DAY);
};
const bucketLabel = (ms: number, zoom: "semaines" | "mois") =>
  zoom === "mois" ? new Date(ms).toLocaleDateString("fr-FR", { month: "long", timeZone: "UTC" }) : `semaine du ${shortDay(Number(bucketOf(ms, "semaines")))}`;

function pack(actions: ActionView[], x: (ms: number) => number, zoom: "semaines" | "mois"): { chips: Chip[]; rows: number } {
  const buckets = new Map<string, ActionView[]>();
  for (const a of [...actions].filter((a) => Number.isFinite(t(a.date))).sort((a, b) => t(a.date) - t(b.date))) {
    const k = `${a.kind}|${bucketOf(t(a.date), zoom)}`;
    buckets.set(k, [...(buckets.get(k) ?? []), a]);
  }
  const ends: number[] = [];
  const chips = [...buckets.values()]
    .sort((a, b) => t(a[0].date) - t(b[0].date))
    .map((group) => {
      const a = group[0];
      const left = x(t(a.date)) - 6;
      const width = group.length > 1 ? 190 : Math.min(300, Math.max(150, 96 + a.title.length * 7.8));
      let row = ends.findIndex((end) => end + 8 <= left);
      if (row < 0) row = ends.length;
      ends[row] = left + width;
      return { a, group, left, width, row };
    });
  return { chips, rows: ends.length };
}

export function RoadmapTimeline({ goals, actions: allActions, today, renderGoal, renderAction }: { goals: GoalView[]; actions: ActionView[]; today: string; renderGoal: (g: GoalView) => React.ReactNode; renderAction: (a: ActionView) => React.ReactNode }) {
  // Les familles affichées : on peut en masquer une d'un clic.
  const [shown, setShown] = useState<Record<Family, boolean>>({ vous: true, ia: true, equipe: true });
  const actions = useMemo(() => allActions.filter((a) => shown[a.kind]), [allActions, shown]);
  const now0 = t(today);
  const counts = useMemo(() => Object.fromEntries(FAMILIES.map((f) => [f.key, { all: allActions.filter((a) => a.kind === f.key).length, todo: allActions.filter((a) => a.kind === f.key && a.status !== "faite").length, late: allActions.filter((a) => a.kind === f.key && a.status !== "faite" && t(a.date) < now0).length }])) as Record<Family, { all: number; todo: number; late: number }>, [allActions, now0]);
  const [zoom, setZoom] = useState<(typeof ZOOMS)[number]["key"]>("semaines");
  const [sel, setSel] = useState<Sel>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; left: number; moved: boolean } | null>(null);
  const px = ZOOMS.find((z) => z.key === zoom)!.px / DAY;
  const now = t(today);

  // L'étendue : de la plus ancienne date (au plus tôt 4 mois avant aujourd'hui) à la plus lointaine (au moins 6 mois devant).
  const { start, end } = useMemo(() => {
    const dates = [...actions.map((a) => t(a.date)), ...goals.flatMap((g) => [t(g.startDate ?? today), t(g.dueDate)])].filter(Number.isFinite);
    const lo = Math.min(now - 120 * DAY, ...dates) - 21 * DAY;
    const hi = Math.max(now + 180 * DAY, ...dates) + 45 * DAY;
    const s = new Date(lo);
    return { start: Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), 1), end: hi };
  }, [actions, goals, now, today]);
  const width = Math.round((end - start) * px);
  const x = useMemo(() => (ms: number) => Math.round((ms - start) * px), [start, px]);

  // Les mois, et les lundis au zoom « semaines ».
  const months = useMemo(() => {
    const out: { at: number; label: string }[] = [];
    const d = new Date(start);
    for (let m = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); m.getTime() < end; m = new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 1))) {
      out.push({ at: m.getTime(), label: m.toLocaleDateString("fr-FR", { month: "long", year: m.getUTCMonth() === 0 || out.length === 0 ? "numeric" : undefined, timeZone: "UTC" }) });
    }
    return out;
  }, [start, end]);
  const weeks = useMemo(() => {
    if (zoom !== "semaines") return [];
    const out: number[] = [];
    const first = new Date(start);
    const offset = (8 - (first.getUTCDay() || 7)) % 7;
    for (let w = start + offset * DAY; w < end; w += 7 * DAY) out.push(w);
    return out;
  }, [start, end, zoom]);

  // Une ligne par objectif (sa barre, puis ses actions), et une ligne pour les actions qui ne servent aucun objectif.
  const lanes: Lane[] = useMemo(() => {
    const visible = goals.filter((g) => g.status !== "abandonne");
    const ids = new Set(visible.map((g) => g.id));
    // Une ligne par objectif ; ce qui ne sert aucun objectif va sur la ligne de sa famille.
    const loose = actions.filter((a) => !a.goal || !ids.has(a.goal));
    const defs = [
      ...visible.map((g) => ({ key: g.id, goal: g as GoalView | null, family: null as Family | null, items: actions.filter((a) => a.goal === g.id) })),
      ...FAMILIES.map((f) => ({ key: `f-${f.key}`, goal: null, family: f.key as Family | null, items: loose.filter((a) => a.kind === f.key) })),
    ].filter((l) => l.goal || l.items.length);
    let top = AXIS_H;
    return defs.map((l) => {
      const { chips, rows } = pack(l.items, x, zoom);
      const head = l.goal ? HEAD_H : PAD;
      const height = Math.max(l.goal ? 84 : 70, head + rows * (CHIP_H + ROW_GAP) + (rows ? PAD - ROW_GAP : PAD));
      const lane = { key: l.key, goal: l.goal, family: l.family, chips, top, height };
      top += height;
      return lane;
    });
  }, [goals, actions, x, zoom]);
  const trackH = (lanes.at(-1)?.top ?? AXIS_H) + (lanes.at(-1)?.height ?? 0);

  // À l'ouverture et au changement de zoom : aujourd'hui au tiers de l'écran (on voit un peu de passé, beaucoup d'avenir).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollLeft = Math.max(0, x(now) - el.clientWidth / 3);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom]);
  // La molette fait défiler la PAGE (16/11/2026 : la frise la détournait vers le temps, et on restait coincé dessus) ;
  // le temps se parcourt au pavé tactile, en glissant à la souris, aux flèches, ou avec Passé / Aujourd'hui / Futur.

  const go = (where: "past" | "today" | "future") => {
    const el = scroller.current;
    if (!el) return;
    const left = where === "today" ? x(now) - el.clientWidth / 3 : el.scrollLeft + (where === "past" ? -1 : 1) * el.clientWidth * 0.8;
    el.scrollTo({ left, behavior: "smooth" });
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    drag.current = { x: e.clientX, left: scroller.current?.scrollLeft ?? 0, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d || !scroller.current) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 3) d.moved = true;
    scroller.current.scrollLeft = d.left - dx;
  };
  const onPointerUp = () => {
    drag.current = null;
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    scroller.current?.scrollBy({ left: e.key === "ArrowLeft" ? -200 : 200, behavior: "smooth" });
  };

  // On ne coche plus ici (16/11/2026) : la frise montre l'état, « Mes tâches » est le seul endroit où l'on coche.
  const close = useCallback(() => setSel(null), []);
  // Le panneau suit les données rechargées (une action cochée y apparaît cochée).
  const selAction = sel?.kind === "action" ? (actions.find((a) => a.id === sel.a.id) ?? sel.a) : null;
  const selGoal = sel?.kind === "goal" ? (goals.find((g) => g.id === sel.g.id) ?? sel.g) : null;

  if (!lanes.length) return <p className="an-empty">Rien encore sur la frise : ajoutez un objectif ou une action.</p>;

  return (
    <div className="rdt">
      <div className="rdt-families" role="group" aria-label="Familles affichées">
        {FAMILIES.map((f) => (
          <button key={f.key} type="button" aria-pressed={shown[f.key]} className={`rdt-family rdt-fam--${f.key}${shown[f.key] ? " rdt-family--on" : ""}`} onClick={() => setShown({ ...shown, [f.key]: !shown[f.key] })}>
            <span className="rdt-family__icon" aria-hidden>
              {f.icon}
            </span>
            <span className="rdt-family__text">
              <strong>{f.label}</strong>
              <small>
                {counts[f.key].todo} à faire{counts[f.key].late ? ` · ${counts[f.key].late} en retard` : ""} · {counts[f.key].all - counts[f.key].todo} faite{counts[f.key].all - counts[f.key].todo > 1 ? "s" : ""}
              </small>
            </span>
          </button>
        ))}
      </div>
      <div className="rdm-bar">
        <div className="rdt-nav">
          <button type="button" className="an-btn" onClick={() => go("past")} aria-label="Vers le passé">
            ← Passé
          </button>
          <button type="button" className="an-btn" onClick={() => go("today")}>
            Aujourd&apos;hui
          </button>
          <button type="button" className="an-btn" onClick={() => go("future")} aria-label="Vers l'avenir">
            Futur →
          </button>
        </div>
        <div className="an-filters an-filters--small" role="radiogroup" aria-label="Zoom">
          {ZOOMS.map((z) => (
            <button key={z.key} type="button" role="radio" aria-checked={zoom === z.key} className={`an-filter${zoom === z.key ? " an-filter--on" : ""}`} onClick={() => setZoom(z.key)}>
              {z.label}
            </button>
          ))}
        </div>
      </div>

      <div className="rdt-frame">
        {/* La colonne fixe : le nom de chaque ligne, et la progression de son objectif. */}
        <div className="rdt-side" style={{ height: trackH }}>
          <span className="rdt-side__axis" style={{ height: AXIS_H }} />
          {lanes.map((l) => (
            <button key={l.key} type="button" className={`rdt-side__lane${l.family ? ` rdt-side__lane--fam rdt-fam--${l.family}` : ""}`} style={{ height: l.height }} onClick={() => l.goal && setSel({ kind: "goal", g: l.goal })} disabled={!l.goal}>
              {l.goal ? (
                <>
                  {l.goal.metric ? <ProgressRing pct={l.goal.progress} expected={null} tone={goalTone(l.goal)} done={l.goal.status === "atteint" || l.goal.pace === "atteint"} size={48} /> : <span className={`rdm-goal__flag rdm-goal__flag--${goalTone(l.goal)} rdt-side__flag`}>{l.goal.pace === "atteint" ? "✓" : "⚑"}</span>}
                  <span className="rdt-side__text">
                    <strong>{l.goal.title}</strong>
                    <small>{gapText(l.goal, today)}</small>
                  </span>
                </>
              ) : (
                <>
                  <span className="rdt-side__icon" aria-hidden>
                    {FAMILIES.find((f) => f.key === l.family)?.icon}
                  </span>
                  <span className="rdt-side__text">
                    <strong>{FAMILIES.find((f) => f.key === l.family)?.lane}</strong>
                    <small>{FAMILIES.find((f) => f.key === l.family)?.hint}</small>
                  </span>
                </>
              )}
            </button>
          ))}
        </div>

        <div className="rdt-scroll" ref={scroller} tabIndex={0} onKeyDown={onKey} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} aria-label="Frise chronologique : faites glisser pour aller dans le passé ou l'avenir">
          <div className="rdt-track" style={{ width, height: trackH }}>
            <div className="rdt-axis" style={{ height: AXIS_H }}>
              {months.map((m) => (
                <span key={m.at} className="rdt-axis__month" style={{ left: x(m.at) }}>
                  {m.label}
                </span>
              ))}
              {weeks.map((w) => (
                <span key={w} className="rdt-axis__week" style={{ left: x(w) }}>
                  {new Date(w).getUTCDate()}
                </span>
              ))}
            </div>
            {months.map((m) => (
              <span key={`g${m.at}`} className="rdt-grid" style={{ left: x(m.at), top: AXIS_H }} />
            ))}
            <span className="rdt-past" style={{ width: x(now), top: AXIS_H }} />

            {lanes.map((l, li) => {
              const g = l.goal;
              const gs = g ? t(g.startDate ?? today) : NaN;
              const ge = g ? t(g.dueDate) : NaN;
              const pct = g ? (g.progress ?? (g.pace === "atteint" ? 100 : null)) : null;
              const exp = g && g.status === "valide" ? g.expected : null;
              return (
                <div key={l.key} className={`rdt-row${li % 2 ? " rdt-row--alt" : ""}`} style={{ top: l.top, height: l.height }}>
                  {g && Number.isFinite(gs) && Number.isFinite(ge) && (
                    <button
                      type="button"
                      className={`rdt-goal rdt-goal--${goalTone(g)}${sel?.kind === "goal" && sel.g.id === g.id ? " rdt-goal--sel" : ""}`}
                      style={{ left: x(gs), width: Math.max(80, x(ge) - x(gs)), top: 12, ["--i" as string]: li } as React.CSSProperties}
                      onClick={() => !drag.current?.moved && setSel({ kind: "goal", g })}
                      title={`${g.title} — ${gapText(g, today)}`}
                    >
                      <span className="rdt-goal__fill" style={{ width: `${pct ?? 0}%` }}>
                        <span className="rdt-goal__shine" />
                      </span>
                      {exp != null && <span className="rdt-goal__expected" style={{ left: `${exp}%` }} title={`Aujourd'hui, il faudrait être à ${exp} %`} />}
                      <span className="rdt-goal__label">
                        {g.status === "atteint" || g.pace === "atteint" ? <b className="rdt-goal__pct">✓ Atteint</b> : pct != null && <b className="rdt-goal__pct">{pct} %</b>}
                        <span className="rdt-goal__name">{g.metric && g.current != null ? `${fmt(g.current, indicatorOf(g.metric)?.unit ?? "nb")} sur ${fmt(g.target, indicatorOf(g.metric)?.unit ?? "nb")}` : g.title}</span>
                      </span>
                      <span className="rdt-goal__end" aria-hidden>
                        🏁 {shortDay(ge)}
                      </span>
                    </button>
                  )}
                  {l.chips.map((c, ci) => {
                    const top = (g ? HEAD_H : PAD) + c.row * (CHIP_H + ROW_GAP);
                    const style = { left: c.left, width: c.width, top, ["--i" as string]: ci % 12 } as React.CSSProperties;
                    if (c.group.length > 1) {
                      const done = c.group.filter((a) => a.status === "faite").length;
                      const late = c.group.filter((a) => a.status !== "faite" && t(a.date) < now).length;
                      const fam = FAMILIES.find((f) => f.key === c.a.kind)!;
                      const label = `${c.group.length} ${c.a.kind === "ia" ? "travaux d'agents" : "tâches"} · ${bucketLabel(t(c.a.date), zoom)}`;
                      return (
                        <div key={`${c.a.id}-g`} className={`rdt-chip rdt-chip--group rdt-fam--${c.a.kind}${done === c.group.length ? " rdt-chip--done" : " rdt-chip--future"}${late ? " rdt-chip--late" : ""}`} style={style} title={c.group.map((a) => `• ${a.title}`).join("\n")}>
                          <span className="rdt-chip__count">{c.group.length}</span>
                          <button type="button" className="rdt-chip__body" onClick={() => !drag.current?.moved && setSel({ kind: "group", items: c.group, label: `${fam.icon} ${label}` })}>
                            <span className="rdt-chip__title">
                              <strong>{label}</strong>
                              <small>
                                {done} faite{done > 1 ? "s" : ""}
                                {late ? ` · ${late} en retard` : ""}
                              </small>
                            </span>
                          </button>
                        </div>
                      );
                    }
                    const on = sel?.kind === "action" && sel.a.id === c.a.id;
                    return (
                      <div
                        key={c.a.id}
                        className={`rdt-chip rdt-fam--${c.a.kind}${c.a.status === "faite" ? " rdt-chip--done" : " rdt-chip--future"}${c.a.status !== "faite" && t(c.a.date) < now ? " rdt-chip--late" : ""}${on ? " rdt-chip--sel" : ""}`}
                        style={style}
                        title={`${dayFr(t(c.a.date))} — ${c.a.title}${c.a.by ? ` (${c.a.by})` : ""}`}
                      >
                        <CheckBox a={c.a} />
                        <button type="button" className="rdt-chip__body" onClick={() => !drag.current?.moved && setSel({ kind: "action", a: c.a })}>
                          <span className="rdt-chip__icon" aria-hidden>
                            {FAMILIES.find((f) => f.key === c.a.kind)?.icon}
                          </span>
                          <span className="rdt-chip__date">{shortDay(t(c.a.date))}</span>
                          <span className="rdt-chip__title">{c.a.title}</span>
                          {c.a.outcome && <span className={`rdt-chip__result rdt-chip__result--${toneOf(c.a)}`} title={OUTCOME[c.a.outcome]?.label} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              );
            })}

            <span className="rdt-today" style={{ left: x(now) }}>
              <span className="rdt-today__label">Aujourd&apos;hui</span>
              <span className="rdt-today__dot" />
            </span>
          </div>
        </div>
      </div>

      <p className="rdm-legend">
        <span>Résultat :</span>
        <span className="rdm-legend__item rdm-legend__item--ok">● a marché</span>
        <span className="rdm-legend__item rdm-legend__item--muted">● sans effet</span>
        <span className="rdm-legend__item rdm-legend__item--bad">● a empiré</span>
        <span>· pointillés : à faire · bord rouge : en retard</span>
      </p>

      {/* Le détail : la même présentation que dans les onglets Objectifs et Courbes. */}
      {/* Un objectif s'ouvre lui aussi dans le tiroir (16/11/2026 : « plus simple à la lecture » qu'en bas de la frise). */}
      {selGoal && (
        <Drawer label={selGoal.title} onClose={close} narrow>
          <ul className="rdm-goals rdt-goalsheet">{renderGoal(selGoal)}</ul>
        </Drawer>
      )}
      {sel?.kind === "group" && (
        <Drawer label={sel.label} onClose={close} narrow>
          <div className="rdt-groupsheet">
            <h2>{sel.label}</h2>
            <ul>
              {sel.items.map((a) => (
                <li key={a.id}>
                  <button type="button" className={`rdt-groupsheet__row rdt-fam--${a.kind}`} onClick={() => setSel({ kind: "action", a })}>
                    <CheckBox a={a} />
                    <span>
                      <strong className={a.status === "faite" ? "rdt-done" : undefined}>{a.title}</strong>
                      <small>
                        {shortDay(t(a.date))}
                        {a.by ? ` · ${a.by}` : ""}
                        {a.status !== "faite" && t(a.date) < now ? " · en retard" : ""}
                      </small>
                    </span>
                    <span aria-hidden>›</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </Drawer>
      )}
      {/* Une tâche s'ouvre dans le tiroir, comme la fiche d'un agent. */}
      {selAction && (
        <Drawer label={selAction.title} onClose={close} narrow>
          <TaskSheet a={selAction} goal={goals.find((g) => g.id === selAction.goal)} today={today}>
            {renderAction(selAction)}
          </TaskSheet>
        </Drawer>
      )}
    </div>
  );
}

/* ─── L'état d'une action : faite ou à faire (on coche dans « Mes tâches ») ─── */

/** Une tâche de la direction ou d'une équipe : elle se coche dans « Mes tâches » (même identifiant : o12, r5, a3). */
export const inMyTasks = (a: ActionView) => a.source === "equipe" || a.source === "objectif" || a.source === "recommandation";

export function CheckBox({ a }: { a: ActionView }) {
  const done = a.status === "faite";
  return (
    <span className={`rdt-check rdt-check--fixed${done ? " rdt-check--on" : ""}`} aria-label={done ? "Faite" : "À faire"}>
      {done ? "✓" : "○"}
    </span>
  );
}

const STATUS_LABEL: Record<ActionView["status"], string> = { faite: "Faite", "en-cours": "En cours", prevue: "À faire" };
const SOURCE_LABEL: Record<ActionView["source"], string> = { objectif: "Objectif de la semaine (Serge)", recommandation: "Demande d'un chef", decision: "Décision d'un chef", equipe: "Action d'équipe", rapport: "Rapport d'agent" };

/** La fiche d'une tâche, dans le tiroir : ce qu'elle est, ce qu'il faut faire (étapes à cocher, prompts prêts), ce qu'elle sert. */
function TaskSheet({ a, goal, today, children }: { a: ActionView; goal: GoalView | undefined; today: string; children: React.ReactNode }) {
  const fam = FAMILIES.find((f) => f.key === a.kind)!;
  const late = a.status !== "faite" && t(a.date) < t(today);
  const d = a.detail ?? {};
  const steps = d.steps ?? [];
  const stepsCheckable = a.source === "objectif" || (a.source === "recommandation" && a.requestKind === "a-faire");
  const doneSteps = steps.filter((x) => x.done).length;
  return (
    <div className={`rdt-sheet rdt-fam--${a.kind}`}>
      <header className="rdt-sheet__hero">
        <span className="rdt-sheet__family">
          <span className="rdt-sheet__family-icon" aria-hidden>
            {fam.icon}
          </span>
          {fam.label} · {SOURCE_LABEL[a.source]}
        </span>
        <div className="rdt-sheet__title">
          <CheckBox a={a} />
          <h2 className={a.status === "faite" ? "rdt-done" : undefined}>{a.title}</h2>
        </div>
        <div className="rdt-sheet__meta">
          <span className={`rdt-pill rdt-pill--status${a.status === "faite" ? " rdt-pill--done" : late ? " rdt-pill--late" : ""}`}>{a.status === "faite" ? "✓ Faite" : late ? "⏰ En retard" : STATUS_LABEL[a.status]}</span>
          <span className="rdt-pill">📅 {dayFr(t(a.date))}</span>
          {a.by && <span className="rdt-pill">👤 {a.by}</span>}
          {d.minutes ? <span className="rdt-pill">⏱ {d.minutes} min</span> : null}
          {d.page && <span className="rdt-pill rdt-pill--page">📄 {d.page}</span>}
        </div>
        {stepsCheckable && steps.length > 0 && (
          <div className="rdt-sheet__progress">
            <span className="rdt-sheet__progress-bar">
              <span style={{ width: `${(doneSteps / steps.length) * 100}%` }} />
            </span>
            <span>
              {doneSteps} / {steps.length} étape{steps.length > 1 ? "s" : ""}
            </span>
          </div>
        )}
      </header>

      <div className="rdt-sheet__content">
        {goal && (
          <div className="rdt-sheet__goal">
            {goal.metric ? <ProgressRing pct={goal.progress} expected={null} tone={goalTone(goal)} done={goal.status === "atteint" || goal.pace === "atteint"} size={48} /> : <span aria-hidden>🎯</span>}
            <span>
              <small>Sert l&apos;objectif</small>
              <strong>{goal.title}</strong>
              <small>{gapText(goal, today)}</small>
            </span>
          </div>
        )}

        {(d.diagnosis || d.summary) && (
          <section className="rdt-card2">
            <h3>
              <span aria-hidden>🔍</span> {d.summary ? "Ce que l'agent a vu" : "Ce qu'on voit"}
            </h3>
            <p>{d.diagnosis ?? d.summary}</p>
          </section>
        )}
        {d.why && (
          <section className="rdt-card2">
            <h3>
              <span aria-hidden>💡</span> Pourquoi
            </h3>
            <p>{d.why}</p>
          </section>
        )}
        {d.question && (
          <section className="rdt-card2 rdt-card2--accent">
            <h3>
              <span aria-hidden>❓</span> La question à trancher
            </h3>
            <p>{d.question}</p>
            {a.status !== "faite" && <small>Elle se tranche dans « Mes tâches ».</small>}
          </section>
        )}
        {steps.length > 0 && (
          <section className="rdt-card2">
            <h3>
              <span aria-hidden>🪜</span> Les étapes
            </h3>
            <ol className="rdt-stepper">
              {steps.map((x, i) => (
                <li key={i} className={`rdt-stepper__step${x.done ? " rdt-stepper__step--done" : ""}`}>
                  <span className="rdt-stepper__node">{x.done ? "✓" : i + 1}</span>
                  <div className="rdt-stepper__body">
                    <div className="rdt-stepper__head">
                      <span className="rdt-stepper__text">{x.text}</span>
                      {x.minutes ? <span className="rdt-stepper__time">{x.minutes} min</span> : null}
                    </div>
                    {x.prompt && <CopyPromptButton prompt={x.prompt} />}
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
        {d.measure && (
          <section className="rdt-card2">
            <h3>
              <span aria-hidden>📏</span> Ce qu&apos;on mesurera
            </h3>
            <p>{d.measure}</p>
          </section>
        )}
        {d.notes && (
          <section className="rdt-card2">
            <h3>
              <span aria-hidden>📝</span> Détail
            </h3>
            <p>{d.notes}</p>
          </section>
        )}
        {children}
      </div>

      <footer className="rdt-sheet__foot">
        {inMyTasks(a) && a.status !== "faite" ? (
          <a className="an-btn rdm-btn--primary rdt-sheet__done" href={taskHref(a.id)}>
            La faire dans Mes tâches →
          </a>
        ) : (
          <a className="an-btn" href={a.href}>
            {a.source === "rapport" ? "Fiche de l'agent" : "Fiche complète"}
          </a>
        )}
        {d.url && (
          <a className="an-btn" href={d.url} target="_blank" rel="noreferrer noopener">
            Ouvrir le lien →
          </a>
        )}
      </footer>
    </div>
  );
}
