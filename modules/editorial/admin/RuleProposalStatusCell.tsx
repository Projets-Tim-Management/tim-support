"use client";

import { PROPOSAL_STATUSES } from "@/modules/editorial/lib/articles/rules-text";

/** Cellule « État » des recommandations de Sergey : une étiquette de couleur. */
export function RuleProposalStatusCell({ cellData }: { cellData?: unknown }) {
  const meta = PROPOSAL_STATUSES.find((s) => s.value === cellData);
  if (!meta) return <span className="tim-status-pill tim-status-pill--empty">—</span>;
  return (
    <span className="tim-status-pill" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}
