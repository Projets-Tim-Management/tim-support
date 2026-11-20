"use client";

import { useConfig, useListQuery } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

/**
 * En-tête des requêtes suivies : un filtre par origine (clic = filtre), les chiffres clés,
 * et les relevés à la demande (sinon automatiques : chaque heure et le 1er lundi du mois).
 */
const SOURCES = [
  { value: "article", label: "Articles" },
  { value: "page", label: "Pages du site" },
  { value: "opportunite", label: "Opportunités" },
  { value: "classee", label: "Où l'on est classé" },
  { value: "manuel", label: "Ajoutées à la main" },
  { value: "agent", label: "Proposées par un agent" },
];

export function SeoKeywordsHeader() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { query, refineListData } = useListQuery();
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [stats, setStats] = useState<{ tracked: number; top10: number; ai: number; cited: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const count = useCallback((where: string) => fetch(`${api}/seo-keywords?limit=0&depth=0&${where}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : { totalDocs: 0 })).then((j: { totalDocs?: number }) => j.totalDocs ?? 0), [api]);
  const load = useCallback(() => {
    Promise.all(SOURCES.map((s) => count(`where[source][equals]=${s.value}`).then((n) => [s.value, n] as const)))
      .then((pairs) => setCounts(Object.fromEntries(pairs)))
      .catch(() => setCounts(null));
    Promise.all([
      count("where[tracked][equals]=true"),
      count("where[tracked][equals]=true&where[position][less_than_equal]=10"),
      count("where[aiOverview][equals]=true"),
      count("where[aiCited][equals]=true"),
    ])
      .then(([tracked, top10, ai, cited]) => setStats({ tracked, top10, ai, cited }))
      .catch(() => setStats(null));
  }, [count]);
  useEffect(load, [load]);

  const active = ((query?.where ?? {}) as { source?: { equals?: string } }).source?.equals ?? null;
  const filter = (source: string | null) => void refineListData({ where: (source ? { source: { equals: source } } : {}) as never, page: 1 });

  const run = async (what: "track" | "monthly") => {
    setBusy(true);
    setMessage(what === "track" ? "Relevé de 10 requêtes dues…" : "Analyse du mois (nos requêtes, nos concurrents, les opportunités)…");
    try {
      const res = await fetch(`${api}/seo-keywords/${what}`, { method: "POST", credentials: "include" });
      const out = (await res.json()) as Record<string, unknown> & { error?: string; errors?: string[] };
      if (!res.ok || out.error) throw new Error(out.error ?? `Erreur ${res.status}`);
      setMessage(
        what === "track"
          ? `${String(out.tracked ?? 0)} requête(s) relevée(s)${out.errors?.length ? ` — ${out.errors.length} erreur(s) : ${out.errors[0]}` : "."}`
          : out.skipped
            ? String(out.skipped)
            : `${String(out.ourKeywords)} requêtes où tim-management.co est classé ; ${String(out.pages)} page(s) clé(s) ; ${String(out.opportunities)} opportunité(s) chez ${(out.competitors as string[]).length} concurrent(s). Coût : ${String(out.costUsd)} $.`,
      );
      load();
      void refineListData({ page: 1 });
    } catch (e) {
      setMessage(`Relevé impossible : ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="art-board">
      {stats && (
        <p className="art-board__message">
          {stats.tracked} requêtes suivies · {stats.top10} dans le top 10 · réponse IA de Google sur {stats.ai} · TIM Management cité dans {stats.cited}
        </p>
      )}
      <div className="art-board__statuses" role="group" aria-label="Filtrer par origine">
        <button type="button" className={`art-chip${active === null ? " is-active" : ""}`} onClick={() => filter(null)}>
          Toutes
        </button>
        {SOURCES.map((s) => (
          <button key={s.value} type="button" className={`art-chip${active === s.value ? " is-active" : ""}`} onClick={() => filter(s.value)}>
            {s.label} {counts ? `(${counts[s.value] ?? 0})` : ""}
          </button>
        ))}
      </div>
      <div className="art-board__sync">
        <button type="button" className="art-btn art-btn--ghost" disabled={busy} onClick={() => run("track")} title="Automatique chaque heure (chaque requête une fois par semaine). ≈ 0,06 $ pour 10 requêtes.">
          Relever 10 positions maintenant
        </button>
        <button type="button" className="art-btn art-btn--ghost" disabled={busy} onClick={() => run("monthly")} title="Automatique le 1er lundi du mois. ≈ 0,40 $.">
          Relancer l'analyse du mois
        </button>
      </div>
      {message && <p className="art-board__message">{message}</p>}
    </div>
  );
}
