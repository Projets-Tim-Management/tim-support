"use client";

import { useAuth } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isPartnerUtilisateur } from "@/core/access";

import MissionRunDrawer, { type RunnableMission } from "./MissionRunDrawer";

/**
 * Catalogue de missions présenté au PARTENAIRE-UTILISATEUR (rendu via
 * beforeListTable de la collection `missions`). Il parcourt les missions et
 * soumet une preuve → crée une mission-submission « en attente » (le crédit des
 * points se fait à la validation par un admin). Pour les autres rôles, ce
 * composant ne rend rien (l'admin garde le tableau standard).
 *
 * Présentation en LISTE LARGE : chaque mission occupe toute la largeur (visuel,
 * titre, extrait des instructions, badges, points, action) et se déplie sur place
 * pour l'envoi de la preuve. Une grille de cartes étroites tronquait les titres
 * et n'affichait aucune consigne — ici l'essentiel se lit sans cliquer.
 */

interface Mission extends RunnableMission {
  url?: string;
  repeatable?: boolean;
  instructions?: unknown;
  logo?: { url?: string } | number | null;
}
interface Submission {
  id: number | string;
  mission?: number | string | { id: number | string };
  status?: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente de validation",
  approved: "Validée",
  rejected: "Refusée",
};

const logoUrl = (m: Mission): string | null =>
  m.logo && typeof m.logo === "object" ? (m.logo.url ?? null) : null;

/** Extrait lisible des instructions (richText Lexical) — 180 caractères max. */
function excerpt(instructions: unknown, max = 180): string {
  const out: string[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return;
    const n = node as { text?: unknown; children?: unknown };
    if (typeof n.text === "string") out.push(n.text);
    if (Array.isArray(n.children)) n.children.forEach(walk);
  };
  walk((instructions as { root?: unknown })?.root ?? instructions);
  const text = out.join(" ").replace(/\s+/g, " ").trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export default function MissionsCatalog() {
  const { user } = useAuth();
  const isUtil = isPartnerUtilisateur(user);

  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  /** Mission en cours de réalisation (drawer pas-à-pas). */
  const [running, setRunning] = useState<Mission | null>(null);

  // Le catalogue remplace le tableau standard : on masque ce dernier pour ce rôle.
  useEffect(() => {
    if (!isUtil) return;
    document.body.classList.add("tim-catalog-mode");
    return () => document.body.classList.remove("tim-catalog-mode");
  }, [isUtil]);

  const reloadSubs = useCallback(async () => {
    const r = await fetch(`/payload-api/mission-submissions?limit=300&depth=0`, {
      credentials: "include",
    }).then((res) => res.json());
    setSubs((r?.docs as Submission[]) ?? []);
  }, []);

  useEffect(() => {
    if (!isUtil) return;
    let cancelled = false;
    (async () => {
      try {
        const [m, s] = await Promise.all([
          fetch(`/payload-api/missions?limit=200&depth=1&sort=order`, { credentials: "include" }).then((r) =>
            r.json(),
          ),
          fetch(`/payload-api/mission-submissions?limit=300&depth=0`, { credentials: "include" }).then((r) =>
            r.json(),
          ),
        ]);
        if (cancelled) return;
        setMissions((m?.docs as Mission[]) ?? []);
        setSubs((s?.docs as Submission[]) ?? []);
      } catch {
        if (!cancelled) setMissions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isUtil]);

  const statusByMission = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of subs) {
      const mid = typeof s.mission === "object" && s.mission ? s.mission.id : s.mission;
      if (mid != null && !map.has(String(mid))) map.set(String(mid), s.status ?? "pending");
    }
    return map;
  }, [subs]);

  // Progression : ce qui est déjà gagné et ce qui reste à prendre. Un catalogue
  // sans repère donne peu envie de s'y remettre.
  const progress = useMemo(() => {
    const list = missions ?? [];
    let earned = 0;
    let available = 0;
    let done = 0;
    for (const m of list) {
      const status = statusByMission.get(String(m.id));
      const pts = Number(m.points) || 0;
      if (status === "approved") {
        earned += pts;
        done += 1;
      } else if (!status) {
        available += pts;
      }
    }
    return { earned, available, done, total: list.length };
  }, [missions, statusByMission]);

  if (!isUtil) return null;

  return (
    <div className="tim-catalog">
      <header className="tim-catalog__head">
        <h1 className="tim-catalog__title">Missions à réaliser</h1>
        <p className="tim-catalog__sub">
          Réalisez une mission et envoyez votre preuve pour gagner des points.
        </p>
      </header>

      {missions !== null && missions.length > 0 && (
        <div className="tim-mprogress">
          <div className="tim-mprogress__item">
            <span className="tim-mprogress__value">{progress.earned}</span>
            <span className="tim-mprogress__label">points gagnés</span>
          </div>
          <div className="tim-mprogress__item">
            <span className="tim-mprogress__value">
              {progress.done}
              <span className="tim-mprogress__of">/{progress.total}</span>
            </span>
            <span className="tim-mprogress__label">missions validées</span>
          </div>
          <div className="tim-mprogress__item tim-mprogress__item--accent">
            <span className="tim-mprogress__value">{progress.available}</span>
            <span className="tim-mprogress__label">points encore à prendre</span>
          </div>
        </div>
      )}

      {missions === null ? (
        <p className="tim-catalog__empty">Chargement…</p>
      ) : missions.length === 0 ? (
        <p className="tim-catalog__empty">Aucune mission disponible pour le moment.</p>
      ) : (
        <ul className="tim-missions">
          {missions.map((m) => {
            const status = statusByMission.get(String(m.id));
            const url = logoUrl(m);
            const desc = excerpt(m.instructions);
            const title = m.title || "Mission";

            // Une mission déjà envoyée n'est plus actionnable : la ligne reste
            // lisible mais n'ouvre rien.
            const openable = !status;

            return (
              <li
                key={String(m.id)}
                className={`tim-mission${status ? ` is-${status}` : ""}${
                  openable ? " is-openable" : ""
                }`}
                {...(openable
                  ? {
                      role: "button" as const,
                      tabIndex: 0,
                      // Toute la ligne ouvre le drawer — le bouton « Réaliser »
                      // reste le repère visuel de l'action. On laisse passer les
                      // liens (« En savoir plus »), qui ont leur propre destination.
                      onClick: (e: React.MouseEvent) => {
                        if ((e.target as HTMLElement).closest("a")) return;
                        setRunning(m);
                      },
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setRunning(m);
                        }
                      },
                    }
                  : {})}
              >
                <div className="tim-mission__row">
                  {/* Visuel : le logo de la mission, sinon une pastille au monogramme
                      (initiale du titre) — pas de pictogramme générique. */}
                  <span className="tim-mission__visual" aria-hidden>
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" />
                    ) : (
                      <span className="tim-mission__monogram">{title.trim().charAt(0).toUpperCase()}</span>
                    )}
                  </span>

                  <div className="tim-mission__body">
                    <h2 className="tim-mission__title">{title}</h2>
                    {desc && <p className="tim-mission__desc">{desc}</p>}
                    <div className="tim-mission__meta">
                      <span className="tim-tag">
                        {m.type === "manuelle" ? "Validation par TIM" : "Preuve à envoyer"}
                      </span>
                      {m.repeatable && <span className="tim-tag">Répétable</span>}
                      {m.url && (
                        <a className="tim-mission__link" href={m.url} target="_blank" rel="noreferrer">
                          En savoir plus ↗
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="tim-mission__aside">
                    <span className="tim-mission__points">
                      +{m.points ?? 0}
                      <small>pts</small>
                    </span>
                    {status ? (
                      <span className={`tim-mission__status is-${status}`}>
                        {STATUS_LABEL[status] ?? status}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="tim-mission__cta"
                        onClick={() => setRunning(m)}
                      >
                        Réaliser
                      </button>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {/* Réalisation pas-à-pas : étapes puis envoi de la preuve. */}
      {running && (
        <MissionRunDrawer
          mission={running}
          onClose={() => setRunning(null)}
          onSubmitted={reloadSubs}
        />
      )}
    </div>
  );
}
