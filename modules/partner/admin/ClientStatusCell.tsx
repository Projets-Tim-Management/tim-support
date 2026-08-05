"use client";

import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";

/**
 * Cellule « Statut » des tableaux de clients : pastille colorée plutôt que du
 * texte brut, avec le même code couleur que les colonnes du Kanban (une seule
 * source, CLIENT_STATUSES). Les couleurs viennent des tokens, jamais en dur.
 */
export function ClientStatusCell({ cellData }: { cellData?: unknown }) {
  const meta = clientStatusMeta(typeof cellData === "string" ? cellData : null);
  if (!meta) return <span className="tim-status-pill tim-status-pill--empty">—</span>;

  return (
    <span className="tim-status-pill" style={{ background: meta.bg, color: meta.color }}>
      {meta.label}
    </span>
  );
}
