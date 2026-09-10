"use client";

import { useEffect } from "react";

/**
 * Ouvre l'aperçu d'impression dès l'affichage.
 *
 * La page n'est ouverte que pour être imprimée : demander un second geste
 * (Ctrl+P) après le clic sur « Imprimer » serait un clic pour rien. Elle reste
 * consultable et réimprimable si l'aperçu est annulé.
 */
export default function PrintNow() {
  useEffect(() => {
    // Un temps de rendu avant l'aperçu : Chrome fige la page telle qu'elle est
    // au moment de l'appel, polices comprises.
    const t = setTimeout(() => window.print(), 300);
    return () => clearTimeout(t);
  }, []);
  return null;
}
