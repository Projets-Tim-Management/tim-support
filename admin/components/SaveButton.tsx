"use client";

import { useForm, useFormModified } from "@payloadcms/ui";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Bouton « Enregistrer le mot de passe » placé JUSTE À CÔTÉ du bouton « Annuler »
 * de la boîte de changement de mot de passe (composant Auth de Payload).
 *
 * On ne peut pas modifier le composant Auth de Payload, alors on rend notre
 * bouton DANS sa barre de contrôles (`.auth-fields__controls`) via un portail
 * React — uniquement quand le mode changement de mot de passe est ouvert
 * (présence du bouton `#cancel-change-password`). Clic → soumet le formulaire
 * (donc enregistre le nouveau mot de passe).
 *
 * Rendu par un champ `ui` de Users (invisible en soi : tout part dans le portail).
 */
export default function SaveButton() {
  const { submit } = useForm();
  const modified = useFormModified();
  const [controls, setControls] = useState<HTMLElement | null>(null);
  const [changing, setChanging] = useState(false);

  useEffect(() => {
    const sync = () => {
      const bar = document.querySelector<HTMLElement>(".auth-fields__controls");
      setControls(bar);
      setChanging(Boolean(bar?.querySelector("#cancel-change-password")));
    };
    sync();
    // Le mode mot de passe s'ouvre/ferme dynamiquement → on ré-observe le DOM.
    const obs = new MutationObserver(sync);
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);

  if (!controls || !changing) return null;

  return createPortal(
    <button
      type="button"
      className="tim-pwd-save"
      onClick={() => void submit()}
      disabled={!modified}
    >
      Enregistrer le mot de passe
    </button>,
    controls,
  );
}
