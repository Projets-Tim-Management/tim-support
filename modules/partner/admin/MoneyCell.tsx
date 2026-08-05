"use client";

import { eur } from "@/modules/partner/lib/format";

/**
 * Cellule de tableau pour un montant : formatage € FR (colonnes « CA payé HT /
 * mois » et « Commission / mois »). Un montant absent s'affiche « — » plutôt que
 * « 0 € », qui laisserait croire à un chiffre d'affaires nul.
 */
export function MoneyCell({ cellData }: { cellData?: unknown }) {
  const n = typeof cellData === "number" ? cellData : Number(cellData);
  return <span>{Number.isFinite(n) ? eur.format(n) : "—"}</span>;
}
