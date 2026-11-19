"use client";

import { JOB_STATUSES } from "@/modules/editorial/lib/jobs/statuses";

/** Cellule « Statut » du tableau des fiches métier : l'étiquette de couleur, son sens au survol. */
export function JobStatusCell({ cellData }: { cellData?: unknown }) {
  const meta = JOB_STATUSES.find((s) => s.value === cellData);
  if (!meta) return <span className="tim-status-pill tim-status-pill--empty">—</span>;
  return (
    <span className="tim-status-pill" style={{ background: meta.bg, color: meta.color }} title={meta.hint}>
      {meta.label}
    </span>
  );
}
