"use client";

import { paletteColor } from "@/modules/dev/lib/devMeta";

/**
 * Colonne « Statut » de la liste : le nom du statut dans SA couleur.
 *
 * Défensif sur la forme reçue : selon la profondeur de la requête de liste, une
 * relation arrive peuplée (objet) ou réduite à son id. Dans le second cas on
 * n'a rien à afficher — mieux vaut un tiret qu'un identifiant brut.
 */
type Props = { cellData?: unknown };

export function DevStatusCell({ cellData }: Props) {
  const status = typeof cellData === "object" && cellData !== null ? (cellData as { name?: string; color?: string }) : null;
  if (!status?.name) return <span style={{ color: "var(--tim-muted)" }}>—</span>;
  const { fg, bg } = paletteColor(status.color);
  return (
    <span className="dev-pill" style={{ color: fg, background: bg }}>
      {status.name}
    </span>
  );
}
