"use client";

import { useEffect, useRef } from "react";

/**
 * Échap ferme la fenêtre. `top` : une fenêtre posée PAR-DESSUS une autre
 * (retouche, médiathèque au-dessus de « Rédiger avec Claude ») écoute en premier
 * (phase de capture) et arrête l'événement là — sans quoi un seul Échap
 * fermerait les deux.
 *
 * Toujours la DERNIÈRE version du rappel (via une ref) : l'écouteur n'est posé
 * qu'une fois, même si le rappel change à chaque rendu.
 */
export function useEscape(onEscape: () => void, opts: { top?: boolean } = {}) {
  const latest = useRef(onEscape);
  useEffect(() => {
    latest.current = onEscape;
  });
  const top = Boolean(opts.top);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (top) e.stopImmediatePropagation();
      latest.current();
    };
    window.addEventListener("keydown", onKey, top);
    return () => window.removeEventListener("keydown", onKey, top);
  }, [top]);
}
