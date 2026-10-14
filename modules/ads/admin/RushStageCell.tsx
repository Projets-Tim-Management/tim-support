"use client";

import { rushStage } from "@/modules/ads/lib/rushes";

/**
 * L'étape d'un rush, en pastille colorée (liste et fiche) : conversion et
 * description de l'IA réunies — « les agents peuvent-ils s'en servir ? ».
 * L'étiquette et la couleur viennent d'une seule règle (rushStage) ; les
 * couleurs, des tokens.
 */
export function RushStageCell({ rowData }: { rowData?: Parameters<typeof rushStage>[0] }) {
  const stage = rushStage(rowData);
  return <span className={`tim-status-pill ads-rush-stage ads-rush-stage--${stage.tone}`}>{stage.label}</span>;
}
