"use client";

import { articleStatusMeta } from "@/modules/editorial/lib/articles/statuses";

/**
 * Cellule « Statut » du tableau des articles : l'étiquette de couleur (même
 * source que l'en-tête du tableau, ARTICLE_STATUSES), son sens au survol.
 */
export function ArticleStatusCell({ cellData }: { cellData?: unknown }) {
  const meta = articleStatusMeta(typeof cellData === "string" ? cellData : null);
  if (!meta) return <span className="tim-status-pill tim-status-pill--empty">—</span>;
  return (
    <span className="tim-status-pill" style={{ background: meta.bg, color: meta.color }} title={meta.hint}>
      {meta.label}
    </span>
  );
}
