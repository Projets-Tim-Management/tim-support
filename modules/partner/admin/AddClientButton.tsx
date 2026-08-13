"use client";

import { useCallback, useRef } from "react";

/**
 * Bouton « Ajouter une opportunité » de la fiche partenaire (onglet
 * Opportunités & commission), rendu en `beforeInput` du champ `join`.
 *
 * Payload ne permet ni de renommer ni de restyler le lien « Ajouter » natif du
 * tableau de relations (libellé issu de l'i18n `fields:addNew`, partagé par TOUS
 * les champs join — le renommer casserait celui des transactions de points). On
 * masque donc le natif en CSS (`.relationship-table:has(.tim-add-client)`) et on
 * déclenche le MÊME drawer depuis notre bouton : aucune logique dupliquée, le
 * partenaire reste associé automatiquement.
 */
export function AddClientButton() {
  const ref = useRef<HTMLDivElement>(null);

  const openDrawer = useCallback(() => {
    // Le déclencheur natif vit dans l'en-tête du tableau, au-dessus de nous.
    const table = ref.current?.closest(".relationship-table");
    table?.querySelector<HTMLElement>(".relationship-table__add-new")?.click();
  }, []);

  return (
    <div className="tim-add-client-bar" ref={ref}>
      <button type="button" className="tim-add-client" onClick={openDrawer}>
        <svg viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
          <path d="M8 3.5v9M3.5 8h9" />
        </svg>
        Ajouter une opportunité
      </button>
    </div>
  );
}
