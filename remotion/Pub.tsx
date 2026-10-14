import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";

import type { Rect } from "../modules/ads/lib/framing";
import type { RenderProps, RenderShot, RenderStyle } from "../modules/ads/video/props";
import { useFamily } from "./fonts";
import { SceneView } from "./scenes";

/**
 * Une pub vidéo, dessinée à partir de sa partition résolue (plan Publicité,
 * §9 sexies, D3). Chaque plan est une séquence ; le style décide de la forme
 * (ouverture, écran de l'app, sous-titres, preuve, fin), la palette et les
 * logos viennent du Kit de marque. Un écran de l'app n'est jamais rogné hors
 * de sa zone utile, et un zoom ne sort jamais de la zone à ne jamais couper
 * (vérifié en amont, modules/ads/video/score.ts).
 */

type Ctx = { p: RenderProps; title: string; body: string; u: number };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Le rythme du style : à quelle vitesse les mots et les entrées arrivent. */
const PACE = { pose: 1.4, dynamique: 1, rapide: 0.7 } as const;

function radius(style: RenderStyle, u: number): number {
  return style.corners === "carres" ? 0 : style.corners === "pilule" ? 9999 : 34 * u;
}

/** Les couleurs d'un plan sans vidéo, selon les fonds du style. */
function surface(p: RenderProps, role: "ouverture" | "preuve" | "fin"): { bg: string; fg: string; accent: string } {
  const { palette: c, style } = p;
  if (style.background === "clair") return { bg: c.lightBg, fg: c.textOnLight, accent: c.accent };
  if (style.background === "aplats" && role === "ouverture") return { bg: c.accent, fg: c.textOnDark, accent: c.darkBg };
  return { bg: c.darkBg, fg: c.textOnDark, accent: c.accent };
}

/** L'entrée d'un plan : coupe sèche, glissé ou zoom, selon le style. */
function useEnter(style: RenderStyle): CSSProperties {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 9 * PACE[style.pace]], [0, 1], { ...clamp, easing: ease });
  const kind = style.transitions[0] ?? "coupe";
  if (kind === "glisse") return { opacity: t, transform: `translateX(${(1 - t) * 6}%)` };
  if (kind === "zoom") return { transform: `scale(${1.07 - 0.07 * t})` };
  return {};
}

/** Les pastilles du logo TIM, en motif discret dans un coin. */
function Dots({ color, u }: { color: string; u: number }) {
  const d = 22 * u;
  return (
    <div style={{ position: "absolute", top: 70 * u, left: 70 * u, display: "grid", gridTemplateColumns: `repeat(2, ${d}px)`, gap: 11 * u }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ width: d, height: d, borderRadius: i === 1 ? "50% 50% 50% 0" : "50%", background: color }} />
      ))}
    </div>
  );
}

/** Des mots qui arrivent un à un, sur une part du plan. */
function Words({ text, highlight, start, end, color, accent, underline, u, size, beat }: { text: string; highlight: string | null; start: number; end: number; color: string; accent: string; underline: boolean; u: number; size: number; beat?: number | null }) {
  const frame = useCurrentFrame();
  const words = text.split(/\s+/).filter(Boolean);
  const hl = (highlight ?? "").toLowerCase();
  return (
    <span>
      {words.map((w, i) => {
        const even = lerp(start, end, words.length > 1 ? i / (words.length - 1) : 0);
        // Sur une musique au tempo connu, chaque mot tombe sur un demi-temps (le plan commence sur un temps).
        const at = beat ? Math.max(i, Math.round(even / (beat / 2))) * (beat / 2) : even;
        const t = interpolate(frame, [at, at + 6], [0, 1], { ...clamp, easing: ease });
        const marked = hl && w.toLowerCase().replace(/[.,!?;:]/g, "").includes(hl.split(/\s+/)[0]);
        return (
          <span key={i} style={{ display: "inline-block", opacity: t, transform: `translateY(${(1 - t) * 0.35 * size}px)`, color: marked ? accent : color, marginRight: 0.28 * size, textDecoration: marked && underline ? `underline ${8 * u}px` : "none", textUnderlineOffset: 10 * u }}>
            {w}
          </span>
        );
      })}
    </span>
  );
}

function Opening({ shot, ctx }: { shot: Extract<RenderShot, { kind: "ouverture" }>; ctx: Ctx }) {
  const { p, title, body, u } = ctx;
  const s = surface(p, "ouverture");
  const enter = useEnter(p.style);
  const frame = useCurrentFrame();
  const upper = p.style.titleUpper ? "uppercase" : "none";
  const subIn = interpolate(frame, [shot.frames * 0.45, shot.frames * 0.45 + 8], [0, 1], clamp);
  const underline = p.style.graphics.includes("soulignements");

  if (p.style.opening === "aplat-probleme") {
    const size = 150 * u;
    return (
      <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "flex-end", padding: 80 * u, ...enter }}>
        <div style={{ fontFamily: title, fontSize: size, lineHeight: 0.9, textTransform: upper }}>{shot.text}</div>
        {shot.sub && <div style={{ fontFamily: body, fontWeight: 800, fontSize: 44 * u, lineHeight: 1.2, marginTop: 36 * u, maxWidth: "80%", opacity: subIn }}>{shot.sub}</div>}
      </AbsoluteFill>
    );
  }
  if (p.style.opening === "titre-pose") {
    return (
      <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "center", padding: 90 * u, gap: 40 * u, ...enter }}>
        {p.style.graphics.includes("pastilles") && <Dots color={p.palette.accent} u={u} />}
        <div style={{ fontFamily: title, fontWeight: 800, fontSize: 92 * u, lineHeight: 1.06, letterSpacing: "-0.02em", textTransform: upper }}>{shot.text}</div>
        {shot.sub && <div style={{ fontFamily: body, fontWeight: 500, fontSize: 44 * u, lineHeight: 1.35, opacity: 0.85 * subIn }}>{shot.sub}</div>}
      </AbsoluteFill>
    );
  }
  const size = 118 * u;
  return (
    <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "center", padding: 80 * u, ...enter }}>
      <div style={{ fontFamily: title, fontSize: size, lineHeight: 1.0, textTransform: upper }}>
        <Words text={shot.text} highlight={shot.highlight} start={4} end={shot.frames * 0.55 * PACE[p.style.pace]} color={s.fg} accent={s.accent} underline={underline} u={u} size={size} beat={p.music?.beatFrames} />
      </div>
      {shot.sub && <div style={{ fontFamily: body, fontWeight: 700, fontSize: 44 * u, marginTop: 30 * u, opacity: subIn }}>{shot.sub}</div>}
    </AbsoluteFill>
  );
}

/**
 * La vidéo d'un rush dans un cadre, montrant `view` (en proportions de
 * l'image). `base` a la proportion du cadre ; le zoom resserre la vue vers
 * `zoom` sans jamais sortir de `bound`.
 */
function VideoView({ shot, base, bound, w, h, zoomTo, progress }: { shot: Extract<RenderShot, { kind: "rush" }>; base: Rect; bound: Rect; w: number; h: number; zoomTo: Rect | null; progress: number }) {
  const { fps } = useVideoConfig();
  let view = base;
  if (zoomTo && progress > 0) {
    const k = lerp(1, Math.max(1, Math.min(base.w / zoomTo.w, base.h / zoomTo.h)), progress);
    const cx = lerp(base.x + base.w / 2, zoomTo.x + zoomTo.w / 2, progress);
    const cy = lerp(base.y + base.h / 2, zoomTo.y + zoomTo.h / 2, progress);
    const vw = base.w / k;
    const vh = base.h / k;
    view = {
      x: Math.min(Math.max(cx - vw / 2, bound.x), bound.x + bound.w - vw),
      y: Math.min(Math.max(cy - vh / 2, bound.y), bound.y + bound.h - vh),
      w: vw,
      h: vh,
    };
  }
  const imgW = w / view.w;
  const imgH = h / view.h;
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
      <OffthreadVideo
        src={shot.src}
        muted
        trimBefore={Math.round(shot.fromSec * fps)}
        playbackRate={shot.playbackRate}
        style={{ position: "absolute", width: imgW, height: imgH, left: -view.x * imgW, top: -view.y * imgH, maxWidth: "none" }}
      />
    </div>
  );
}

function Caption({ shot, ctx }: { shot: Extract<RenderShot, { kind: "rush" }>; ctx: Ctx }) {
  const { p, body, u } = ctx;
  const frame = useCurrentFrame();
  if (!shot.caption || p.style.subtitles === "aucun") return null;
  if (p.style.subtitles === "mot-a-mot") {
    const words = shot.caption.split(/\s+/).filter(Boolean);
    const start = shot.frames * 0.08;
    const end = shot.frames * 0.85;
    const step = (end - start) / Math.max(1, words.length);
    const current = Math.floor((frame - start) / step);
    return (
      <div style={{ position: "absolute", left: 60 * u, right: 60 * u, bottom: 90 * u, textAlign: "center", fontFamily: body, fontWeight: 800, fontSize: 54 * u, lineHeight: 1.2, color: p.palette.textOnDark, textShadow: `0 ${4 * u}px ${18 * u}px rgba(0,0,0,0.45)` }}>
        {words.map((w, i) => (
          <span key={i} style={{ opacity: i <= current ? 1 : 0, color: i === current ? p.palette.accent : p.palette.textOnDark, marginRight: 14 * u, display: "inline-block" }}>
            {w}
          </span>
        ))}
      </div>
    );
  }
  const t = interpolate(frame, [4, 12], [0, 1], clamp);
  const band = p.style.graphics.includes("bandeaux") ? p.palette.darkBg : p.style.background === "clair" ? p.palette.lightBg : p.palette.darkBg;
  const fg = band === "#FFFFFF" ? p.palette.textOnLight : p.palette.textOnDark;
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, padding: `${36 * u}px ${60 * u}px ${54 * u}px`, background: band, color: fg, fontFamily: body, fontWeight: 800, fontSize: 48 * u, lineHeight: 1.2, opacity: t, transform: `translateY(${(1 - t) * 30 * u}px)` }}>
      {shot.caption}
    </div>
  );
}

function Rush({ shot, ctx }: { shot: Extract<RenderShot, { kind: "rush" }>; ctx: Ctx }) {
  const { p, u } = ctx;
  const { width, height } = p;
  const frame = useCurrentFrame();
  const enter = useEnter(p.style);
  const zoomTo = p.style.zoomOnGesture ? shot.zoom : null;
  const progress = interpolate(frame, [shot.frames * 0.35, shot.frames * 0.85], [0, 1], { ...clamp, easing: ease });
  const bg = p.style.background === "clair" ? p.palette.lightBg : p.palette.darkBg;

  if (p.style.phoneFrame === "ecran-seul") {
    // Bord à bord quand la zone protégée tient ; sinon la zone utile entière, sur le fond.
    if (shot.cover) {
      return (
        <AbsoluteFill style={{ background: bg, ...enter }}>
          <VideoView shot={shot} base={shot.cover} bound={shot.crop} w={width} h={height} zoomTo={zoomTo} progress={progress} />
          <Caption shot={shot} ctx={ctx} />
        </AbsoluteFill>
      );
    }
  }
  // Dans un téléphone (ou zone utile entière) : la proportion de la zone utile, rien n'est rogné.
  const cropAspect = (shot.crop.w * shot.srcAspect) / shot.crop.h;
  const maxH = height * (height > width * 1.4 ? 0.72 : 0.8);
  const maxW = width * 0.78;
  let ph = maxH;
  let pw = ph * cropAspect;
  if (pw > maxW) {
    pw = maxW;
    ph = pw / cropAspect;
  }
  const bezel = p.style.phoneFrame === "ecran-seul" ? 0 : 18 * u;
  const tilt = p.style.phoneFrame === "incline" ? -6 : 0;
  const float = p.style.phoneFrame === "incline" ? Math.sin(frame / 18) * 10 * u : 0;
  const top = (height - ph) / 2 - (p.style.subtitles === "bandeau" && shot.caption ? 70 * u : 20 * u);
  return (
    <AbsoluteFill style={{ background: bg, ...enter }}>
      {p.style.graphics.includes("pastilles") && <Dots color={p.palette.accent} u={u} />}
      <div
        style={{
          position: "absolute",
          left: (width - pw) / 2 - bezel,
          top: top - bezel + float,
          width: pw + bezel * 2,
          height: ph + bezel * 2,
          padding: bezel,
          borderRadius: bezel ? 64 * u : 0,
          background: "#0b0d1c",
          boxShadow: bezel ? `0 ${40 * u}px ${90 * u}px -${30 * u}px rgba(0,0,0,0.55)` : "none",
          transform: `rotate(${tilt}deg)`,
        }}
      >
        <div style={{ position: "relative", width: pw, height: ph, borderRadius: bezel ? 48 * u : 0, overflow: "hidden", background: "#000" }}>
          <VideoView shot={shot} base={shot.crop} bound={shot.crop} w={pw} h={ph} zoomTo={zoomTo} progress={progress} />
        </div>
      </div>
      <Caption shot={shot} ctx={ctx} />
    </AbsoluteFill>
  );
}

function Proof({ shot, ctx }: { shot: Extract<RenderShot, { kind: "preuve" }>; ctx: Ctx }) {
  const { p, title, body, u } = ctx;
  const s = surface(p, "preuve");
  const enter = useEnter(p.style);
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: ease });
  if (p.style.proof === "ligne") {
    return (
      <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "center", alignItems: "center", padding: 90 * u, textAlign: "center", ...enter }}>
        <div style={{ fontFamily: body, fontWeight: 800, fontSize: 60 * u, lineHeight: 1.2 }}>{shot.label}</div>
      </AbsoluteFill>
    );
  }
  const big = p.style.proof === "chiffre-geant";
  return (
    <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "center", padding: 90 * u, gap: 24 * u, ...enter }}>
      <div style={{ fontFamily: title, fontWeight: 800, fontSize: (big ? 260 : 190) * u, lineHeight: 0.9, color: big ? s.accent : s.fg, transform: `scale(${0.92 + 0.08 * t})`, transformOrigin: "left center" }}>{shot.value}</div>
      <div style={{ fontFamily: body, fontWeight: 700, fontSize: 48 * u, lineHeight: 1.25 }}>{shot.label}</div>
      {!big && <div style={{ fontFamily: body, fontWeight: 500, fontSize: 30 * u, opacity: 0.7 }}>Source : {shot.source}</div>}
    </AbsoluteFill>
  );
}

/**
 * Le logo animé (SVG à calques, Kit de marque › Logos) : en « construction »,
 * les éléments du symbole arrivent un à un (sur les demi-temps de la musique
 * quand le tempo est connu), puis les lettres du nom, puis la signature ; en
 * « fondu », tout ensemble. Sur un fond sombre, le nom et la signature passent
 * à la couleur du texte sur fond sombre ; le symbole garde ses couleurs.
 */
function AnimatedLogo({ ctx, height, onDark, frames, still = false }: { ctx: Ctx; height: number; onDark: boolean; frames: number; still?: boolean }) {
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

/** Le logo seul, au centre : une signature (en ouverture par exemple). Animé s'il est déposé en SVG à calques, sinon l'image. */
function LogoShot({ ctx, frames }: { ctx: Ctx; frames: number }) {
  const { p, u } = ctx;
  const frame = useCurrentFrame();
  const light = p.style.background === "clair" && Boolean(p.logos.light || p.logoAnimated);
  const bg = light ? p.palette.lightBg : p.palette.darkBg;
  const img = light ? p.logos.light : (p.logos.dark ?? p.logos.light);
  const animated = p.logoAnimated && p.style.logoAnimation !== "aucune";
  return (
    <AbsoluteFill style={{ background: bg, justifyContent: "center", alignItems: "center" }}>
      {animated ? (
        <AnimatedLogo ctx={ctx} height={260 * u} onDark={!light} frames={frames} />
      ) : (
        img && <Img src={img} style={{ height: 220 * u, width: "auto", opacity: interpolate(frame, [0, 12], [0, 1], { ...clamp, easing: ease }) }} />
      )}
    </AbsoluteFill>
  );
}

function End({ shot, ctx }: { shot: Extract<RenderShot, { kind: "fin" }>; ctx: Ctx }) {
  const { p, title, body, u } = ctx;
  // Un fond clair sans logo couleur déposé : la fin passe sur fond sombre, où le logo blanc existe.
  const light = p.style.background === "clair" && Boolean(p.logos.light);
  const bg = light ? p.palette.lightBg : p.palette.darkBg;
  const fg = light ? p.palette.textOnLight : p.palette.textOnDark;
  const logo = light ? p.logos.light : (p.logos.dark ?? p.logos.light);
  const frame = useCurrentFrame();
  const t = (d: number) => interpolate(frame, [d, d + 10], [0, 1], { ...clamp, easing: ease });
  const upper = p.style.titleUpper ? "uppercase" : "none";
  const pill: CSSProperties = { background: p.palette.accent, color: p.palette.textOnDark, fontFamily: body, fontWeight: 800, fontSize: 46 * u, padding: `${26 * u}px ${54 * u}px`, borderRadius: radius(p.style, u) };
  return (
    <AbsoluteFill style={{ background: bg, color: fg, justifyContent: "center", alignItems: "center", textAlign: "center", padding: 90 * u, gap: 44 * u }}>
      {p.showLogo && p.logoAnimated && p.style.logoAnimation !== "aucune" ? (
        <AnimatedLogo ctx={ctx} height={130 * u} onDark={!light} frames={shot.frames} />
      ) : (
        p.showLogo && logo && <Img src={logo} style={{ height: 120 * u, width: "auto", opacity: t(0) }} />
      )}
      {shot.line && <div style={{ fontFamily: title, fontWeight: 800, fontSize: 78 * u, lineHeight: 1.05, textTransform: upper, opacity: t(4), maxWidth: "92%" }}>{shot.line}</div>}
      <div style={{ ...pill, opacity: t(8), transform: `scale(${0.9 + 0.1 * t(8)})` }}>{p.cta}</div>
      <div style={{ fontFamily: body, fontWeight: 600, fontSize: 34 * u, opacity: 0.75 * t(12) }}>{p.url}</div>
    </AbsoluteFill>
  );
}

function ShotView({ shot, ctx }: { shot: RenderShot; ctx: Ctx }): ReactNode {
  if (shot.kind === "ouverture") return <Opening shot={shot} ctx={ctx} />;
  if (shot.kind === "rush") return <Rush shot={shot} ctx={ctx} />;
  if (shot.kind === "preuve") return <Proof shot={shot} ctx={ctx} />;
  if (shot.kind === "logo") return <LogoShot ctx={ctx} frames={shot.frames} />;
  if (shot.kind === "scene") return <SceneView shot={shot} ctx={ctx} />;
  return <End shot={shot} ctx={ctx} />;
}

export const Pub: React.FC<RenderProps> = (p) => {
  const title = useFamily(p.style.titleFont);
  const body = useFamily(p.style.bodyFont);
  const { durationInFrames } = useVideoConfig();
  const ctx: Ctx = { p, title, body, u: p.width / 1080 };
  // L'image où commence chaque plan : la somme des plans qui le précèdent.
  const starts = p.shots.map((_, i) => p.shots.slice(0, i).reduce((t, x) => t + x.frames, 0));
  return (
    <AbsoluteFill style={{ background: p.palette.darkBg }}>
      {p.shots.map((shot, i) => (
        <Sequence key={i} from={starts[i]} durationInFrames={shot.frames} name={`${i + 1}. ${shot.kind}`}>
          <ShotView shot={shot} ctx={ctx} />
        </Sequence>
      ))}
      {p.music && (
        <Audio
          src={p.music.src}
          trimBefore={Math.round(p.music.startSec * p.fps)}
          volume={(f) => interpolate(f, [0, 10, durationInFrames - 20, durationInFrames], [0, 0.55, 0.55, 0], clamp)}
        />
      )}
    </AbsoluteFill>
  );
};

/**
 * L'affiche (image fixe) d'une créa, dans le style : l'accroche en haut, mot
 * fort en couleur ; l'écran de l'app au milieu (zone utile entière, jamais
 * rognée) ; le logo, le bouton et l'adresse en bas. Elle remplace les anciens
 * gabarits dès qu'une créa a un rush.
 */
export const Affiche: React.FC<RenderProps> = (p) => {
  const title = useFamily(p.style.titleFont);
  const body = useFamily(p.style.bodyFont);
  const ctx: Ctx = { p, title, body, u: p.width / 1080 };
  const { width, height } = p;
  const u = ctx.u;
  const poster = p.poster!;
  const light = p.style.background === "clair";
  const bg = light ? p.palette.lightBg : p.palette.darkBg;
  const fg = light ? p.palette.textOnLight : p.palette.textOnDark;
  const upper = p.style.titleUpper ? "uppercase" : "none";
  const tall = height / width;
  const rush = poster.rush;
  // Les trois bandes : accroche, écran, signature. Sans rush, l'accroche prend la place.
  const textH = rush ? height * (tall > 1.4 ? 0.26 : 0.3) : height * 0.55;
  const footH = height * (tall > 1.4 ? 0.17 : 0.2);
  const phoneH = height - textH - footH;
  const size = Math.min(rush ? 104 : 140, (tall > 1.4 ? 104 : tall > 1.1 ? 88 : 76) * (rush ? 1 : 1.35)) * u;
  let ph = phoneH * 0.92;
  let pw = 0;
  if (rush) {
    const aspect = (rush.crop.w * rush.srcAspect) / rush.crop.h;
    pw = ph * aspect;
    if (pw > width * 0.8) {
      pw = width * 0.8;
      ph = pw / aspect;
    }
  }
  const bezel = rush && p.style.phoneFrame !== "ecran-seul" ? 16 * u : 0;
  const img = light ? p.logos.light : (p.logos.dark ?? p.logos.light);
  const animated = p.logoAnimated && p.style.logoAnimation !== "aucune";
  const pill: CSSProperties = { background: p.palette.accent, color: p.palette.textOnDark, fontFamily: body, fontWeight: 800, fontSize: 40 * u, padding: `${22 * u}px ${46 * u}px`, borderRadius: radius(p.style, u) };
  return (
    <AbsoluteFill style={{ background: bg, color: fg }}>
      {p.style.graphics.includes("pastilles") && <Dots color={p.palette.accent} u={u} />}
      <div style={{ position: "absolute", left: 80 * u, right: 80 * u, top: 0, height: textH, display: "flex", alignItems: rush ? "flex-end" : "center", paddingBottom: rush ? 30 * u : 0 }}>
        <div style={{ fontFamily: title, fontWeight: 800, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.02em", textTransform: upper }}>
          <Words text={poster.hook} highlight={poster.highlight} start={-100} end={-50} color={fg} accent={p.palette.accent} underline={p.style.graphics.includes("soulignements")} u={u} size={size} />
        </div>
      </div>
      {rush && (
        <div
          style={{
            position: "absolute",
            left: (width - pw) / 2 - bezel,
            top: textH + (phoneH - ph) / 2 - bezel,
            width: pw + bezel * 2,
            height: ph + bezel * 2,
            padding: bezel,
            borderRadius: bezel ? 56 * u : radius(p.style, u),
            background: "#0b0d1c",
            boxShadow: `0 ${36 * u}px ${80 * u}px -${30 * u}px rgba(0,0,0,0.5)`,
            transform: p.style.phoneFrame === "incline" ? "rotate(-5deg)" : undefined,
          }}
        >
          <div style={{ position: "relative", width: pw, height: ph, borderRadius: bezel ? 42 * u : radius(p.style, u), overflow: "hidden", background: "#000" }}>
            <VideoView shot={rush} base={rush.crop} bound={rush.crop} w={pw} h={ph} zoomTo={null} progress={0} />
          </div>
        </div>
      )}
      <div style={{ position: "absolute", left: 70 * u, right: 70 * u, bottom: 0, height: footH, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 30 * u }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 * u }}>
          {p.showLogo && animated ? <AnimatedLogo ctx={ctx} height={90 * u} onDark={!light} frames={1} still /> : p.showLogo && img ? <Img src={img} style={{ height: 80 * u, width: "auto" }} /> : null}
          <div style={{ fontFamily: body, fontWeight: 600, fontSize: 28 * u, opacity: 0.75 }}>{p.url}</div>
        </div>
        <div style={pill}>{p.cta}</div>
      </div>
    </AbsoluteFill>
  );
};
