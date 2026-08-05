"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import UploadZone from "@/admin/fields/UploadZone";

/**
 * Drawer « Réaliser une mission » — guide le partenaire-utilisateur étape par
 * étape (1, 2, 3…) jusqu'à l'envoi de la preuve.
 *
 * Parcours : une étape à la fois (bouton « Suivant »), avec la liste complète à
 * gauche pour situer l'avancement — les étapes franchies sont cochées, on peut y
 * revenir d'un clic. La dernière carte est l'envoi de la preuve. Une mission sans
 * étape ouvre directement sur cet envoi : rien d'artificiel à parcourir.
 */

export interface MissionStep {
  title?: string;
  detail?: string;
  url?: string;
}
export interface RunnableMission {
  id: number | string;
  title?: string;
  points?: number;
  type?: "preuve" | "manuelle";
  proofHint?: string;
  steps?: MissionStep[];
}

export default function MissionRunDrawer({
  mission,
  onClose,
  onSubmitted,
}: {
  mission: RunnableMission;
  onClose: () => void;
  onSubmitted: () => void | Promise<void>;
}) {
  const steps = (mission.steps ?? []).filter((s) => s?.title);
  /** Index courant ; `steps.length` = écran d'envoi de la preuve. */
  const [current, setCurrent] = useState(0);
  const [note, setNote] = useState("");
  /** Preuve DÉJÀ envoyée à `media` : on garde l'id et l'aperçu. */
  const [proof, setProof] = useState<{ id: string | number; url?: string } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isProof = current >= steps.length;
  const needsFile = mission.type === "preuve";
  /** Progression : étapes franchies + l'envoi, sur le total des écrans. */
  const totalScreens = steps.length + 1;
  const progressPct = Math.round(((current + 1) / totalScreens) * 100);

  /** Envoi immédiat du fichier : l'aperçu confirme ce qui partira. */
  const upload = async (files: File[]) => {
    const f = files[0];
    if (!f) return;
    setUploading(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const up = await fetch(`/payload-api/media`, {
        method: "POST",
        body: fd,
        credentials: "include",
      }).then((r) => r.json());
      if (!up?.doc?.id) throw new Error("upload");
      setProof({ id: up.doc.id, url: up.doc.url });
    } catch {
      setError("L'image n'a pas pu être envoyée. Réessayez.");
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    document.addEventListener("keydown", onKey);
    // Le fond ne défile pas pendant que le drawer est ouvert.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previous;
    };
  }, [busy, onClose]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      // L'image est déjà dans `media` (envoyée au dépôt) : il ne reste que le lien.
      const attachments: (number | string)[] = proof ? [proof.id] : [];
      const res = await fetch(`/payload-api/mission-submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        // partner est forcé côté serveur (enforcePartnerField) ; inutile de l'envoyer.
        body: JSON.stringify({ mission: mission.id, note: note || undefined, attachments }),
      });
      if (!res.ok) throw new Error("submit");
      await onSubmitted();
      onClose();
    } catch {
      setError("Échec de l'envoi. Vérifiez la pièce jointe et réessayez.");
    } finally {
      setBusy(false);
    }
  };

  const step = steps[current];
  if (typeof document === "undefined") return null;

  /**
   * Rendu par PORTAIL sur <body> : le catalogue vit dans le contenu de la vue de
   * liste, dont un ancêtre positionné crée un contexte d'empilement. Un z-index
   * élevé n'en sort pas — le drawer passait sous la barre du haut (z-index 30
   * dans SON contexte à elle). Le portail replace l'overlay à la racine, où son
   * z-index compte enfin face à l'en-tête et au menu.
   */
  return createPortal(
    <div
      className="tim-mdrawer"
      role="dialog"
      aria-modal="true"
      aria-label={`Réaliser : ${mission.title ?? "mission"}`}
      onClick={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <div className="tim-mdrawer__panel">
        <header className="tim-mdrawer__head">
          <div>
            <p className="tim-mdrawer__eyebrow">Mission · +{mission.points ?? 0} pts</p>
            <h2 className="tim-mdrawer__title">{mission.title ?? "Mission"}</h2>
          </div>
          <button
            type="button"
            className="tim-mdrawer__close"
            onClick={onClose}
            disabled={busy}
            aria-label="Fermer"
          >
            ✕
          </button>
        </header>

        {/* Avancement : combien d'écrans franchis sur le parcours complet. */}
        <div
          className="tim-mdrawer__progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressPct}
          aria-label="Avancement de la mission"
        >
          <span className="tim-mdrawer__progress-fill" style={{ width: `${progressPct}%` }} />
        </div>

        <div className="tim-mdrawer__body">
          {/* Checklist : où j'en suis, ce qu'il reste. Cliquable vers une étape
              déjà franchie pour la relire sans perdre sa saisie. */}
          {steps.length > 0 && (
            <ol className="tim-msteps">
              {steps.map((s, i) => (
                <li
                  key={i}
                  className={`tim-msteps__item${i === current ? " is-current" : ""}${
                    i < current ? " is-done" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="tim-msteps__btn"
                    onClick={() => setCurrent(i)}
                    disabled={i > current}
                  >
                    <span className="tim-msteps__num">{i < current ? "✓" : i + 1}</span>
                    <span className="tim-msteps__label">{s.title}</span>
                  </button>
                </li>
              ))}
              <li className={`tim-msteps__item${isProof ? " is-current" : ""}`}>
                <button
                  type="button"
                  className="tim-msteps__btn"
                  onClick={() => setCurrent(steps.length)}
                  // On n'atteint l'envoi qu'après avoir parcouru les étapes.
                  disabled={current < steps.length}
                >
                  <span className="tim-msteps__num">{steps.length + 1}</span>
                  <span className="tim-msteps__label">Envoyer la preuve</span>
                </button>
              </li>
            </ol>
          )}

          <div className="tim-mdrawer__stage">
            {!isProof && step ? (
              <>
                <p className="tim-mdrawer__step-count">
                  Étape {current + 1} sur {steps.length}
                </p>
                <h3 className="tim-mdrawer__step-title">{step.title}</h3>
                {step.detail && <p className="tim-mdrawer__step-detail">{step.detail}</p>}
                {step.url && (
                  <a
                    className="tim-mdrawer__step-link"
                    href={step.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Ouvrir le lien de cette étape ↗
                  </a>
                )}
              </>
            ) : (
              <>
                <p className="tim-mdrawer__step-count">Dernière étape</p>
                <h3 className="tim-mdrawer__step-title">Envoyer la preuve</h3>
                <p className="tim-mdrawer__step-detail">
                  {mission.proofHint ||
                    (needsFile
                      ? "Ajoutez une capture qui montre la mission réalisée."
                      : "Votre demande sera vérifiée par l'équipe TIM.")}
                </p>
                <textarea
                  className="tim-mission__note"
                  placeholder="Un mot sur votre réalisation (optionnel)…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                />
                {needsFile &&
                  (proof ? (
                    <div className="direct-upload__grid direct-upload__grid--single">
                      <div className="direct-upload__thumb">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src={proof.url} alt="" />
                        <button
                          type="button"
                          className="direct-upload__remove"
                          onClick={() => setProof(null)}
                          aria-label="Retirer l'image"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  ) : (
                    <UploadZone
                      onFiles={(files) => void upload(files)}
                      noun="votre preuve"
                      busy={uploading}
                      disabled={busy}
                    />
                  ))}
                {error && <p className="tim-mission__error">{error}</p>}
              </>
            )}
          </div>
        </div>

        <footer className="tim-mdrawer__foot">
          {current > 0 ? (
            <button
              type="button"
              className="tim-mission__cta tim-mission__cta--ghost"
              onClick={() => setCurrent((c) => c - 1)}
              disabled={busy}
            >
              Précédent
            </button>
          ) : (
            <button
              type="button"
              className="tim-mission__cta tim-mission__cta--ghost"
              onClick={onClose}
              disabled={busy}
            >
              Annuler
            </button>
          )}
          {isProof ? (
            <button
              type="button"
              className="tim-mission__cta"
              onClick={() => void submit()}
              // Bloqué pendant l'envoi de l'image : sans ça, valider trop vite
              // enverrait la mission SANS la preuve en cours de téléversement.
              disabled={busy || uploading}
            >
              {busy ? "Envoi…" : uploading ? "Image en cours…" : "Envoyer la preuve"}
            </button>
          ) : (
            <button
              type="button"
              className="tim-mission__cta"
              onClick={() => setCurrent((c) => c + 1)}
              disabled={busy}
            >
              Suivant
            </button>
          )}
        </footer>
      </div>
    </div>,
    document.body,
  );
}
