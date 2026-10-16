import { Easing, interpolate, useCurrentFrame } from "remotion";

import type { RenderProps } from "../modules/ads/video/props";
import { clamp, ease } from "./motion";

/** Ce que le logo animé lit du contexte de rendu. */
type LogoCtx = { p: RenderProps };

/**
 * Le logo animé (SVG à calques, Kit de marque › Logos) : en « construction »,
 * les éléments du symbole arrivent un à un (sur les demi-temps de la musique
 * quand le tempo est connu), puis les lettres du nom, puis la signature ; en
 * « fondu », tout ensemble. Sur un fond sombre, le nom et la signature passent
 * à la couleur du texte sur fond sombre ; le symbole garde ses couleurs.
 */
export function AnimatedLogo({ ctx, height, onDark, frames, still = false }: { ctx: LogoCtx; height: number; onDark: boolean; frames: number; still?: boolean }) {
  const { p } = ctx;
  // Sur une affiche, le logo est montré construit : comme si l'animation était finie.
  const current = useCurrentFrame();
  const frame = still ? 100_000 : current;
  const logo = p.logoAnimated!;
  const build = p.style.logoAnimation === "construction";
  // La construction tient dans les 60 % du plan : sinon elle passe aux quarts, huitièmes de temps… (toujours sur la musique).
  const units = logo.symbol.length + logo.name.length * 0.6;
  let step = p.music?.beatFrames ? p.music.beatFrames / 2 : 4;
  while (step > 1.5 && units * step + 16 > frames * 0.6) step /= 2;
  const pop = (at: number) => interpolate(frame, [at, at + 8], [0, 1], { ...clamp, easing: Easing.out(Easing.back(2)) });
  const fade = (at: number) => interpolate(frame, [at, at + 10], [0, 1], { ...clamp, easing: ease });
  const nameStart = build ? logo.symbol.length * step : 0;
  const baseStart = build ? nameStart + logo.name.length * step * 0.6 + 6 : 4;
  const recolor = onDark ? p.palette.textOnDark : null;
  const inner = (html: string) => ({ __html: html });
  return (
    <svg viewBox={logo.viewBox} style={{ height, width: "auto", overflow: "visible" }}>
      {recolor && <style>{`.tl-recolor *{fill:${recolor} !important}`}</style>}
      {/* Les <defs> et <style> du fichier tels quels : un <defs> est valide à l'intérieur d'un groupe. */}
      {logo.defs && <g dangerouslySetInnerHTML={inner(logo.defs)} />}
      {logo.rest && <g style={{ opacity: fade(0) }} dangerouslySetInnerHTML={inner(logo.rest)} />}
      {logo.symbol.map((m, i) => {
        const k = build ? pop(i * step) : fade(0);
        return <g key={`s${i}`} style={{ opacity: Math.min(1, k * 1.5), transform: `scale(${build ? k : 1})`, transformBox: "fill-box", transformOrigin: "center" }} dangerouslySetInnerHTML={inner(m)} />;
      })}
      {logo.name.map((m, i) => {
        const k = build ? fade(nameStart + i * step * 0.6) : fade(2);
        return <g key={`n${i}`} className={recolor ? "tl-recolor" : undefined} style={{ opacity: k, transform: `translateY(${(1 - k) * 12}%)`, transformBox: "fill-box" }} dangerouslySetInnerHTML={inner(m)} />;
      })}
      {logo.baseline && <g className={recolor ? "tl-recolor" : undefined} style={{ opacity: fade(baseStart) }} dangerouslySetInnerHTML={inner(logo.baseline)} />}
    </svg>
  );
}

