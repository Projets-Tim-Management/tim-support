"use client";

import { runStatusMeta } from "@/modules/marketing/lib/journey";

/**
 * Cellule « Statut » des phases de test : même pastille que les statuts client
 * (classe `tim-status-pill` partagée), couleurs issues de RUN_STATUSES — donc
 * des tokens, jamais en dur.
 */
export function RunStatusCell({ cellData }: { cellData?: unknown }) {
  const meta = runStatusMeta(typeof cellData === "string" ? cellData : null);
  if (!meta) return <span className="tim-status-pill tim-status-pill--empty">—</span>;

  return (
    <span className="tim-status-pill" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}
