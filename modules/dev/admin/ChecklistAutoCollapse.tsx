"use client";

import { useEffect } from "react";

/**
 * Referme le point de checklist qu'on vient d'ajouter.
 *
 * Payload ouvre TOUJOURS une ligne nouvelle, quel que soit `initCollapsed` :
 * son état de formulaire crée la ligne sans propriété « replié », et la
 * préférence de pliage du document — consultée ensuite — ne connaît pas encore
 * cet identifiant. `initCollapsed` ne s'applique donc qu'aux lignes DÉJÀ
 * enregistrées.
 *
 * Aucun réglage ne couvre ce cas ; on agit donc sur le rendu, en cliquant le
 * bouton de repli de la ligne apparue — exactement ce que ferait la personne
 * une seconde plus tard. Le clic passe par le mécanisme normal de Payload, qui
 * enregistre au passage la préférence : la ligne reste repliée ensuite.
 *
 * Ce composant ne rend rien. Il est monté sous la checklist, et n'observe
 * qu'elle.
 */
export const ChecklistAutoCollapse = () => {
  useEffect(() => {
    const container = document.querySelector(".dev-checklist");
    if (!container) return;

    const points = () => container.querySelectorAll(".collapsible");
    let known = points().length;

    const observer = new MutationObserver(() => {
      const rows = points();
      // Une ligne de plus qu'au dernier passage = un point vient d'être ajouté.
      if (rows.length > known) {
        const last = rows[rows.length - 1];
        if (!last.classList.contains("collapsible--collapsed")) {
          (last.querySelector(".collapsible__toggle") as HTMLButtonElement | null)?.click();
        }
      }
      known = rows.length;
    });

    observer.observe(container, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  return null;
};
