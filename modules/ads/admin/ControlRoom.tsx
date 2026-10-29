"use client";

import { useMemo, useState } from "react";

import type { ControlRoom as Room } from "@/modules/ads/agent/control-room";

import { eur } from "./format";

/**
 * La salle de contrôle d'un passage, dans l'onglet « Agent » (plan Publicité,
 * §9 quater, point 4) : jauges, arbre des agents, fil d'activité, journal des
 * décisions avec leurs appuis. Lecture seule — les gestes (lancer, arrêter)
 * restent en tête du panneau.
 */

type Data = NonNullable<Room>;

const time = (iso: string) => new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const stamp = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export const RUN_STATUS: Record<string, string> = { "en-cours": "En cours", "en-pause-budget": "En pause (plafond du jour)", "a-valider": "Terminé — à valider", termine: "Terminé", arrete: "Arrêté", echoue: "Échoué" };
const AGENT_STATUS: Record<string, { label: string; dot: string }> = {
  "en-attente": { label: "En attente", dot: "wait" },
  "en-cours": { label: "En cours", dot: "live" },
  termine: { label: "Terminé", dot: "ok" },
  echoue: { label: "Échoué", dot: "bad" },
  arrete: { label: "Arrêté", dot: "off" },
};
const DECISION_BADGE: Record<string, string> = { executee: "ads-badge--ok", proposee: "ads-badge--test", bloquee: "ads-badge--bad" };
const FEED_PREVIEW = 12;

function Gauge({ label, spent, cap, note }: { label: string; spent?: number; cap?: number; note?: string }) {
  const pct = cap ? Math.min(100, Math.round(((spent ?? 0) / cap) * 100)) : 0;
  return (
    <div className="ads-room__gauge">
      <span className="ads-room__gauge-label">{label}</span>
      {note ? (
        <span className="ads-room__gauge-note">{note}</span>
      ) : (
        <>
          <span className={`ads-room__bar${pct >= 90 ? " ads-room__bar--high" : ""}`} role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={label}>
            <span style={{ width: `${pct}%` }} />
          </span>
          <span className="ads-room__gauge-value">
            {eur(spent ?? 0)} sur {eur(cap ?? 0)}
          </span>
        </>
      )}
    </div>
  );
}

export function ControlRoom({ room, onSelectRun }: { room: Data; onSelectRun: (id: string) => void }) {
  const [allFeed, setAllFeed] = useState(false);
  const [filter, setFilter] = useState<string>("tous");
  const { run } = room;

  const kinds = useMemo(() => {
    const seen = new Map<string, string>();
    for (const d of room.decisions) seen.set(d.type, d.typeLabel);
    return [...seen.entries()];
  }, [room.decisions]);
  const decisions = filter === "tous" ? room.decisions : room.decisions.filter((d) => d.type === filter);
  const feed = allFeed ? room.fil : room.fil.slice(0, FEED_PREVIEW);

  return (
    <div className="ads-room">
      <header className="ads-room__head">
        {room.passages.length > 1 ? (
          <select className="ads-room__select" value={String(run.id)} onChange={(e) => onSelectRun(e.target.value)} aria-label="Passage affiché">
            {room.passages.map((p) => (
              <option key={String(p.id)} value={String(p.id)}>
                Passage du {stamp(p.le)} — {RUN_STATUS[p.statut] ?? p.statut}, {eur(p.depenseEur)}
              </option>
            ))}
          </select>
        ) : (
          <strong>Passage du {stamp(run.lanceLe)}</strong>
        )}
        <span className={`ads-badge ${run.enCours ? "ads-badge--test" : run.statut === "a-valider" || run.statut === "termine" ? "ads-badge--ok" : run.statut === "echoue" ? "ads-badge--bad" : ""}`}>{RUN_STATUS[run.statut] ?? run.statut}</span>
      </header>
      <p className="ads-agent__objective">« {run.objectif} »</p>
      {(run.bilan || run.motif) && <p className="ads-agent__last">{[run.bilan, run.motif].filter(Boolean).join(" ")}</p>}

      <div className="ads-room__gauges">
        <Gauge label="Ce passage" spent={run.depenseEur} cap={run.budgetEur} />
        <Gauge label="Agents aujourd'hui" spent={room.jauges.iaJour.depense} cap={room.jauges.iaJour.plafond} />
        <Gauge label="Agents ce mois" spent={room.jauges.iaMois.depense} cap={room.jauges.iaMois.plafond} />
        <Gauge label="Meta" note={room.jauges.meta.publiee ? "Chiffres de diffusion : à venir avec la publication (phase 2)." : "Pas encore publiée."} />
      </div>

      <section className="ads-room__block">
        <h4>Agents</h4>
        <p className="ads-room__hint">
          Il avait sous les yeux {run.lus.consignes} consigne(s) et {run.lus.apprentissages} apprentissage(s) du carnet.
        </p>
        <ul className="ads-room__tree">
          {room.agents.map((a) => {
            const s = AGENT_STATUS[a.status] ?? { label: a.status, dot: "off" };
            return (
              <li key={String(a.id)} style={{ paddingLeft: `${a.depth * 1.25}rem` }} title={a.mission}>
                <span className={`ads-room__dot ads-room__dot--${s.dot}`} aria-label={s.label} title={s.label} />
                <strong>{a.roleLabel}</strong>
                <span className="ads-room__mission">{a.mission}</span>
                <span className="ads-room__cost">
                  {eur(a.spentEur)} / {eur(a.budgetEur)}
                </span>
                {a.error && <span className="ads-room__error">{a.error}</span>}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="ads-room__block">
        <h4>Fil d'activité</h4>
        {feed.length ? (
          <ol className="ads-agent__feed">
            {feed.map((l, i) => (
              <li key={i} className={l.echoue ? "ads-room__failed" : undefined}>
                <time>{time(l.le)}</time> {l.ligne}
              </li>
            ))}
          </ol>
        ) : (
          <p className="ads-room__hint">Rien encore.</p>
        )}
        {room.fil.length > FEED_PREVIEW && (
          <button type="button" className="ads-room__more" onClick={() => setAllFeed((v) => !v)}>
            {allFeed ? "Réduire" : `Voir tout le fil (${room.fil.length} lignes)`}
          </button>
        )}
      </section>

      <section className="ads-room__block">
        <h4>Journal des décisions</h4>
        {kinds.length > 1 && (
          <nav className="an-filters" aria-label="Type de décision">
            <button type="button" className={`an-filter${filter === "tous" ? " an-filter--on" : ""}`} onClick={() => setFilter("tous")}>
              Toutes ({room.decisions.length})
            </button>
            {kinds.map(([k, l]) => (
              <button key={k} type="button" className={`an-filter${filter === k ? " an-filter--on" : ""}`} onClick={() => setFilter(k)}>
                {l} ({room.decisions.filter((d) => d.type === k).length})
              </button>
            ))}
          </nav>
        )}
        {decisions.length ? (
          <ul className="ads-room__decisions">
            {decisions.map((d) => (
              <li key={String(d.id)} className="ads-room__decision">
                <div className="ads-room__decision-head">
                  <time>{time(d.le)}</time>
                  <strong>{d.typeLabel}</strong>
                  <span className={`ads-badge ${DECISION_BADGE[d.etat] ?? ""}`}>{d.etatLabel}</span>
                  {d.par && <span className="ads-room__by">{d.par}</span>}
                </div>
                {d.resume && <p className="ads-room__what">{d.resume}</p>}
                <p className="ads-room__why">{d.pourquoi}</p>
                {d.gardeFou && <p className="ads-room__error">Garde-fou : {d.gardeFou}</p>}
                {d.appuis.length > 0 && (
                  <ul className="ads-room__appuis" aria-label="Appuis">
                    {d.appuis.map((a) => (
                      <li key={a.ref}>
                        <span className="ads-room__ref">{a.ref}</span> {a.text}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="ads-room__hint">Aucune décision pour l'instant.</p>
        )}
      </section>
    </div>
  );
}
