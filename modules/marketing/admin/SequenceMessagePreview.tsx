"use client";

import { useFormFields } from "@payloadcms/ui";
import { useState } from "react";

import { EmailPreview } from "@/core/admin/EmailPreview";

import "./sequence-preview-button.scss";

/**
 * Bouton « Voir le rendu » d'un message, dans l'écran de la séquence.
 *
 * L'aperçu de la fiche montre ce que recevra UNE personne ; celui-ci montre le
 * message seul, sans destinataire — c'est ce dont on a besoin en écrivant : on
 * modifie un paragraphe, on regarde, on recommence.
 *
 * ⚠️ Il affiche ce qui est ENREGISTRÉ, pas ce qui est à l'écran. Le HTML est
 * régénéré côté serveur par le code d'envoi, à partir de la base — c'est ce qui
 * garantit que l'aperçu ne ment pas, et c'est aussi pourquoi il faut enregistrer
 * avant de regarder. Le bouton le dit plutôt que de laisser croire au contraire.
 */
export const SequenceMessagePreview: React.FC<{ path?: string }> = ({ path }) => {
  const [open, setOpen] = useState(false);

  // `path` vaut « messages.2.preview » : la ligne concernée est le préfixe.
  const row = path?.split(".").slice(0, -1).join(".") ?? "";
  const messageKey = useFormFields(([fields]) => fields[`${row}.key`]?.value as string | undefined);
  const title = useFormFields(([fields]) => fields[`${row}.title`]?.value as string | undefined);
  const sequenceKey = useFormFields(([fields]) => fields.key?.value as string | undefined);

  if (!messageKey || !sequenceKey) {
    return (
      <p className="seq-preview__hint">
        Donnez une clé à ce message et enregistrez pour en voir le rendu.
      </p>
    );
  }

  const url = `/api/sequences/preview?sequence=${encodeURIComponent(sequenceKey)}&message=${encodeURIComponent(messageKey)}`;

  return (
    <div className="seq-preview">
      <button type="button" className="seq-preview__btn" onClick={() => setOpen(true)}>
        Voir le rendu
      </button>
      <span className="seq-preview__hint">Affiche la dernière version enregistrée.</span>
      {open ? (
        <EmailPreview url={url} title={title || messageKey} onClose={() => setOpen(false)} />
      ) : null}
    </div>
  );
};

export default SequenceMessagePreview;
