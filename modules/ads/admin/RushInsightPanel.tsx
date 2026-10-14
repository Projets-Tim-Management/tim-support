"use client";

import { toast, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useState } from "react";

/**
 * Ce que l'IA voit d'un rush converti (plan Publicité, §9 sexies, D1c) : les
 * images clés, avec pour chacune ce qu'on y voit et où regarder, puis la
 * description proposée. Trois gestes, qui agissent au clic : valider (les
 * agents la liront), écarter, reproposer (après avoir corrigé « Ce qu'on
 * voit », par exemple).
 */

type Keyframe = { atSec: number; url: string };
type Plan = { a_sec: number; ce_qu_on_voit: string; zones_importantes: string };
const STATUS: Record<string, string> = { proposee: "Proposée — à valider", validee: "Validée : les agents la lisent", ecartee: "Écartée" };

export function RushInsightPanel() {
  const { id } = useDocumentInfo();
  const ready = useFormFields(([f]) => f?.["processing.status"]?.value === "pret");
  const keyframes = useFormFields(([f]) => (f?.["working.keyframes"]?.value as Keyframe[] | undefined) ?? []);
  const proposal = useFormFields(([f]) => f?.["ai.proposal"]?.value as string | undefined);
  const timeline = useFormFields(([f]) => (f?.["ai.timeline"]?.value as Plan[] | undefined) ?? []);
  const status = useFormFields(([f]) => f?.["ai.status"]?.value as string | undefined);
  const [busy, setBusy] = useState<string | null>(null);

  if (!id || !ready) return null;

  const act = async (action: string, done: string) => {
    setBusy(action);
    try {
      const res = await fetch(`/api/admin/ads/rushes/${encodeURIComponent(String(id))}/description`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || String(res.status));
      toast.success(done);
      window.location.reload();
    } catch (e) {
      toast.error((e as Error).message);
      setBusy(null);
    }
  };

  const planAt = (t: number) => timeline.find((p) => Math.abs(p.a_sec - t) < 0.6);

  return (
    <section className="ads-rush-insight">
      <header className="ads-rush-insight__head">
        <strong>Ce que voient les agents</strong>
        {status && <span className={`ads-rush-insight__status ads-rush-insight__status--${status}`}>{STATUS[status] ?? status}</span>}
      </header>
      <ol className="ads-rush-insight__frames">
        {keyframes.map((k) => {
          const p = planAt(k.atSec);
          return (
            <li key={k.url + k.atSec}>
              {/* eslint-disable-next-line @next/next/no-img-element -- image clé du stockage, pas une image du site. */}
              <img src={k.url} alt={p?.ce_qu_on_voit ?? `Image à ${k.atSec} s`} loading="lazy" />
              <time>{k.atSec.toLocaleString("fr-FR")} s</time>
              {p && (
                <span>
                  {p.ce_qu_on_voit}
                  {p.zones_importantes ? <em> — {p.zones_importantes}</em> : null}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {proposal ? (
        <p className="ads-rush-insight__proposal">{proposal}</p>
      ) : (
        <p className="ads-rush-insight__empty">Pas encore de description détaillée.</p>
      )}
      <div className="ads-rush-insight__actions">
        {proposal && status !== "validee" && (
          <button type="button" className="tim-btn tim-btn--primary" disabled={busy != null} onClick={() => act("valider", "Description validée : les agents la liront.")}>
            {busy === "valider" ? "…" : "Valider la description"}
          </button>
        )}
        {proposal && status !== "ecartee" && (
          <button type="button" className="tim-btn" disabled={busy != null} onClick={() => act("ecarter", "Description écartée.")}>
            {busy === "ecarter" ? "…" : "Écarter"}
          </button>
        )}
        <button type="button" className="tim-btn" disabled={busy != null} onClick={() => act("reproposer", "Nouvelle description proposée.")}>
          {busy === "reproposer" ? "L'IA regarde…" : proposal ? "Reproposer" : "Proposer une description"}
        </button>
      </div>
      <p className="ads-rush-insight__hint">Corrigez d&apos;abord « Ce qu&apos;on voit » et enregistrez si l&apos;IA se trompe de sujet : elle s&apos;en sert pour reproposer.</p>
    </section>
  );
}
