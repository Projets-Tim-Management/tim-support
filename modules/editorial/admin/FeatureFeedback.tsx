"use client";

import { useFormFields } from "@payloadcms/ui";

/**
 * Le retour des lecteurs d'une fiche, en une ligne : « 👍 12 · 👎 3 — 80 %
 * utile ». Remplace deux grands champs numériques grisés, qui prenaient la
 * moitié de la barre latérale pour deux nombres qu'on ne modifie jamais.
 */
export function FeatureFeedback() {
  const helpful = useFormFields(([f]) => Number(f["feedback.helpful"]?.value ?? 0) || 0);
  const notHelpful = useFormFields(([f]) => Number(f["feedback.notHelpful"]?.value ?? 0) || 0);
  const total = helpful + notHelpful;

  return (
    <div className="field-type ftr-feedback">
      <span className="ftr-feedback__label">Avis des lecteurs</span>
      {total === 0 ? (
        <span className="ftr-feedback__empty">Aucun vote pour l&apos;instant.</span>
      ) : (
        <span className="ftr-feedback__votes">
          👍 {helpful} · 👎 {notHelpful}
          <em>{Math.round((helpful / total) * 100)} % utile</em>
        </span>
      )}
    </div>
  );
}
