"use client";

import { useConfig, useDocumentInfo, useFormFields } from "@payloadcms/ui";
import { useState } from "react";

import { PREPARATION_STATUSES } from "@/modules/editorial/lib/articles/statuses";
import { ImagePanel } from "@/modules/editorial/admin/ImagePanel";

/**
 * Les décisions de Charlie, en haut de la barre latérale d'une fiche :
 *  - une idée : « Valider » ou « Arrêter » (motif obligatoire) ;
 *  - une idée validée, pas encore en ligne : « Arrêter » ;
 *  - une idée arrêtée : « Remettre en idée » ;
 *  - une reprise proposée sur un article en ligne : « Valider la reprise » ou « Refuser » ;
 *  - un article rédigé (« À relire ») : « Valider le texte » → brouillon WordPress (étape 6) ;
 *  - texte validé : déposer l'image principale → premier créneau (mardi ou jeudi 9 h) ;
 *  - un article mis à jour automatiquement : « Annuler la mise à jour ».
 */

type Action = "valider" | "arreter" | "reprendre" | "reprise-valider" | "reprise-refuser" | "valider-texte" | "annuler-maj";

export function ArticleDecision() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { id } = useDocumentInfo();
  const status = useFormFields(([f]) => f.status?.value) as string | undefined;
  const refreshState = useFormFields(([f]) => f.refreshState?.value) as string | undefined;
  const previousAcf = useFormFields(([f]) => f.previousAcf?.value) as Record<string, unknown> | null | undefined;
  const scheduledAt = useFormFields(([f]) => f.scheduledAt?.value) as string | undefined;
  const imageUrl = useFormFields(([f]) => f.featuredImageUrl?.value) as string | undefined;
  const [asking, setAsking] = useState<Action | null>(null);
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!id) return null;
  const isIdea = status === "idee";
  const canStop = PREPARATION_STATUSES.includes(status as never);
  const refreshPending = refreshState === "proposee";
  const toReview = status === "a-relire";
  const needsImage = status === "image" || status === "programme";
  const canUndo = status === "publie" && Boolean(previousAcf && Object.keys(previousAcf).length);
  if (!isIdea && !canStop && status !== "arretee" && !refreshPending && !canUndo) return null;

  const send = async (action: Action) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`${api}/articles/${id}/decision`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, motif }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(out.error ?? `Erreur ${res.status}`);
      window.location.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  const needsMotif = asking === "arreter" || asking === "reprise-refuser" || asking === "annuler-maj";
  const when = scheduledAt ? new Date(scheduledAt).toLocaleString("fr-FR", { weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <div className="art-decision">
      <strong className="art-decision__title">
        {toReview ? "Article à relire" : needsImage ? (status === "programme" ? `Publication prévue ${when ?? ""}` : "Image principale à créer") : canUndo ? "Mise à jour automatique" : refreshPending && !isIdea ? "Reprise proposée" : status === "arretee" ? "Idée arrêtée" : isIdea ? "Idée à décider" : "Idée en préparation"}
      </strong>
      {toReview && <p className="art-decision__label">Relis l'article (onglet Article). Valider crée le brouillon dans WordPress, relu par toi à la date du jour.</p>}
      {needsImage && <ImagePanel articleId={id} status={status} canUpload image={{ url: imageUrl ?? null }} onDone={() => window.location.reload()} />}
      {needsMotif ? (
        <>
          <label className="art-decision__label" htmlFor="art-motif">
            {asking === "arreter" ? "Pourquoi l'arrêter ? (elle ne sera plus reproposée)" : asking === "annuler-maj" ? "Pourquoi annuler cette mise à jour ? (l'ancienne version revient)" : "Pourquoi refuser cette reprise ?"}
          </label>
          <textarea id="art-motif" className="art-decision__motif" rows={3} value={motif} onChange={(e) => setMotif(e.target.value)} />
          <div className="art-decision__row">
            <button type="button" className="art-btn" disabled={busy || !motif.trim()} onClick={() => send(asking)}>
              Confirmer
            </button>
            <button type="button" className="art-btn art-btn--ghost" disabled={busy} onClick={() => setAsking(null)}>
              Annuler
            </button>
          </div>
        </>
      ) : (
        <div className="art-decision__row">
          {toReview && (
            <button type="button" className="art-btn" disabled={busy} onClick={() => send("valider-texte")}>
              Valider le texte
            </button>
          )}
          {canUndo && (
            <button type="button" className="art-btn art-btn--danger" disabled={busy} onClick={() => setAsking("annuler-maj")}>
              Annuler la mise à jour
            </button>
          )}
          {isIdea && (
            <button type="button" className="art-btn" disabled={busy} onClick={() => send("valider")}>
              Valider l'idée
            </button>
          )}
          {refreshPending && (
            <>
              <button type="button" className="art-btn" disabled={busy} onClick={() => send("reprise-valider")}>
                Valider la reprise
              </button>
              <button type="button" className="art-btn art-btn--ghost" disabled={busy} onClick={() => setAsking("reprise-refuser")}>
                Refuser
              </button>
            </>
          )}
          {canStop && (
            <button type="button" className="art-btn art-btn--danger" disabled={busy} onClick={() => setAsking("arreter")}>
              Arrêter l'idée
            </button>
          )}
          {status === "arretee" && (
            <button type="button" className="art-btn art-btn--ghost" disabled={busy} onClick={() => send("reprendre")}>
              Remettre en idée
            </button>
          )}
        </div>
      )}
      {error && <p className="art-decision__error">{error}</p>}
    </div>
  );
}
