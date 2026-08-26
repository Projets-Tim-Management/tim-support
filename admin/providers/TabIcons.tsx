"use client";

import { type ReactNode, useEffect } from "react";

/**
 * Pose une icône devant chaque onglet de fiche.
 *
 * POURQUOI PAR LE DOM. Payload rend un onglet comme un simple `<button>` dont le
 * seul contenu est le libellé traduit : ni attribut de données, ni composant de
 * libellé, ni classe distinctive. Trois voies s'offraient :
 *  - un émoji dans le libellé — lisible mais peu sérieux dans un back-office ;
 *  - du CSS par position (`:nth-child`) — muet sur ce qu'il désigne, et faux dès
 *    qu'un onglet est réordonné ;
 *  - reconnaître le LIBELLÉ et injecter l'icône, ce qui suit l'onglet où qu'il
 *    aille et se lit comme une table de correspondance.
 *
 * On prend la troisième. Un onglet sans correspondance reste sans icône : mieux
 * vaut aucun pictogramme qu'un pictogramme approximatif.
 *
 * Un `MutationObserver` rejoue l'injection quand Payload redessine la barre
 * (changement de statut qui masque un onglet, ouverture d'un drawer…).
 *
 * Provider monté une fois pour tout l'admin (payload.config → admin.components.providers).
 */

/** Traits d'icône (24×24, `stroke="currentColor"`) par libellé d'onglet. */
const ICONS: Record<string, string> = {
  // ── Fiche opportunité ────────────────────────────────────────────────────
  historique: '<path d="M12 8v4l3 2"/><circle cx="12" cy="12" r="9"/>',
  "licences par profil":
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9"/>',
  "contrat client":
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  // Un dossier à recopier ET les clés à créer : les deux onglets ont fusionné.
  "dossier & accès":
    '<path d="M9 3h6a1 1 0 0 1 1 1v2H8V4a1 1 0 0 1 1-1Z"/><path d="M16 5h2a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h4"/>',
  "espace client":
    '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/><path d="M9 21v-7h6v7"/>',
  contact:
    '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z"/>',
  "facturation client":
    '<path d="M4 3v18l2.5-1.5L9 21l2.5-1.5L14 21l2.5-1.5L19 21V3l-2.5 1.5L14 3l-2.5 1.5L9 3 6.5 4.5Z"/><path d="M8 8h7M8 12h7M8 16h4"/>',

  // ── Fiche partenaire ─────────────────────────────────────────────────────
  "contact & identité": '<circle cx="12" cy="8" r="4"/><path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1"/>',
  "entreprise & légal":
    '<path d="M3 21h18"/><path d="M5 21V5a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v16"/><path d="M15 9h3a1 1 0 0 1 1 1v11"/><path d="M8 8h3M8 12h3M8 16h3"/>',
  "contrat & programme":
    '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  "signature e-mail": '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  accès: '<circle cx="8" cy="15" r="4"/><path d="m10.85 12.15 8.15-8.15 2 2-2 2 2 2-3 3-2-2-2.15 2.15"/>',
  "agenda & rendez-vous":
    '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  "suivi commercial": '<path d="M3 3v18h18"/><path d="m7 14 3-4 3 3 5-6"/>',
  "opportunités & commission":
    '<circle cx="12" cy="12" r="9"/><path d="M15 9.5a3 3 0 0 0-3-1.5c-1.7 0-3 1-3 2.2 0 3 6 1.6 6 4.6 0 1.2-1.3 2.2-3 2.2a3 3 0 0 1-3-1.5"/><path d="M12 6v12"/>',
  "points & activité":
    '<path d="m12 3 2.6 5.4 5.9.8-4.3 4.1 1 5.9-5.2-2.8-5.2 2.8 1-5.9L3.5 9.2l5.9-.8Z"/>',
};

/** Libellé → clé de correspondance : sans accents parasites ni casse. */
const keyOf = (label: string): string =>
  label
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

const MARK = "tim-tab-ico";

export default function TabIcons({ children }: { children: ReactNode }) {
  useEffect(() => {
    const paint = () => {
      document.querySelectorAll<HTMLElement>(".tabs-field__tab-button").forEach((btn) => {
        if (btn.querySelector(`.${MARK}`)) return;
        // `textContent` porte aussi la pastille d'erreur : on ne lit que les
        // nœuds texte directs, donc le libellé seul.
        const label = Array.from(btn.childNodes)
          .filter((n) => n.nodeType === 3)
          .map((n) => n.textContent ?? "")
          .join("");
        const path = ICONS[keyOf(label)];
        if (!path) return;

        const span = document.createElement("span");
        span.className = MARK;
        span.setAttribute("aria-hidden", "true");
        span.innerHTML =
          `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" ` +
          `stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${path}</svg>`;
        btn.prepend(span);
      });
    };

    paint();

    /**
     * Payload redessine la barre à chaque changement de condition d'onglet, d'où
     * l'observateur. Mais il voit TOUTES les mutations de l'admin — chaque
     * frappe dans un champ, chaque ligne de tableau qui arrive. Sans garde-fou,
     * on relançait un `querySelectorAll` sur tout le document à chaque fois, y
     * compris sur les écrans sans le moindre onglet.
     *
     * Deux garde-fous : on ne regarde que les mutations qui AJOUTENT des nœuds
     * (une icône ne peut apparaître que là), et on ne repeint qu'une fois par
     * image, quel qu'en soit le nombre.
     */
    let scheduled = 0;
    const observer = new MutationObserver((records) => {
      if (scheduled) return;
      if (!records.some((r) => r.addedNodes.length)) return;
      scheduled = requestAnimationFrame(() => {
        scheduled = 0;
        paint();
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (scheduled) cancelAnimationFrame(scheduled);
      observer.disconnect();
    };
  }, []);

  return <>{children}</>;
}
