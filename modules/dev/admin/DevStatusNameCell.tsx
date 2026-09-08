"use client";

import { paletteColor } from "@/modules/dev/lib/devMeta";

/**
 * Nom d'un statut rendu dans SA couleur, dans l'écran de réglage des colonnes.
 * On y voit la palette du Kanban telle qu'elle sera, pas une liste de mots.
 */
type Props = { cellData?: unknown; rowData?: { color?: string } };

export function DevStatusNameCell({ cellData, rowData }: Props) {
  const name = typeof cellData === "string" ? cellData : "";
  if (!name) return <span style={{ color: "var(--tim-muted)" }}>—</span>;
  const { fg, bg } = paletteColor(rowData?.color);
  return (
    <span className="dev-pill" style={{ color: fg, background: bg }}>
      {name}
    </span>
  );
}
