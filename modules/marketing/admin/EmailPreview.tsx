"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { AUDIENCE_LABEL } from "@/modules/marketing/lib/journey";

/**
 * Aperçu d'un e-mail du parcours, tel qu'il partira.
 *
 * Le rendu passe par une `iframe` en `srcDoc` : le HTML d'un e-mail apporte ses
 * propres styles et, injecté directement dans la page, il déborderait sur
 * l'admin. L'iframe l'isole complètement — et montre exactement ce que le
 * destinataire verra.
 */

type Preview = {
  key: string;
  subject: string | null;
  audience: string;
  trigger: string | null;
  detail: string | null;
  scheduledAt: string | null;
  sentAt: string | null;
  html?: string;
  /** Le corps du message reste à rédiger (séquence non encore branchée). */
  pending?: boolean;
  /** Contenu d'exemple : la vraie valeur est tirée à l'envoi (code à usage unique). */
  sample?: boolean;
};

const fmt = (iso?: string | null) =>
  iso
    ? new Date(iso).toLocaleString("fr-FR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

export function EmailPreview({
  runId,
  emailKey,
  onClose,
}: {
  runId: number | string;
  emailKey: string;
  onClose: () => void;
}) {
  const [data, setData] = useState<Preview | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/admin/journey-email?runId=${runId}&key=${encodeURIComponent(emailKey)}`,
          { credentials: "include" },
        );
        if (!res.ok) throw new Error();
        const body = await res.json();
        if (!cancelled) setData(body);
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runId, emailKey]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      className="jr-modal"
      role="dialog"
      aria-modal="true"
      aria-label="Aperçu de l'e-mail"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="jr-modal__panel jr-mailview">
        <header className="jr-modal__head">
          <h3 className="jr-modal__title">{data?.subject ?? "Aperçu de l'e-mail"}</h3>
          <p className="jr-modal__sub">
            {data && (
              <>
                Destinataire : <strong>{AUDIENCE_LABEL[data.audience] ?? data.audience}</strong>
                {data.sentAt
                  ? ` · envoyé le ${fmt(data.sentAt)}`
                  : data.scheduledAt
                    ? ` · prévu le ${fmt(data.scheduledAt)}`
                    : data.trigger
                      ? ` · ${data.trigger.toLowerCase()}`
                      : null}
              </>
            )}
          </p>
        </header>

        <div className="jr-mailview__body">
          {error && <p className="jr-modal__error">Aperçu indisponible.</p>}
          {!error && !data && <p className="jr-prev">Chargement…</p>}

          {data?.sample && (
            <p className="jr-mailview__note">
              Contenu d&apos;exemple : le code est tiré au hasard à chaque connexion et n&apos;est
              jamais conservé en clair.
            </p>
          )}

          {data?.pending ? (
            <div className="jr-mailview__pending">
              <p>
                <strong>Le texte de cet e-mail n&apos;est pas encore rédigé.</strong> Ce qui est
                déjà défini : son objet, son destinataire et son moment d&apos;envoi.
              </p>
              {data.detail && (
                <p className="jr-mailview__intent">
                  <span>Ce qu&apos;il dira</span>
                  {data.detail}
                </p>
              )}
            </div>
          ) : (
            data?.html && (
              // `sandbox` vide : aucun script, aucune navigation. Un aperçu ne
              // doit rien pouvoir exécuter dans le back-office.
              <iframe
                title="Aperçu de l'e-mail"
                className="jr-mailview__frame"
                sandbox=""
                srcDoc={data.html}
              />
            )
          )}
        </div>

        <footer className="jr-modal__actions">
          <button type="button" className="jr-btn jr-btn--ghost" onClick={onClose}>
            Fermer
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
