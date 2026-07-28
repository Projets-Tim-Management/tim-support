"use client";

import { useRowLabel } from "@payloadcms/ui";

/**
 * Libellé de ligne pour chaque « partie » d'une feature (array `doc`).
 * Remplace le générique « Section 01 » par : numéro + titre de la partie + un
 * indicateur si un média (GIF/image/galerie/fichier) y est associé. Rend la
 * liste des parties lisible d'un coup d'œil quand elles sont repliées.
 */
type DocRow = {
  titleDoc?: string;
  mediaDoc?: { blockType?: string }[];
};

export function DocSectionRowLabel() {
  const { data, rowNumber } = useRowLabel<DocRow>();

  const num = typeof rowNumber === "number" ? String(rowNumber + 1).padStart(2, "0") : "—";
  const title = data?.titleDoc?.trim();
  const media = Array.isArray(data?.mediaDoc) ? data.mediaDoc : [];
  const hasVisual = media.some(
    (b) => b?.blockType === "img" || b?.blockType === "galerie",
  );

  return (
    <span className="doc-rowlabel">
      <span className="doc-rowlabel__num">{num}</span>
      <span className="doc-rowlabel__title">{title || "Nouvelle partie"}</span>
      {media.length > 0 && (
        <span className="doc-rowlabel__media">{hasVisual ? "🎬 média" : "📎 fichier"}</span>
      )}
    </span>
  );
}
