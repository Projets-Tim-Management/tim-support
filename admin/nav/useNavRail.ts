"use client";

import { useEffect, useState } from "react";

/**
 * Le menu est-il réduit à sa colonne d'icônes ?
 *
 * L'état vit sur `<html>` (`data-nav-rail`) et pas dans un contexte React, pour
 * deux raisons :
 *
 *  - le bouton qui le change est dans la barre du HAUT, le menu est ailleurs
 *    dans l'arbre, et Payload possède la racine entre les deux : un contexte
 *    commun demanderait d'envelopper son Root ;
 *  - tout le rendu du mode réduit est du CSS. Un attribut sur `<html>` suffit
 *    à le déclencher : aucun composant n'a besoin de connaître l'état pour
 *    s'afficher correctement.
 *
 * ⚠️ Il est posé APRÈS l'hydratation, jamais avant.
 *
 * Un script inline le rétablissait plus tôt, pour éviter que le menu large
 * n'apparaisse une fraction de seconde au chargement. Mais toucher à `<html>`
 * avant que React n'hydrate lui fait trouver un attribut qu'il n'a pas rendu :
 * avertissement d'hydratation à chaque page. Le sursaut ne concerne que les
 * rechargements complets — la navigation dans l'admin est cliente et n'en
 * produit aucun. Il ne valait pas ce prix.
 */

const ATTR = "navRail";
const KEY = "tim-nav-rail";
const EVENT = "tim-nav-rail-change";

/** Lit l'état courant depuis le DOM — la source de vérité pendant la session. */
export const isRailed = (): boolean =>
  typeof document !== "undefined" && document.documentElement.dataset[ATTR] === "1";

export function setRailed(on: boolean): void {
  if (typeof document === "undefined") return;
  if (on) document.documentElement.dataset[ATTR] = "1";
  else delete document.documentElement.dataset[ATTR];

  // Mémorisé : un menu qu'on replie doit rester replié au rechargement, sinon
  // le réglage se refait à chaque page et ne vaut pas la peine d'exister.
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    // Navigation privée, stockage refusé : le mode reste valable pour la session.
  }
  window.dispatchEvent(new CustomEvent(EVENT));
}

export function useNavRail(): [boolean, (on: boolean) => void] {
  const [railed, set] = useState(false);

  useEffect(() => {
    // Rétablit le réglage mémorisé, puis suit les changements.
    try {
      if (localStorage.getItem(KEY) === "1" && !isRailed()) setRailed(true);
    } catch {
      // Stockage refusé : le menu s'ouvre déplié, ce qui reste utilisable.
    }

    const sync = () => set(isRailed());
    sync();
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  return [railed, setRailed];
}
