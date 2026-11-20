"use client";

/**
 * Cellule « Image » du tableau des articles (19/11/2026) : la vignette de l'image principale
 * (médiathèque WordPress), en 16/9 ; un cadre vide quand il n'y en a pas encore.
 */
export function ThumbCell({ cellData, rowData }: { cellData?: unknown; rowData?: { imageAlt?: string | null } }) {
  const url = typeof cellData === "string" && cellData ? cellData : null;
  return url ? (
    // eslint-disable-next-line @next/next/no-img-element -- vignette de la médiathèque WordPress
    <img className="art-thumb" src={url} alt={rowData?.imageAlt ?? ""} loading="lazy" />
  ) : (
    <span className="art-thumb art-thumb--empty" title="Pas encore d'image principale">
      Pas d&apos;image
    </span>
  );
}
