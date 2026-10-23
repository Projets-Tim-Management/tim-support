"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

/**
 * Un iPhone dessiné en CSS (v2.css) autour d'écrans tirés de la vidéo.
 *
 * Un extrait d'écran (tiré de la vidéo) est posé en pleine largeur, calé en
 * haut, jamais rogné sur les côtés ; une capture d'écran ENTIER (`full`)
 * remplit le cadre — sinon une bande blanche reste en bas. La barre d'état et
 * l'encoche sont redessinées ici, identiques pour tous — sinon un écran aurait
 * son encoche et le voisin non. Plusieurs écrans : ils défilent seuls, en fondu.
 */
export default function Phone({
  screens,
  className = "",
  priority = false,
  interval = 3800,
}: {
  /** `full` : capture d'un écran ENTIER (iPhone) — elle remplit le cadre. */
  screens: { src: string; alt: string; full?: boolean }[];
  className?: string;
  priority?: boolean;
  interval?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (screens.length < 2) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = window.setInterval(() => setIndex((i) => (i + 1) % screens.length), interval);
    return () => window.clearInterval(id);
  }, [screens.length, interval]);

  return (
    <div className={`v2-phone ${className}`}>
      <div className="v2-phone-screen">
        {/* Barre d'état et encoche, communes à tous les écrans. */}
        <div className="relative z-10 flex h-[7%] items-center justify-between bg-white px-[9%] text-[10px] font-semibold text-ink">
          <span>9:41</span>
          <span aria-hidden="true" className="absolute left-1/2 top-[22%] h-[56%] w-[30%] -translate-x-1/2 rounded-full bg-ink" />
          <span aria-hidden="true" className="flex items-center gap-[3px]">
            <span className="h-[7px] w-[3px] rounded-[1px] bg-ink" />
            <span className="h-[7px] w-[3px] rounded-[1px] bg-ink" />
            <span className="h-[7px] w-[3px] rounded-[1px] bg-ink/40" />
            <span className="ml-1 h-[8px] w-[16px] rounded-[2px] border border-ink" />
          </span>
        </div>
        <div className="relative h-[93%]">
          {screens.map((s, i) => (
            <Image
              key={s.src}
              src={s.src}
              alt={s.alt}
              fill
              sizes="(max-width: 640px) 60vw, 320px"
              priority={priority && i === 0}
              data-hidden={i === index ? undefined : ""}
              className={`v2-screen object-top ${s.full ? "object-cover" : "object-contain"}`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
