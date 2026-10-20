"use client";

import { toast, useDocumentInfo } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import { postAdmin } from "./post-admin";

/**
 * Campagne › Diffusion (plan Publicité, 3b) — publier chez Meta, d'un geste.
 *
 * Avant le clic, tout ce qui empêche de publier est dit (droits du compte, plan
 * de diffusion de l'agent, budget, créas validées avec leurs fichiers). Publier
 * crée tout EN PAUSE ; on regarde les aperçus de Meta, puis « Activer » fait
 * démarrer la diffusion. Une publication qui attend (vidéo en traitement chez
 * Meta) avance seule chaque minute : l'écran se rafraîchit.
 */

type State = {
  status: "en-cours" | "en-pause" | "active" | "echec";
  error: string | null;
  history: { at: string; line: string }[];
  activatedAt: string | null;
};
type Info = { problems: string[]; plan: string | null; metaDailyEur: number | null; creas: { id: number; angle: string }[]; state: State | null };
type Preview = { key: string; label: string; html: string };

const STATUS: Record<State["status"], string> = { "en-cours": "Publication en cours", "en-pause": "Publiée, en pause", active: "En diffusion", echec: "Échec" };
const eur = (n: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} €`);
/** L'adresse de l'iframe d'aperçu que rend Meta : on construit notre propre iframe, sans injecter son HTML. */
const srcOf = (html: string) => /src=["']([^"']+)["']/.exec(html)?.[1]?.replace(/&amp;/g, "&") ?? null;

export function PublishPanel() {
  const { id } = useDocumentInfo();
  const [info, setInfo] = useState<Info | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [previews, setPreviews] = useState<Preview[] | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    const res = await fetch(`/api/admin/ads/campaigns/${id}/publication`, { credentials: "include" });
    const data = (await res.json().catch(() => null)) as Info | { error: string } | null;
    if (data && "problems" in data) setInfo(data);
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  // Une publication qui attend avance seule : on regarde où elle en est.
  useEffect(() => {
    if (info?.state?.status !== "en-cours") return;
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [info?.state?.status, load]);

  if (!id) return <p className="ads-card__empty">Enregistrez la campagne pour la publier.</p>;
  if (!info) return <p className="ads-card__empty">Chargement…</p>;

  const act = async (action: "publier" | "activer" | "pause", done: string) => {
    setBusy(action);
    try {
      await postAdmin(`/api/admin/ads/campaigns/${id}/publication`, { action });
      toast.success(done);
      await load();
    } catch (e) {
      toast.error((e as Error).message);
      await load();
    } finally {
      setBusy(null);
    }
  };
  const showPreviews = async () => {
    setBusy("apercus");
    try {
      const res = await fetch(`/api/admin/ads/campaigns/${id}/publication/apercus`, { credentials: "include" });
      const data = (await res.json()) as { previews?: Preview[]; error?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      setPreviews(data.previews ?? []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const s = info.state;
  const canStart = !s || s.status === "echec";
  return (
    <div className="ads-publish">
      <header className="ads-publish__head">
        <div>
          <strong>{s ? STATUS[s.status] : "Pas encore publiée"}</strong>
          <span>
            {info.plan ?? "Aucun plan de diffusion"} · {eur(info.metaDailyEur)} par jour chez Meta · {info.creas.length} créa(s) validée(s) avec leurs fichiers
          </span>
        </div>
        <div className="ads-publish__actions">
          {canStart && (
            <button
              type="button"
              className="tim-btn tim-btn--primary"
              disabled={busy != null || info.problems.length > 0}
              onClick={() => act("publier", s ? "Publication reprise." : "Publication lancée : tout naît en pause.")}
            >
              {busy === "publier" ? "Publication…" : s ? "Reprendre la publication" : "Publier chez Meta (en pause)"}
            </button>
          )}
          {s?.status === "en-pause" && (
            <>
              <button type="button" className="tim-btn" disabled={busy != null} onClick={showPreviews}>
                {busy === "apercus" ? "…" : "Voir les aperçus"}
              </button>
              <button
                type="button"
                className="tim-btn tim-btn--primary"
                disabled={busy != null}
                onClick={() => {
                  if (window.confirm(`Activer la diffusion ? Meta commencera à dépenser jusqu'à ${eur(info.metaDailyEur)} par jour.`)) void act("activer", "Diffusion activée.");
                }}
              >
                {busy === "activer" ? "…" : s.activatedAt ? "Réactiver" : "Activer la diffusion"}
              </button>
            </>
          )}
          {s?.status === "active" && (
            <button type="button" className="tim-btn" disabled={busy != null} onClick={() => act("pause", "Campagne mise en pause chez Meta.")}>
              {busy === "pause" ? "…" : "Mettre en pause"}
            </button>
          )}
        </div>
      </header>

      {canStart && info.problems.length > 0 && (
        <ul className="ads-publish__problems">
          {info.problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      {s?.error && <p className="ads-publish__error">{s.error}</p>}
      {canStart && info.creas.length > 0 && (
        <p className="ads-publish__creas">
          Créas publiées : {info.creas.map((c) => `C${c.id} « ${c.angle} »`).join(", ")}.
        </p>
      )}

      {previews && (
        <div className="ads-publish__previews">
          {previews.length === 0 && <p className="ads-card__empty">Aucun aperçu rendu par Meta.</p>}
          {previews.map((p) => {
            const src = srcOf(p.html);
            return (
              <figure key={p.key}>
                {src ? <iframe src={src} title={p.label} loading="lazy" sandbox="allow-scripts allow-same-origin allow-popups" /> : <p className="ads-card__empty">{p.label} : aperçu illisible.</p>}
                <figcaption>{p.label}</figcaption>
              </figure>
            );
          })}
        </div>
      )}

      {s && s.history.length > 0 && (
        <ol className="ads-publish__history">
          {[...s.history].reverse().slice(0, 12).map((h, i) => (
            <li key={`${h.at}-${i}`}>
              <time>{new Date(h.at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</time> {h.line}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
