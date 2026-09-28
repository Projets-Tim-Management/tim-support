"use client";

import { PRODUCTION_KEY, runStatusLabel, runStatusMeta } from "@/modules/marketing/lib/journey";

/**
 * Cellule « Statut » des parcours (libellés propres à la mise en production) : même pastille que les statuts client
 * (classe `tim-status-pill` partagée), couleurs issues de RUN_STATUSES — donc
 * des tokens, jamais en dur.
 */
export function RunStatusCell({ cellData, rowData }: { cellData?: unknown; rowData?: { journeyKey?: string | null } }) {
  const value = typeof cellData === "string" ? cellData : null;
  const meta = runStatusMeta(value);
  if (!meta) return <span className="tim-status-pill tim-status-pill--empty">—</span>;

  return (
    <span className="tim-status-pill" style={{ background: meta.bg, color: meta.color }}>
      {runStatusLabel(value, rowData?.journeyKey === PRODUCTION_KEY) ?? meta.label}
    </span>
  );
}
