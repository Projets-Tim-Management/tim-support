import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import type { RenderCut } from "@/modules/ads/video/transitions";
import { blurFilter, clamp } from "./motion";

/**
 * Le dessin des transitions (voir modules/ads/video/transitions.ts) : un plan
 * est enveloppé ; pendant son entrée et sa sortie, il bouge avec la
 * transition. Le plan qui entre est dessiné PAR-DESSUS celui qui sort.
 */

const inOut = Easing.inOut(Easing.cubic);

/** L'avancement (0 → 1) d'une transition qui dure `frames` à partir de `start`. */
const progress = (frame: number, start: number, frames: number) => (frames > 0 ? interpolate(frame, [start, start + frames], [0, 1], { ...clamp, easing: inOut }) : 1);

/** Le plan qui entre : sa forme selon la transition, à l'avancement t. */
function enterStyle(cut: RenderCut, t: number, u: number): CSSProperties {
  switch (cut.type) {
    case "cercle":
      return { clipPath: `circle(${t * 150}% at ${(cut.x ?? 0.5) * 100}% ${(cut.y ?? 0.5) * 100}%)` };
    case "fondu":
      return { opacity: t };
    case "poussee":
      return { transform: `translateY(${(1 - t) * 100}%)` };
    case "glisse":
      return { transform: `translateX(${(1 - t) * 100}%)`, filter: blurFilter(Math.sin(Math.PI * t) * 26 * u) };
    case "zoom":
      return { opacity: interpolate(t, [0.3, 0.8], [0, 1], clamp), transform: `scale(${0.82 + 0.18 * t})` };
    case "volet": {
      // Un dévoilement à bord doux, en biais, avec un léger zoom : pas de barre qui balaie l'écran (jugée datée le 15/10/2026).
      const edge = -30 + t * 160;
      const mask = `linear-gradient(110deg, #000 ${edge - 30}%, transparent ${edge}%)`;
      return { maskImage: mask, WebkitMaskImage: mask, transform: `scale(${1.06 - 0.06 * t})` };
    }
    case "flash":
      return { opacity: t < 0.5 ? 0 : 1 };
    default:
      return {};
  }
}

/** Le plan qui sort, à l'avancement t de la transition du plan suivant. */
function exitStyle(type: RenderCut["type"], t: number, u: number): CSSProperties {
  switch (type) {
    case "poussee":
      return { transform: `translateY(${-t * 100}%)` };
    case "glisse":
      return { transform: `translateX(${-t * 100}%)`, filter: blurFilter(Math.sin(Math.PI * t) * 26 * u) };
    case "zoom":
      // On plonge : le plan grossit et se brouille pendant que le suivant apparaît par-dessus.
      return { transform: `scale(${1 + 0.6 * t})`, filter: blurFilter(t * 18 * u) };
    default:
      // Fondu compris : le plan suivant passe par-dessus ; celui-ci reste plein, sinon on verrait le fond à mi-chemin.
      return {};
  }
}

export function Transitioned({ cut, outCut, duration, accent, u, children }: { cut: RenderCut; outCut: RenderCut | null; duration: number; accent: string; u: number; children: ReactNode }) {
  const frame = useCurrentFrame();
  const tIn = progress(frame, 0, cut.frames);
  const tOut = outCut ? progress(frame, duration - outCut.frames, outCut.frames) : 0;
  const entering = cut.frames > 0 && frame < cut.frames;
  const leaving = outCut != null && frame >= duration - outCut.frames;
  const enter = entering ? enterStyle(cut, tIn, u) : {};
  const exit = leaving ? exitStyle(outCut!.type, tOut, u) : {};
  // Les deux mouvements se composent (un plan très court peut entrer et sortir à la fois).
  const transform = [enter.transform, exit.transform].filter(Boolean).join(" ") || undefined;
  const filter = [enter.filter, exit.filter].filter(Boolean).join(" ") || undefined;
  const opacity = (typeof enter.opacity === "number" ? enter.opacity : 1) * (typeof exit.opacity === "number" ? exit.opacity : 1);
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={{ ...enter, ...exit, transform, filter, opacity }}>{children}</AbsoluteFill>
      {entering && cut.type === "flash" && <AbsoluteFill style={{ background: accent, opacity: 1 - Math.abs(2 * tIn - 1) }} />}
    </AbsoluteFill>
  );
}
