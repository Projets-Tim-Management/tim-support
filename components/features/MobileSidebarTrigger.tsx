"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import FeatureSidebar from "./FeatureSidebar";
import type { FeatureTerm } from "@/core/lib/types";

interface Props {
  categories: FeatureTerm[];
}

/**
 * Bouton "Catégories" + drawer plein écran pour la navigation latérale sur
 * mobile / tablette. Caché sur lg+ (où la sidebar est toujours visible).
 *
 *  - Click bouton → ouvre le drawer qui glisse depuis la gauche
 *  - Click sur le backdrop → ferme
 *  - Échap → ferme
 *  - Navigation vers une catégorie (changement de pathname / search) → ferme auto
 */
export default function MobileSidebarTrigger({ categories }: Props) {
  const pathname     = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Verrouille le scroll du body pendant que le drawer est ouvert
  useEffect(() => {
    if (open) {
      const original = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => { document.body.style.overflow = original; };
    }
  }, [open]);

  // Ferme sur Échap
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Ferme automatiquement quand on navigue (l'utilisateur a cliqué une catégorie)
  useEffect(() => {
    setOpen(false);
  }, [pathname, searchParams]);

  return (
    <>
      {/* Trigger — petit lien icône + "Voir tout", visible uniquement < lg */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Voir toutes les catégories"
        aria-expanded={open}
        className="lg:hidden inline-flex items-center gap-1.5 h-7 px-2 -ml-2 rounded-md text-xs font-medium text-muted hover:text-foreground hover:bg-surface transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        Voir tout
      </button>

      {/* Drawer + backdrop — z-index élevé pour passer au-dessus du Header (z-40) et du FAB (z-50) */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-[60] flex">
          {/* Backdrop cliquable */}
          <button
            type="button"
            aria-label="Fermer"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-black/45 backdrop-blur-sm"
          />

          {/* Drawer panel */}
          <aside className="relative bg-white w-[80vw] h-full overflow-y-auto shadow-2xl mobile-drawer-in">
            <div className="sticky top-0 z-10 bg-white px-4 py-3 border-b border-border flex items-center justify-between">
              <p className="font-semibold text-foreground">Catégories</p>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="w-8 h-8 rounded-md hover:bg-surface flex items-center justify-center text-muted hover:text-foreground transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="p-4">
              <FeatureSidebar categories={categories} />
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
