"use client";

import { indicatorOf } from "@/modules/ai-team/lib/indicators-meta";
import type { ActionView, GoalView } from "@/modules/ai-team/lib/roadmap";

/**
 * Les briques visuelles d'un objectif chiffré (feuille de route, 14/11/2026 :
 * « indique la progression, encore plus ludique ») : l'anneau de progression,
 * le repère « où on devrait en être aujourd'hui », et la phrase « il manque X,
 * il reste N jours ». Partagées par l'onglet Objectifs et la frise.
 */

export const DAY = 86_400_000;
/** Une date « AAAA-MM-JJ » (à midi UTC) ou ISO complète, en millisecondes. */
export const t = (iso: string) => Date.parse(iso.length === 10 ? `${iso}T12:00:00Z` : iso);

/** Ce qu'a donné une action jugée, et sa couleur. */
export const OUTCOME: Record<string, { label: string; tone: "ok" | "muted" | "bad" }> = { "a-marche": { label: "A marché", tone: "ok" }, "sans-effet": { label: "Sans effet", tone: "muted" }, "a-empire": { label: "A empiré", tone: "bad" } };
/** Le ton d'une action sur la frise et la courbe : prévue, jugée (ok, muted, bad), décision, en attente de verdict. */
export const actionTone = (a: ActionView) => (a.status !== "faite" ? "planned" : a.outcome && OUTCOME[a.outcome] ? OUTCOME[a.outcome].tone : a.source === "decision" ? "decision" : "pending");

export function OutcomeBadge({ outcome }: { outcome: string }) {
  const o = OUTCOME[outcome];
  return o ? <span className={`an-badge an-badge--${o.tone}`}>{o.label}</span> : null;
}

/** Un envoi au serveur : null si c'est fait, sinon le message d'erreur à afficher. */
export async function postJson(url: string, body: unknown, fallback = "L'enregistrement n'a pas abouti."): Promise<string | null> {
  const res = await fetch(url, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).catch(() => null);
  if (res?.ok) return null;
  const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
  return data?.error ?? fallback;
}

export const fmtValue = (v: number | null | undefined, unit: string) =>
  v == null ? "—" : unit === "€" ? v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }) : unit === "%" ? `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : v.toLocaleString("fr-FR", { maximumFractionDigits: 1 });

/** Où l'objectif devrait en être aujourd'hui, en % du chemin (le temps écoulé entre son départ et son échéance). */
export function expectedPct(g: GoalView, today: string): number | null {
  const s = t(g.startDate ?? "");
  const e = t(g.dueDate);
  if (!Number.isFinite(s) || !Number.isFinite(e) || e <= s) return null;
  return Math.max(0, Math.min(100, Math.round(((t(today) - s) / (e - s)) * 100)));
}

/** Le ton d'un objectif : atteint, en avance, dans les temps, en retard, à valider. */
export function goalTone(g: GoalView): "ok" | "good" | "on" | "bad" | "propose" {
  if (g.status === "propose") return "propose";
  if (g.pace === "atteint" || g.status === "atteint") return "ok";
  if (g.pace === "retard" || g.status === "manque") return "bad";
  if (g.pace === "avance") return "good";
  return "on";
}

/** « Il manque 700 € · 47 jours » — ou « Atteint ✓ », « Échéance passée ». */
export function gapText(g: GoalView, today: string): string {
  const days = Math.ceil((t(g.dueDate) - t(today)) / DAY);
  const left = days > 1 ? `${days} jours` : days === 1 ? "1 jour" : null;
  if (g.pace === "atteint" || g.status === "atteint") return "Objectif atteint ✓";
  const meta = g.metric ? indicatorOf(g.metric) : undefined;
  if (!meta || g.current == null || g.target == null) return left ? `${left} restants` : "Échéance passée";
  const gap = meta.better === "up" ? g.target - g.current : g.current - g.target;
  const what = meta.better === "up" ? `Il manque ${fmtValue(Math.abs(gap), meta.unit)}` : `Encore ${fmtValue(Math.abs(gap), meta.unit)} à gagner`;
  return left ? `${what} · ${left}` : `${what} · échéance passée`;
}

/** L'anneau : la part du chemin parcourue, le pourcentage au centre, et un trait là où il faudrait être aujourd'hui. */
export function ProgressRing({ pct, expected, tone, size = 92, done = false }: { pct: number | null; expected: number | null; tone: string; size?: number; done?: boolean }) {
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  const p = done ? 100 : Math.max(0, Math.min(100, pct ?? 0));
  const angle = expected == null ? null : (expected / 100) * 360 - 90;
  const ex = angle == null ? 0 : size / 2 + (r + 6) * Math.cos((angle * Math.PI) / 180);
  const ey = angle == null ? 0 : size / 2 + (r + 6) * Math.sin((angle * Math.PI) / 180);
  const ix = angle == null ? 0 : size / 2 + (r - 6) * Math.cos((angle * Math.PI) / 180);
  const iy = angle == null ? 0 : size / 2 + (r - 6) * Math.sin((angle * Math.PI) / 180);
  return (
    <svg className={`rdr rdr--${done ? "ok" : tone}${done ? " rdr--done" : ""}`} width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={pct == null ? "Progression inconnue" : `${p} % du chemin parcouru${expected != null ? `, ${expected} % attendus aujourd'hui` : ""}`}>
      <circle className="rdr__track" cx={size / 2} cy={size / 2} r={r} />
      <circle className="rdr__fill" cx={size / 2} cy={size / 2} r={r} strokeDasharray={`${(p / 100) * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ ["--len" as string]: `${(p / 100) * c}` } as React.CSSProperties} />
      {angle != null && <line className="rdr__expected" x1={ix} y1={iy} x2={ex} y2={ey} />}
      <text className="rdr__pct" x="50%" y="50%" dominantBaseline="central" textAnchor="middle">
        {done ? "✓" : pct == null ? "—" : `${p}%`}
      </text>
    </svg>
  );
}
