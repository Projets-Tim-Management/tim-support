"use client";

import { devMeta } from "@/modules/dev/lib/devMeta";

/**
 * Cellule de liste rendant un champ « select » d'un développement (statut,
 * type, priorité) en pastille colorée — mêmes couleurs que le champ d'édition
 * et que les cartes du Kanban, via devMeta.
 */
type Props = { cellData?: unknown; field?: { name?: string } };

export function DevCell({ cellData, field }: Props) {
  const value = typeof cellData === "string" ? cellData : "";
  if (!value) return <span style={{ color: "var(--tim-muted)" }}>—</span>;
  const { label, fg, bg } = devMeta(field?.name ?? "", value);
  return (
    <span className="dev-pill" style={{ color: fg, background: bg }}>
      {label}
    </span>
  );
}
