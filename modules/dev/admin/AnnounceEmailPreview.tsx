"use client";

import { useState } from "react";

import { EmailPreview } from "@/core/admin/EmailPreview";

import "@/modules/marketing/admin/sequence-preview-button.scss";

/**
 * Bouton « Voir le rendu » de l'e-mail « C'est disponible ».
 *
 * Même bouton que celui des séquences : un exemple fictif (« Karim », un lien
 * de réservation), rendu par le code d'envoi à partir de ce qui est ENREGISTRÉ.
 */
export const AnnounceEmailPreview: React.FC = () => {
  const [open, setOpen] = useState(false);
  return (
    <div className="seq-preview">
      <button type="button" className="seq-preview__btn" onClick={() => setOpen(true)}>
        Voir le rendu
      </button>
      <span className="seq-preview__hint">Affiche la dernière version enregistrée, sur un exemple.</span>
      {open ? (
        <EmailPreview url="/api/dev/announce/preview" title="E-mail « C'est disponible »" onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
};

export default AnnounceEmailPreview;
