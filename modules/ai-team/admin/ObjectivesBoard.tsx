"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { CopyPromptButton } from "@/modules/ai-team/admin/CopyPromptButton";

/**
 * LES OBJECTIFS DE LA SEMAINE de la direction, sur la fiche de Serge : chaque
 * objectif avec son diagnostic, ce que fait le mieux classé, ses étapes à
 * cocher (et leur prompt prêt, à copier), son échéance et ses créneaux dans
 * l'agenda. Cocher est immédiat à l'écran, puis enregistré ; une erreur
 * rétablit la case et le dit.
 */

export type BoardStep = { text: string; minutes: number | null; prompt: string | null; done: boolean };
export type BoardObjective = {
  id: string;
  rank: number;
  title: string;
  page: string | null;
  diagnosis: string | null;
  benchmark: string | null;
  why: string | null;
  measure: string | null;
  evidence: string | null;
  dueDate: string | null;
  minutes: number | null;
  status: string;
  steps: BoardStep[];
  slots: { start: string; end: string; link: string | null }[];
};

const EVIDENCE: Record<string, string> = { prouve: "✅ prouvé", correle: "📈 corrélé", speculatif: "🧪 à tester" };
const STATUS: Record<string, string> = { "a-faire": "À faire", fait: "✅ Fait", reporte: "↪️ Reporté", abandonne: "Abandonné" };
const dayFr = (iso: string) => new Date(iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "short", timeZone: "Europe/Paris" });
const slotFr = (s: { start: string; end: string }) =>
  `${new Date(s.start).toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", timeZone: "Europe/Paris" })} ${new Date(s.start).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}–${new Date(s.end).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Paris" })}`;
const duration = (m: number | null) => (m == null ? "" : m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ""}` : `${m} min`);

async function send(id: string, body: Record<string, unknown>) {
  const res = await fetch(`/api/admin/ai-team/objectives/${id}`, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? "Pas enregistré, réessayez.");
}

function ObjectiveCard({ o }: { o: BoardObjective }) {
  const router = useRouter();
  const [steps, setSteps] = useState(o.steps);
  const [status, setStatus] = useState(o.status);
  const [error, setError] = useState<string | null>(null);
  const done = steps.filter((s) => s.done).length;
  const closed = status === "abandonne" || status === "reporte";
  const toggle = async (i: number, value: boolean) => {
    const before = steps;
    const next = steps.map((s, j) => (j === i ? { ...s, done: value } : s));
    setSteps(next);
    setStatus(next.every((s) => s.done) ? "fait" : "a-faire");
    setError(null);
    try {
      await send(o.id, { step: i, done: value });
      router.refresh();
    } catch (e) {
      setSteps(before);
      setStatus(o.status);
      setError((e as Error).message);
    }
  };
  const close = async (next: "fait" | "abandonne" | "a-faire") => {
    setError(null);
    try {
      await send(o.id, { status: next });
      setStatus(next);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <li className={`ait-obj${status === "fait" ? " ait-obj--done" : ""}${closed ? " ait-obj--closed" : ""}`}>
      <div className="ait-obj__top">
        <span className="ait-obj__rank">{o.rank}</span>
        <div className="ait-obj__head">
          <strong className="ait-obj__title">{o.title}</strong>
          <span className="ait-obj__meta">
            {STATUS[status] ?? status}
            {o.dueDate ? ` · avant ${dayFr(o.dueDate)}` : ""}
            {o.minutes ? ` · ${duration(o.minutes)}` : ""}
            {o.evidence ? ` · ${EVIDENCE[o.evidence] ?? o.evidence}` : ""}
          </span>
          {o.page && <span className="ait-obj__page">{o.page}</span>}
        </div>
        <span className="ait-obj__count" aria-label={`${done} étape(s) faite(s) sur ${steps.length}`}>
          {done}/{steps.length}
        </span>
      </div>
      <span className="ait-obj__bar" aria-hidden>
        <span style={{ width: `${steps.length ? (done / steps.length) * 100 : 0}%` }} />
      </span>
      {o.diagnosis && <p className="ait-obj__text">🔎 {o.diagnosis}</p>}
      {(o.benchmark || o.why || o.measure) && (
        <details className="ait-obj__more">
          <summary>Le numéro 1, ce qu&apos;on y gagne, ce qu&apos;on mesurera</summary>
          {o.benchmark && <p className="ait-obj__text">🏆 {o.benchmark}</p>}
          {o.why && <p className="ait-obj__text">💡 {o.why}</p>}
          {o.measure && <p className="ait-obj__text">📏 {o.measure}</p>}
        </details>
      )}
      <ol className="ait-obj__steps">
        {steps.map((s, i) => (
          <li key={i} className={s.done ? "ait-obj__step--done" : undefined}>
            <label>
              <input type="checkbox" checked={s.done} disabled={closed} onChange={(e) => void toggle(i, e.target.checked)} />
              <span>
                {s.text}
                {s.minutes ? <span className="ait-obj__min"> · {duration(s.minutes)}</span> : null}
              </span>
            </label>
            {s.prompt && <CopyPromptButton prompt={s.prompt} />}
          </li>
        ))}
      </ol>
      {o.slots.length > 0 && (
        <p className="ait-obj__slots">
          📅{" "}
          {o.slots.map((s, i) => (
            <span key={s.start}>
              {i ? " · " : ""}
              {s.link ? (
                <a href={s.link} target="_blank" rel="noopener noreferrer">
                  {slotFr(s)}
                </a>
              ) : (
                slotFr(s)
              )}
            </span>
          ))}
        </p>
      )}
      <div className="ait-obj__actions">
        {status === "a-faire" && (
          <>
            <button type="button" className="ait-obj__link" onClick={() => void close("fait")}>
              Tout est fait
            </button>
            <button type="button" className="ait-obj__link ait-obj__link--muted" onClick={() => void close("abandonne")}>
              Abandonner (retire ses créneaux)
            </button>
          </>
        )}
        {(status === "fait" || status === "abandonne") && (
          <button type="button" className="ait-obj__link ait-obj__link--muted" onClick={() => void close("a-faire")}>
            Rouvrir
          </button>
        )}
      </div>
      {error && <p className="ait-obj__error">{error}</p>}
    </li>
  );
}

export function ObjectivesBoard({ objectives }: { objectives: BoardObjective[] }) {
  return (
    <ol className="ait-objs">
      {objectives.map((o) => (
        <ObjectiveCard key={o.id} o={o} />
      ))}
    </ol>
  );
}
