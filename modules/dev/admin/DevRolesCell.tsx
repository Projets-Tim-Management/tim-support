"use client";

import { DEV_STATUS_ROLES } from "@/modules/dev/lib/devStatus";

/**
 * Colonne « Ce que ce statut déclenche » : les rôles en toutes lettres.
 *
 * Un statut sans rôle est le cas normal (une étape de passage) : on l'écrit
 * plutôt que de laisser une cellule vide, qui se lit comme un oubli.
 */
type Props = { cellData?: unknown };

export function DevRolesCell({ cellData }: Props) {
  const values = Array.isArray(cellData) ? cellData.filter((v): v is string => typeof v === "string") : [];
  if (values.length === 0) return <span style={{ color: "var(--tim-muted)" }}>étape simple</span>;
  const labels = values.map((v) => DEV_STATUS_ROLES.find((r) => r.value === v)?.label ?? v);
  return <span>{labels.join(" · ")}</span>;
}
