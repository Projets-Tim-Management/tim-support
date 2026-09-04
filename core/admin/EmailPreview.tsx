"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";

/**
 * Aperçu d'un e-mail tel que le destinataire le reçoit.
 *
 * Rendu dans une `iframe` ISOLÉE (`sandbox=""`, donc sans script ni navigation) :
 * un HTML d'e-mail embarque ses propres styles et ses tables, qui saccageraient
 * la mise en page de l'admin s'ils étaient injectés directement. L'isolation
 * n'est pas une précaution vague — c'est ce qui rend l'aperçu FIDÈLE : le HTML
 * s'affiche sans hériter d'une seule règle de l'écran qui l'entoure.
 *
 * Partagé entre les tickets et les séquences : il n'y a qu'une façon de
 * regarder un e-mail, et deux copies de cette fenêtre divergeraient.
 *
 * @param url route qui RENVOIE le HTML de l'e-mail (et non le HTML lui-même) :
 * on veut qu'il soit régénéré par le code d'envoi, pas reconstitué à l'écran.
 */
export function EmailPreview({
  url,
  title = "Rendu de l'e-mail",
  onClose,
}: {
  url: string;
  title?: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      className="email-preview"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="email-preview__panel">
        <header className="email-preview__head">
          <span className="email-preview__title">{title}</span>
          <a className="email-preview__open" href={url} target="_blank" rel="noreferrer">
            Ouvrir dans un onglet ↗
          </a>
          <button type="button" className="email-preview__close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </header>
        <iframe className="email-preview__frame" src={url} title={title} sandbox="" />
      </div>
    </div>,
    document.body,
  );
}

export default EmailPreview;
