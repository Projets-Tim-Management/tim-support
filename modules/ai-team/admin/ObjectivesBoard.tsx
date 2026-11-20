import { taskHref } from "@/modules/ai-team/lib/my-tasks-shared";

/**
 * LES OBJECTIFS DE LA SEMAINE de la direction, sur la fiche de Sergey : où en
 * est chacun (fait ou à faire, étapes faites), son échéance et ses créneaux.
 * Lecture seule (16/11/2026 : « je ne veux pas cocher à un autre endroit ») :
 * les étapes, les prompts et la case se trouvent dans « Mes tâches ».
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

function ObjectiveCard({ o }: { o: BoardObjective }) {
  const done = o.steps.filter((s) => s.done).length;
  return (
    <li className={`ait-obj${o.status === "fait" ? " ait-obj--done" : ""}${o.status === "abandonne" || o.status === "reporte" ? " ait-obj--closed" : ""}`}>
      <div className="ait-obj__top">
        <span className="ait-obj__rank">{o.rank}</span>
        <div className="ait-obj__head">
          <strong className="ait-obj__title">{o.title}</strong>
          <span className="ait-obj__meta">
            {STATUS[o.status] ?? o.status}
            {o.dueDate ? ` · avant ${dayFr(o.dueDate)}` : ""}
            {o.minutes ? ` · ${duration(o.minutes)}` : ""}
            {o.evidence ? ` · ${EVIDENCE[o.evidence] ?? o.evidence}` : ""}
          </span>
          {o.page && <span className="ait-obj__page">{o.page}</span>}
        </div>
        <span className="ait-obj__count" aria-label={`${done} étape(s) faite(s) sur ${o.steps.length}`}>
          {done}/{o.steps.length}
        </span>
      </div>
      <span className="ait-obj__bar" aria-hidden>
        <span style={{ width: `${o.steps.length ? (done / o.steps.length) * 100 : 0}%` }} />
      </span>
      {o.diagnosis && <p className="ait-obj__text">🔎 {o.diagnosis}</p>}
      {o.slots.length > 0 && <p className="ait-obj__slots">📅 {o.slots.map(slotFr).join(" · ")}</p>}
      <div className="ait-obj__actions">
        <a className="ait-obj__link" href={taskHref(`o${o.id}`)}>
          {o.status === "a-faire" ? "Le faire dans Mes tâches →" : "Voir dans Mes tâches →"}
        </a>
      </div>
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
