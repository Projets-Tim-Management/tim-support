"use client";

import { useConfig, useListQuery } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import { JOB_STATUSES } from "@/modules/editorial/lib/jobs/statuses";

/**
 * En-tête du tableau des fiches métier : une étiquette par statut (clic = filtre),
 * et la synchronisation avec WordPress (automatique chaque heure, ou à la demande).
 */
export function JobSheetsHeader() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { query, refineListData } = useListQuery();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all(
      JOB_STATUSES.map((s) =>
        fetch(`${api}/job-sheets?limit=0&depth=0&where[status][equals]=${s.value}`, { credentials: "include" })
          .then((r) => (r.ok ? r.json() : { totalDocs: 0 }))
          .then((j: { totalDocs?: number }) => [s.value, j.totalDocs ?? 0] as const),
      ),
    )
      .then((pairs) => setCounts(Object.fromEntries(pairs)))
      .catch(() => setCounts(null));
  }, [api]);
  useEffect(load, [load]);

  const active = ((query?.where ?? {}) as { status?: { equals?: string } }).status?.equals ?? null;
  const filter = (status: string | null) => void refineListData({ where: (status ? { status: { equals: status } } : {}) as never, page: 1 });

  const sync = async (full: boolean) => {
    setBusy(true);
    setMessage("Synchronisation avec WordPress…");
    try {
      const res = await fetch(`${api}/job-sheets/sync${full ? "?full=1" : ""}`, { method: "POST", credentials: "include" });
      const out = (await res.json()) as { read: number; created: number; updated: number; errors: string[]; error?: string };
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      setMessage(`${out.read} fiche(s) lue(s) dans WordPress, ${out.created} ajoutée(s), ${out.updated} mise(s) à jour${out.errors.length ? ` — ${out.errors.length} erreur(s)` : "."}`);
      load();
      void refineListData({ page: 1 });
    } catch (e) {
      setMessage(`Synchronisation impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : null;
  return (
    <div className="art-board">
      <div className="art-board__statuses" role="group" aria-label="Filtrer par statut">
        <button type="button" className={`art-chip${active === null ? " is-active" : ""}`} onClick={() => filter(null)}>
          Toutes <span className="art-chip__count">{total ?? "…"}</span>
        </button>
        {JOB_STATUSES.map((s) => (
          <button
            key={s.value}
            type="button"
            title={s.hint}
            className={`art-chip${active === s.value ? " is-active" : ""}`}
            style={{ color: s.color, background: s.bg, borderColor: active === s.value ? s.color : "transparent" }}
            disabled={!counts?.[s.value] && active !== s.value}
            onClick={() => filter(s.value)}
          >
            {s.label} <span className="art-chip__count">{counts?.[s.value] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="art-board__sync">
        <button type="button" className="art-btn" disabled={busy} onClick={() => sync(false)}>
          Synchroniser
        </button>
        <button type="button" className="art-btn art-btn--ghost" disabled={busy} onClick={() => sync(true)}>
          Tout relire
        </button>
      </div>
      {message && <p className="art-board__message">{message}</p>}
    </div>
  );
}
