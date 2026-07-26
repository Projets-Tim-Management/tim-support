"use client";

import { ticketMeta } from "./ticket-meta";

/**
 * Cellule de liste rendant un champ « select » de ticket (statut, priorité,
 * type, service) en pastille colorée. Utilisée via admin.components.Cell.
 */
type Props = { cellData?: unknown; field?: { name?: string } };

export function ColoredCell({ cellData, field }: Props) {
  const value = typeof cellData === "string" ? cellData : "";
  if (!value) return <span style={{ color: "var(--tim-muted)" }}>—</span>;
  const { label, fg, bg } = ticketMeta(field?.name ?? "", value);
  return (
    <span className="ticket-cell-pill" style={{ color: fg, background: bg }}>
      {label}
    </span>
  );
}
