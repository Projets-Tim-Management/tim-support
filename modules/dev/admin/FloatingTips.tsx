"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/**
 * Les infobulles `.dev-tip[data-tip]` de la liste des développements, posées
 * AU-DESSUS de la page plutôt que dans la carte : en CSS pur (`::after`),
 * elles étaient coupées par la colonne du Kanban ou le tableau qui les
 * contient. Ici, une seule bulle flottante, recalée pour rester dans l'écran.
 *
 * Montée une fois par la bascule Kanban / Tableau ; ailleurs (fiche), la
 * version CSS reste en place.
 */
const BODY_CLASS = "tim-tips-floating";
const MARGIN = 8;

export function FloatingTips() {
  const [tip, setTip] = useState<{ text: string; x: number; top: number; bottom: number } | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    document.body.classList.add(BODY_CLASS);
    const over = (e: MouseEvent) => {
      const el = (e.target as Element | null)?.closest?.(".dev-tip[data-tip]") as HTMLElement | null;
      if (!el?.dataset.tip) return setTip(null);
      const r = el.getBoundingClientRect();
      setTip({ text: el.dataset.tip, x: r.left + r.width / 2, top: r.top, bottom: r.bottom });
    };
    const hide = () => setTip(null);
    document.addEventListener("mouseover", over);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.body.classList.remove(BODY_CLASS);
      document.removeEventListener("mouseover", over);
      window.removeEventListener("scroll", hide, true);
    };
  }, []);

  // Au-dessus de l'élément, centrée, puis ramenée dans l'écran ; dessous s'il n'y a pas la place.
  useLayoutEffect(() => {
    const box = ref.current;
    if (!tip || !box) return setPos(null);
    const w = box.offsetWidth;
    const h = box.offsetHeight;
    const left = Math.min(Math.max(MARGIN, tip.x - w / 2), window.innerWidth - w - MARGIN);
    const top = tip.top - h - 6 >= MARGIN ? tip.top - h - 6 : tip.bottom + 6;
    setPos({ left, top });
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={ref}
      role="tooltip"
      className="tim-float-tip"
      style={pos ? { left: pos.left, top: pos.top } : { left: 0, top: 0, visibility: "hidden" }}
    >
      {tip.text}
    </div>,
    document.body,
  );
}
