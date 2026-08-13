"use client";

import { useAuth } from "@payloadcms/ui";
import { useEffect, useRef } from "react";

import { hasAdminRole } from "@/core/access";

/**
 * Masque aux non-admins les onglets réservés à TIM.
 *
 * Pourquoi pas un simple `admin.condition` sur l'onglet — la solution évidente ?
 * Parce qu'une condition d'onglet se PROPAGE à ses champs enfants
 * (`iterateFields` : `passesCondition = propre && parent`), et qu'un champ de
 * type `array` dont la condition échoue est court-circuité : son état de
 * formulaire conserve la valeur globale, mais plus AUCUNE ligne `steps.N.*`.
 *
 * Or la barre d'étapes lit et écrit exactement ces chemins. Conditionner
 * l'onglet « Correction manuelle » revenait donc à vider la barre d'étapes des
 * partenaires — l'écran principal de la fiche, pour ceux qui s'en servent le
 * plus. Aucune option de configuration ne permet de garder les lignes en état
 * tout en cachant leur rendu : `admin.hidden` court-circuite au même endroit.
 *
 * On masque donc à l'affichage, ce qui laisse le formulaire intact. Ce n'est PAS
 * une mesure de sécurité et ne prétend pas l'être : la règle qui protège
 * réellement la structure du parcours est `guardStructuralEdits`, côté serveur,
 * qui rétablit tout champ structurel écrit par un non-admin.
 */

/** Intitulés d'onglets réservés. Comparés au texte rendu — que nous écrivons. */
const RESTRICTED = ["Correction manuelle"];

const labelOf = (el: Element): string => (el.textContent ?? "").trim();

export function AdminOnlyTabs() {
  const { user } = useAuth();
  const ref = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    // Tant que l'utilisateur n'est pas connu, on ne masque rien : cacher puis
    // révéler produirait un clignotement à chaque chargement pour les admins.
    if (!user || hasAdminRole(user)) return;

    const root = ref.current?.closest("form") ?? document.body;

    const apply = () => {
      const buttons = Array.from(root.querySelectorAll<HTMLElement>(".tabs-field__tab-button"));
      let hidActive = false;

      for (const button of buttons) {
        if (!RESTRICTED.includes(labelOf(button))) continue;
        if (button.dataset.timHidden === "1") continue; // déjà traité
        button.dataset.timHidden = "1";
        button.style.display = "none";
        button.setAttribute("aria-hidden", "true");
        button.tabIndex = -1;
        if (button.classList.contains("tabs-field__tab-button--active")) hidActive = true;
      }

      // L'onglet masqué était celui affiché (Payload retient le dernier onglet
      // ouvert par utilisateur) : on bascule sur le premier, sinon le partenaire
      // resterait devant un panneau qu'on vient de lui retirer de la barre.
      if (hidActive) {
        buttons.find((b) => !RESTRICTED.includes(labelOf(b)))?.click();
      }
    };

    apply();

    // Payload remonte les onglets à chaque changement d'onglet et après chaque
    // enregistrement : sans observation, le masquage ne tiendrait qu'un rendu.
    // On n'observe QUE `childList` — réagir aux attributs ferait boucler nos
    // propres écritures de style.
    const observer = new MutationObserver(apply);
    observer.observe(root, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [user]);

  return <span ref={ref} hidden aria-hidden="true" />;
}
