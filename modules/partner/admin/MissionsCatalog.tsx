"use client";

import { useAuth } from "@payloadcms/ui";
import { useCallback, useEffect, useMemo, useState } from "react";

import { isPartnerUtilisateur } from "@/core/access";

/**
 * Catalogue de missions présenté au PARTENAIRE-UTILISATEUR (rendu via
 * beforeListTable de la collection `missions`). Il parcourt les missions et
 * soumet une preuve → crée une mission-submission « en attente » (le crédit des
 * points se fait à la validation par un admin). Pour les autres rôles, ce
 * composant ne rend rien (l'admin garde le tableau standard).
 */

interface Mission {
  id: number | string;
  title?: string;
  points?: number;
  type?: "preuve" | "manuelle";
  url?: string;
  logo?: { url?: string } | number | null;
}
interface Submission {
  id: number | string;
  mission?: number | string | { id: number | string };
  status?: string;
}

const STATUS_LABEL: Record<string, string> = {
  pending: "En attente de validation",
  approved: "Validée ✓",
  rejected: "Refusée",
};

const logoUrl = (m: Mission): string | null =>
  m.logo && typeof m.logo === "object" ? (m.logo.url ?? null) : null;

export default function MissionsCatalog() {
  const { user } = useAuth();
  const isUtil = isPartnerUtilisateur(user);

  const [missions, setMissions] = useState<Mission[] | null>(null);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [openId, setOpenId] = useState<number | string | null>(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const openForm = (id: number | string) => {
    setOpenId(id);
    setNote("");
    setFile(null);
    setError(null);
  };

  const submit = async (m: Mission) => {
    setBusy(true);
    setError(null);
    try {
      let attachments: (number | string)[] = [];
      if (file) {
        const fd = new FormData();
        fd.append("file", file);
        const up = await fetch(`/payload-api/media`, {
          method: "POST",
          body: fd,
          credentials: "include",
        }).then((r) => r.json());
        const mediaId = up?.doc?.id;
        if (!mediaId) throw new Error("upload");
        attachments = [mediaId];
      }
      const res = await fetch(`/payload-api/mission-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // partner est forcé côté serveur (enforcePartnerField) ; inutile de l'envoyer.
        body: JSON.stringify({ mission: m.id, note: note || undefined, attachments }),
      });
      if (!res.ok) throw new Error("submit");
      await reloadSubs();
      setOpenId(null);
    } catch {
      setError("Échec de l'envoi. Vérifiez la pièce jointe et réessayez.");
    } finally {
      setBusy(false);
    }
  };

  if (!isUtil) return null;

  return (
    <div className="tim-catalog">
      <header className="tim-catalog__head">
        <h1 className="tim-catalog__title">Missions à réaliser</h1>
        <p className="tim-catalog__sub">Réalisez une mission et envoyez votre preuve pour gagner des points.</p>
      </header>

      {missions === null ? (
        <p className="tim-catalog__empty">Chargement…</p>
      ) : missions.length === 0 ? (
        <p className="tim-catalog__empty">Aucune mission disponible pour le moment.</p>
      ) : (
        <div className="tim-catalog__grid">
          {missions.map((m) => {
            const status = statusByMission.get(String(m.id));
            const isOpen = openId === m.id;
            const url = logoUrl(m);
            return (
              <article key={String(m.id)} className={`tim-mcard${status ? " is-done" : ""}`}>
                <div className="tim-mcard__top">
                  <span className="tim-mcard__logo" aria-hidden>
                    {url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={url} alt="" />
                    ) : (
                      "🎯"
                    )}
                  </span>
                  <span className="tim-mcard__points">+{m.points ?? 0} pts</span>
                </div>
                <h2 className="tim-mcard__title">{m.title || "Mission"}</h2>

                {status ? (
                  <div className={`tim-mcard__status is-${status}`}>{STATUS_LABEL[status] ?? status}</div>
                ) : isOpen ? (
                  <div className="tim-mcard__form">
                    <textarea
                      className="tim-mcard__note"
                      placeholder="Un mot sur votre réalisation (optionnel)…"
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                    />
                    {m.type === "preuve" && (
                      <label className="tim-mcard__file">
                        <input
                          type="file"
                          accept="image/*"
                          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                        />
                        <span>{file ? file.name : "Ajouter une preuve (image)"}</span>
                      </label>
                    )}
                    {error && <p className="tim-mcard__error">{error}</p>}
                    <div className="tim-mcard__actions">
                      <button
                        type="button"
                        className="tim-mcard__btn tim-mcard__btn--ghost"
                        onClick={() => setOpenId(null)}
                        disabled={busy}
                      >
                        Annuler
                      </button>
                      <button
                        type="button"
                        className="tim-mcard__btn"
                        onClick={() => void submit(m)}
                        disabled={busy}
                      >
                        {busy ? "Envoi…" : "Envoyer la preuve"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="tim-mcard__foot">
                    {m.url && (
                      <a className="tim-mcard__link" href={m.url} target="_blank" rel="noreferrer">
                        En savoir plus
                      </a>
                    )}
                    <button type="button" className="tim-mcard__btn" onClick={() => openForm(m.id)}>
                      Réaliser
                    </button>
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
