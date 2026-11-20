"use client";

import { useConfig, useListQuery } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import { ARTICLE_STATUSES } from "@/modules/editorial/lib/articles/statuses";

/**
 * En-tête du tableau des articles (beforeListTable) :
 *  - une étiquette par statut, de la même couleur que dans le tableau, avec son
 *    nombre d'articles ; un clic filtre la liste (le filtre vit dans l'URL) ;
 *  - la synchronisation avec WordPress : automatique chaque heure, et à la
 *    demande (« Synchroniser »), ou en relisant tout (« Tout relire ») ;
 *  - les chiffres (clics Google, visites GA4) : chaque lundi, et à la demande.
 */

type Stats = { byStatus: Record<string, number> };
type SyncOut = { read: number; created: number; updated: number; unchanged: number; errors: string[]; full: boolean; error?: string };

export function ArticlesBoardHeader() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { query, refineListData } = useListQuery();
  const [stats, setStats] = useState<Stats | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch(`${api}/articles/stats`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s) => setStats(s))
      .catch(() => setStats(null));
  }, [api]);
  useEffect(load, [load]);

  const where = (query?.where ?? {}) as { status?: { equals?: string } };
  const active = where.status?.equals ?? null;
  const filter = (status: string | null) => void refineListData({ where: (status ? { status: { equals: status } } : {}) as never, page: 1 });

  const sync = async (full: boolean) => {
    setBusy(true);
    setMessage(full ? "Relecture de tous les articles de WordPress…" : "Synchronisation avec WordPress…");
    try {
      const res = await fetch(`${api}/articles/sync${full ? "?full=1" : ""}`, { method: "POST", credentials: "include" });
      const out = (await res.json()) as SyncOut;
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      const parts = [`${out.read} article(s) lu(s) dans WordPress`, `${out.created} ajouté(s)`, `${out.updated} mis à jour`, `${out.unchanged} inchangé(s)`];
      setMessage(parts.join(", ") + (out.errors.length ? ` — ${out.errors.length} erreur(s) : ${out.errors.slice(0, 3).join(" ; ")}` : "."));
      load();
      void refineListData({ page: 1 });
    } catch (err) {
      setMessage(`Synchronisation impossible : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const refreshStats = async () => {
    setBusy(true);
    setMessage("Lecture de Search Console et de GA4…");
    try {
      const res = await fetch(`${api}/articles/stats/refresh`, { method: "POST", credentials: "include" });
      const out = (await res.json()) as { updated: number; withClicks: number; errors: string[]; period: { from: string; to: string }; error?: string };
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      setMessage(`Chiffres à jour pour ${out.updated} article(s), dont ${out.withClicks} avec des clics Google (du ${out.period.from} au ${out.period.to}).` + (out.errors.length ? ` ${out.errors.slice(0, 2).join(" ; ")}` : ""));
      void refineListData({ page: 1 });
    } catch (err) {
      setMessage(`Chiffres indisponibles : ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setBusy(false);
    }
  };

  const total = stats ? Object.values(stats.byStatus).reduce((a, b) => a + b, 0) : null;

  return (
    <div className="art-board">
      <div className="art-board__statuses" role="group" aria-label="Filtrer par statut">
        <button type="button" className={`art-chip${active === null ? " is-active" : ""}`} onClick={() => filter(null)}>
          Tous <span className="art-chip__count">{total ?? "…"}</span>
        </button>
        {ARTICLE_STATUSES.map((s) => {
          const n = stats?.byStatus[s.value] ?? 0;
          return (
            <button
              key={s.value}
              type="button"
              title={s.hint}
              className={`art-chip${active === s.value ? " is-active" : ""}`}
              style={{ color: s.color, background: s.bg, borderColor: active === s.value ? s.color : "transparent" }}
              disabled={n === 0 && active !== s.value}
              onClick={() => filter(s.value)}
            >
              {s.label} <span className="art-chip__count">{n}</span>
            </button>
          );
        })}
      </div>
      <div className="art-board__sync">
        <button type="button" className="art-btn" disabled={busy} onClick={() => sync(false)}>
          Synchroniser
        </button>
        <button type="button" className="art-btn art-btn--ghost" disabled={busy} onClick={() => sync(true)} title="Relit tous les articles de WordPress, même ceux qui n'ont pas changé.">
          Tout relire
        </button>
        <button
          type="button"
          className="art-btn art-btn--ghost"
          disabled={busy}
          title="Recalcule les notes SEO / GEO de tous les articles et fiches avec la version en vigueur des règles. Aucun appel extérieur."
          onClick={async () => {
            setBusy(true);
            try {
              const res = await fetch(`${api}/articles/score`, { method: "POST", credentials: "include" });
              const out = (await res.json()) as { version: number; articles: number; jobs: number; changed: number; error?: string };
              if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
              setMessage(`Notes recalculées selon les règles v${out.version} : ${out.changed} note(s) changée(s) sur ${out.articles} article(s) et ${out.jobs} fiche(s).`);
              void refineListData({ page: 1 });
            } catch (e) {
              setMessage(`Recalcul impossible : ${e instanceof Error ? e.message : String(e)}`);
            } finally {
              setBusy(false);
            }
          }}
        >
          Recalculer les notes
        </button>
        <button type="button" className="art-btn art-btn--ghost" disabled={busy} onClick={refreshStats} title="Clics Google (Search Console) et visites (GA4) de chaque article. Automatique chaque lundi.">
          Rafraîchir les chiffres
        </button>
      </div>
      {message && <p className="art-board__message">{message}</p>}
    </div>
  );
}
