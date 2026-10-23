"use client";

import { useEffect, useRef } from "react";

/**
 * Fait entrer son contenu quand il arrive à l'écran (classe `v2-reveal`,
 * v2.css). Une seule fois : un contenu qui disparaît et revient à chaque
 * défilement fatigue plus qu'il n'anime.
 */
export default function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  /** Décalage en millisecondes, pour faire entrer des voisins l'un après l'autre. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e?.isIntersecting) return;
        el.setAttribute("data-shown", "");
        obs.disconnect();
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={`v2-reveal ${className}`} style={{ "--d": `${delay}ms` } as React.CSSProperties}>
      {children}
    </div>
  );
}
