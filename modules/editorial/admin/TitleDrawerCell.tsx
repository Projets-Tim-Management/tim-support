"use client";

import { useState } from "react";

import { ContentDrawer } from "@/modules/editorial/admin/ContentDrawer";

/**
 * Cellule « Titre » des tableaux d'articles et de fiches métier : un clic ouvre
 * le tiroir (contenu complet + note SEO / GEO) au lieu de quitter le tableau.
 * La fiche Payload reste accessible depuis le tiroir (lien « Ouvrir la fiche »).
 */
export function TitleDrawerCell({ cellData, rowData, collectionSlug }: { cellData?: unknown; rowData?: { id?: number | string }; collectionSlug?: string }) {
  const [open, setOpen] = useState(false);
  const id = rowData?.id;
  const collection = collectionSlug === "job-sheets" ? "job-sheets" : "articles";
  return (
    <>
      <button
        type="button"
        className="cdr-open"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (id != null) setOpen(true);
        }}
      >
        {String(cellData ?? "Sans titre")}
      </button>
      {open && id != null && <ContentDrawer collection={collection} id={id} onClose={() => setOpen(false)} />}
    </>
  );
}
