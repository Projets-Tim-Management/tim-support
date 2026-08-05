"use client";

import { type ReactNode, useEffect } from "react";

/**
 * Rend cliquable TOUTE la largeur d'une ligne de tableau (pas seulement la
 * cellule-lien native de Payload, souvent l'avatar). Délégation globale d'un
 * clic : si on clique dans une ligne `<tr>` d'un tableau (hors en-tête, hors
 * contrôle interactif), on ouvre la fiche de cette ligne.
 *
 * ⚠️ Payload pose la classe `table` sur la DIV qui enveloppe le tableau, pas sur
 * l'élément `<table>` : le repère est donc `.table` et surtout PAS `table.table`,
 * qui ne matche jamais (le clic pleine largeur restait alors sans effet).
 *
 * Provider monté une fois pour tout l'admin (payload.config → admin.components.providers).
 */
export default function RowClick({ children }: { children: ReactNode }) {
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      // On laisse passer les éléments interactifs (case à cocher, liens, boutons…).
      if (target.closest("a, button, input, label, select, textarea, [role='button']")) return;

      const tr = target.closest("tr");
      if (!tr || tr.closest("thead") || !tr.closest(".table")) return;

      // Tableau de relations (champ `join` d'une fiche) : la ligne n'a pas de
      // lien mais un déclencheur de DRAWER (crayon natif, masqué en CSS) — on
      // ouvre le drawer, sans quitter la fiche.
      if (tr.closest(".relationship-table")) {
        const toggler = tr.querySelector<HTMLElement>(".drawer-link__doc-drawer-toggler");
        if (toggler) {
          e.preventDefault();
          toggler.click();
        }
        return;
      }

      // Lien de la fiche = 1er lien de la ligne pointant vers une collection
      // (la cellule-lien native, en tête de ligne). Les cellules relationnelles
      // pointent vers d'AUTRES collections et viennent après → non prioritaires.
      const link = tr.querySelector<HTMLAnchorElement>('a[href*="/collections/"]');
      if (link) {
        e.preventDefault();
        link.click();
      }
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);

  return <>{children}</>;
}
