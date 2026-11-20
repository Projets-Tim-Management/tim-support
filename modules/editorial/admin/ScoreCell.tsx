"use client";

/**
 * Cellule « SEO » / « GEO » des tableaux d'articles et de fiches : la note en %,
 * en couleur (vert dès 75, orange dès 50, rouge en dessous). Vide = pas encore
 * notée. La note n'est pas une prévision de classement.
 */
export function ScoreCell({ cellData }: { cellData?: unknown }) {
  if (typeof cellData !== "number") return <span className="tim-status-pill tim-status-pill--empty">—</span>;
  const tone = cellData >= 75 ? { color: "var(--tim-green)", bg: "var(--tim-green-bg)" } : cellData >= 50 ? { color: "var(--tim-amber)", bg: "var(--tim-amber-bg)" } : { color: "var(--tim-red)", bg: "var(--tim-red-bg)" };
  return (
    <span className="tim-status-pill" style={{ background: tone.bg, color: tone.color }}>
      {cellData} %
    </span>
  );
}
