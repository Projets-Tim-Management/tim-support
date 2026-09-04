"use client";

import { useRowLabel } from "@payloadcms/ui";

/**
 * Libellé d'une ligne de la liste « Choix ».
 *
 * Montre le libellé ET la valeur stockée : c'est la confusion entre les deux qui
 * rendait les soumissions Brevo illisibles (`COLLABORATEURS=3` pour « 26 - 50 »).
 * Les voir côte à côte au moment de la saisie évite de la reproduire.
 */
type OptionRow = { value?: string; label?: string };

export function FormOptionRowLabel() {
  const { data } = useRowLabel<OptionRow>();

  const label = data?.label?.trim() || "Nouveau choix";
  const value = data?.value?.trim();

  return (
    <span>
      {label}
      {value ? ` · ${value}` : ""}
    </span>
  );
}
