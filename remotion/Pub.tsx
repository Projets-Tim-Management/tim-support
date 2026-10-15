import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Audio, Easing, Img, interpolate, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";

import type { Rect } from "../modules/ads/lib/framing";
import type { RenderPhone, RenderProps, RenderShot, RenderStyle } from "../modules/ads/video/props";
import { layoutShots } from "../modules/ads/video/transitions";
import { useFamily } from "./fonts";
import { AnimatedLogo } from "./logo";
import { Elements } from "./elements";
import { Transitioned } from "./transitions";

/**
 * Une pub vidéo, dessinée à partir de sa partition résolue (plan Publicité,
 * §9 sexies, D3). Chaque plan est une séquence ; le style décide de la forme
 * (ouverture, écran de l'app, sous-titres, preuve, fin), la palette et les
 * logos viennent du Kit de marque. Un écran de l'app n'est jamais rogné hors
 * de sa zone utile, et un zoom ne sort jamais de la zone à ne jamais couper
 * (vérifié en amont, modules/ads/video/score.ts).
 */

type Ctx = { p: RenderProps; title: string; body: string; u: number };

/**
 * Le texte de base du moteur, posé à la racine : sans lui, l'aperçu EN DIRECT
 * (joué dans la page d'administration) hériterait de l'interligne fixe du
 * back-office, et les lignes d'un gros texte se chevaucheraient. La vidéo
 * rendue et l'aperçu doivent être identiques.
 */
const BASE_TEXT: CSSProperties = { lineHeight: 1.25, letterSpacing: "normal", textAlign: "left", fontWeight: 400, whiteSpace: "normal", wordSpacing: "normal" };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/** Le rythme du style : à quelle vitesse les mots et les entrées arrivent. */
const PACE = { pose: 1.4, dynamique: 1, rapide: 0.7 } as const;

/** Règle de la marque : un léger arrondi partout, jamais d'angle vif ni de pilule (voir elements.tsx). */
function radius(style: RenderStyle, u: number): number {
  return (style.corners === "carres" ? 11 : 18) * u;
}

/** Les couleurs d'un plan sans vidéo, selon les fonds du style. */
function surface(p: RenderProps, role: "ouverture" | "preuve" | "fin"): { bg: string; fg: string; accent: string } {
  const { palette: c, style } = p;
  if (style.background === "clair") return { bg: c.lightBg, fg: c.textOnLight, accent: c.accent };
  if (style.background === "aplats" && role === "ouverture") return { bg: c.accent, fg: c.textOnDark, accent: c.darkBg };
  return { bg: c.darkBg, fg: c.textOnDark, accent: c.accent };
}

/** La clarté d'une couleur (#RRGGBB), de 0 (noir) à 1 (blanc) : au-delà de 0,4, on écrit en sombre dessus. */
function luminance(hex: string): number {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return 0;
  const v = parseInt(m[1], 16);
  const lin = (c: number) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin((v >> 16) & 255) + 0.7152 * lin((v >> 8) & 255) + 0.0722 * lin(v & 255);
}

/** Une couleur du kit (#RRGGBB) rendue transparente : le voile d'un fond prend la teinte de la marque, pas un gris. */
function tint(hex: string, alpha: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return `rgba(0,0,0,${alpha})`;
  const v = parseInt(m[1], 16);
  return `rgba(${(v >> 16) & 255},${(v >> 8) & 255},${v & 255},${alpha})`;
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
  const frame = useCurrentFrame();
  const upper = p.style.titleUpper ? "uppercase" : "none";
  const subIn = interpolate(frame, [shot.frames * 0.45, shot.frames * 0.45 + 8], [0, 1], clamp);
  const underline = p.style.graphics.includes("soulignements");

  if (p.style.opening === "aplat-probleme") {
    const size = 150 * u;
    return (
      <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "flex-end", padding: 80 * u }}>
        <div style={{ fontFamily: title, fontSize: size, lineHeight: 0.9, textTransform: upper }}>{shot.text}</div>
        {shot.sub && <div style={{ fontFamily: body, fontWeight: 800, fontSize: 44 * u, lineHeight: 1.2, marginTop: 36 * u, maxWidth: "80%", opacity: subIn }}>{shot.sub}</div>}
      </AbsoluteFill>
    );
  }
  if (p.style.opening === "titre-pose") {
    return (
      <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "center", padding: 90 * u, gap: 40 * u }}>
        {p.style.graphics.includes("pastilles") && <Dots color={p.palette.accent} u={u} />}
        <div style={{ fontFamily: title, fontWeight: 800, fontSize: 92 * u, lineHeight: 1.06, letterSpacing: "-0.02em", textTransform: upper }}>{shot.text}</div>
        {shot.sub && <div style={{ fontFamily: body, fontWeight: 500, fontSize: 44 * u, lineHeight: 1.35, opacity: 0.85 * subIn }}>{shot.sub}</div>}
      </AbsoluteFill>
    );
  }
  const size = 118 * u;
  return (
    <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "center", padding: 80 * u }}>
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
  const zoomTo = p.style.zoomOnGesture ? shot.zoom : null;
  const progress = interpolate(frame, [shot.frames * 0.35, shot.frames * 0.85], [0, 1], { ...clamp, easing: ease });
  const bg = p.style.background === "clair" ? p.palette.lightBg : p.palette.darkBg;

  if (p.style.phoneFrame === "ecran-seul") {
    // Bord à bord quand la zone protégée tient ; sinon la zone utile entière, sur le fond.
    if (shot.cover) {
      return (
        <AbsoluteFill style={{ background: bg }}>
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
    <AbsoluteFill style={{ background: bg }}>
      {p.style.graphics.includes("pastilles") && <Dots color={p.palette.accent} u={u} />}
      <div
        style={{
          position: "absolute",
          left: (width - pw) / 2 - bezel,
          top: top - bezel + float,
          width: pw + bezel * 2,
          height: ph + bezel * 2,
          padding: bezel,
          borderRadius: bezel ? 64 * u : 18 * u,
          background: "#0b0d1c",
          boxShadow: bezel ? `0 ${40 * u}px ${90 * u}px -${30 * u}px rgba(0,0,0,0.55)` : "none",
          transform: `rotate(${tilt}deg)`,
        }}
      >
        <div style={{ position: "relative", width: pw, height: ph, borderRadius: bezel ? 48 * u : 18 * u, overflow: "hidden", background: "#000" }}>
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
  const frame = useCurrentFrame();
  const t = interpolate(frame, [0, 10], [0, 1], { ...clamp, easing: ease });
  if (p.style.proof === "ligne") {
    return (
      <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "center", alignItems: "center", padding: 90 * u, textAlign: "center" }}>
        <div style={{ fontFamily: body, fontWeight: 800, fontSize: 60 * u, lineHeight: 1.2 }}>{shot.label}</div>
      </AbsoluteFill>
    );
  }
  const big = p.style.proof === "chiffre-geant";
  return (
    <AbsoluteFill style={{ background: s.bg, color: s.fg, justifyContent: "center", padding: 90 * u, gap: 24 * u }}>
      <div style={{ fontFamily: title, fontWeight: 800, fontSize: (big ? 260 : 190) * u, lineHeight: 0.9, color: big ? s.accent : s.fg, transform: `scale(${0.92 + 0.08 * t})`, transformOrigin: "left center" }}>{shot.value}</div>
      <div style={{ fontFamily: body, fontWeight: 700, fontSize: 48 * u, lineHeight: 1.25 }}>{shot.label}</div>
      {!big && <div style={{ fontFamily: body, fontWeight: 500, fontSize: 30 * u, opacity: 0.7 }}>Source : {shot.source}</div>}
    </AbsoluteFill>
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
  // En deux temps (15/10/2026) : le logo en grand, qui s'approche ; puis la caméra descend vers l'offre et le bouton.
  const { height } = p;
  const zoom = interpolate(frame, [0, shot.frames * 0.5], [0.9, 1.08], { ...clamp, easing: Easing.out(Easing.cubic) });
  const pan = interpolate(frame, [shot.frames * 0.4, shot.frames * 0.62], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) });
  const logoH = 260 * u;
  const appear = (d: number) => interpolate(frame, [shot.frames * 0.5 + d, shot.frames * 0.5 + d + 10], [0, 1], { ...clamp, easing: ease });
  return (
    <AbsoluteFill style={{ background: bg, color: fg, textAlign: "center", overflow: "hidden" }}>
      <AbsoluteFill style={{ transform: `translateY(${-pan * height * 0.2}px)` }}>
        <div style={{ position: "absolute", left: 0, right: 0, top: height / 2 - logoH / 2, height: logoH, display: "flex", justifyContent: "center", alignItems: "center", transform: `scale(${zoom * (1 - 0.35 * pan)})` }}>
          {p.showLogo && p.logoAnimated && p.style.logoAnimation !== "aucune" ? (
            <AnimatedLogo ctx={ctx} height={logoH} onDark={!light} frames={Math.round(shot.frames * 0.4)} />
          ) : (
            p.showLogo && logo && <Img src={logo} style={{ height: logoH, width: "auto", opacity: t(0) }} />
          )}
        </div>
        <div style={{ position: "absolute", left: 90 * u, right: 90 * u, top: height / 2 + logoH * 0.55 + 40 * u, display: "flex", flexDirection: "column", alignItems: "center", gap: 40 * u }}>
          {shot.line && <div style={{ fontFamily: title, fontWeight: 800, fontSize: 84 * u, lineHeight: 1.05, letterSpacing: "0.015em", textTransform: upper, opacity: appear(0), transform: `translateY(${(1 - appear(0)) * 30 * u}px)` }}>{shot.line}</div>}
          <div style={{ ...pill, opacity: appear(5), transform: `scale(${0.9 + 0.1 * appear(5)})` }}>{p.cta}</div>
          <div style={{ fontFamily: body, fontWeight: 600, fontSize: 34 * u, opacity: 0.75 * appear(10) }}>{p.url}</div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

/**
 * Un plan composé : son fond (le style, une couleur, un passage de rush net ou
 * flouté, une image), un voile s'il en faut un, puis les éléments animés.
 */
function Compo({ shot, ctx }: { shot: Extract<RenderShot, { kind: "compo" }>; ctx: Ctx }) {
  const { p } = ctx;
  const frame = useCurrentFrame();
  const { width, height } = p;
  const f = shot.fond;
  const lightStyle = p.style.background === "clair";
  let ink = lightStyle ? p.palette.textOnLight : p.palette.textOnDark;
  let layer: ReactNode = <AbsoluteFill style={{ background: lightStyle ? p.palette.lightBg : p.palette.darkBg }} />;
  if (f.type === "couleur") {
    ink = luminance(f.color) > 0.4 ? p.palette.textOnLight : p.palette.textOnDark;
    layer = <AbsoluteFill style={{ background: f.color }} />;
  } else if (f.type === "rush") {
    ink = p.palette.textOnDark;
    const asShot = { kind: "rush" as const, frames: shot.frames, src: f.src, srcAspect: f.srcAspect, fromSec: f.fromSec, playbackRate: f.playbackRate, crop: f.crop, cover: f.cover, zoom: null, caption: null };
    // Un fond flouté n'est pas figé : il avance lentement vers nous pendant le plan.
    // La caméra : de la vue de départ vers son cadre, en douceur (une poussée de cinéma, pas un saut).
    const cam = f.camera ? interpolate(frame, [f.camera.from, Math.max(f.camera.from + 1, f.camera.until)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 0;
    const blur: CSSProperties = f.flou ? { filter: `blur(${18 * ctx.u}px)`, transform: `scale(${1.08 + 0.07 * (frame / Math.max(1, shot.frames))})` } : {};
    if (f.zoom || f.cover) {
      layer = (
        <AbsoluteFill style={{ background: p.palette.darkBg, ...blur }}>
          <VideoView shot={asShot} base={f.zoom ?? f.cover!} bound={f.crop} w={width} h={height} zoomTo={f.camera?.to ?? null} progress={cam} />
        </AbsoluteFill>
      );
    } else {
      // La zone utile entière, centrée sur le fond sombre : rien n'est rogné.
      const ca = (f.crop.w * f.srcAspect) / f.crop.h;
      const aspect = width / height;
      const dw = ca > aspect ? width : height * ca;
      const dh = ca > aspect ? width / ca : height;
      layer = (
        <AbsoluteFill style={{ background: p.palette.darkBg, ...blur }}>
          <div style={{ position: "absolute", left: (width - dw) / 2, top: (height - dh) / 2, width: dw, height: dh, overflow: "hidden" }}>
            <VideoView shot={asShot} base={f.crop} bound={f.crop} w={dw} h={dh} zoomTo={f.camera?.to ?? null} progress={cam} />
          </div>
        </AbsoluteFill>
      );
    }
  } else if (f.type === "image") {
    ink = p.palette.textOnDark;
    layer = (
      <AbsoluteFill style={{ background: p.palette.darkBg }}>
        <Img src={f.src} style={{ width: "100%", height: "100%", objectFit: "cover", ...(f.flou ? { filter: `blur(${18 * ctx.u}px)`, transform: "scale(1.08)" } : {}) }} />
      </AbsoluteFill>
    );
  }
  if (f.type === "telephone") {
    const bg = f.color ?? (lightStyle ? p.palette.lightBg : p.palette.darkBg);
    ink = luminance(bg) > 0.4 ? p.palette.textOnLight : p.palette.textOnDark;
    layer = <AbsoluteFill style={{ background: bg }} />;
  }
  const veil = f.type === "rush" || f.type === "image" ? f.voile : 0;
  // La couleur pleine du fond, s'il en a une : les éléments évitent de s'y fondre.
  const plain = f.type === "couleur" ? f.color : f.type === "telephone" ? (f.color ?? (lightStyle ? p.palette.lightBg : p.palette.darkBg)) : f.type === "style" ? (lightStyle ? p.palette.lightBg : p.palette.darkBg) : undefined;
  const ectx = { ...ctx, bg: plain };
  // Un élément qui arrive en « impact » secoue le fond, brièvement : on sent le choc.
  const shake = shot.elements
    .filter((e) => e.entree === "impact")
    .reduce((a, e) => {
      const k = frame - e.from - 4;
      return k >= 0 && k < 12 ? a + Math.sin(k * 2.6) * (1 - k / 12) * 14 * ctx.u : a;
    }, 0);
  // La caméra : le fond bouge pleinement, le téléphone aux trois quarts, les éléments à moitié (la profondeur).
  const cam = cameraAt(shot.camera ?? null, frame, shot.frames, width, height);
  // En suivi, toute la scène bouge d'un bloc (on va VERS un élément) ; le fond et le téléphone se floutent pendant le trajet.
  const at = (depth: number, blurred = false): CSSProperties | undefined => {
    if (!cam) return undefined;
    const d = cam.follow ? 1 : depth;
    return { transform: `translate(${cam.x * d}px, ${cam.y * d}px) scale(${1 + (cam.scale - 1) * d}) rotate(${(cam.rotate ?? 0) * d}deg)`, ...(blurred && cam.blur ? { filter: `blur(${cam.blur * ctx.u}px)` } : {}) };
  };
  const bgMove = cam ? `translate(${cam.x}px, ${cam.y}px) scale(${cam.follow ? cam.scale * 1.15 : cam.scale * 1.1}) rotate(${cam.rotate ?? 0}deg)` : "";
  const bgShake = shake ? `translate(${shake}px, ${shake * -0.6}px) scale(1.02)` : "";
  return (
    <AbsoluteFill style={{ overflow: "hidden" }}>
      <AbsoluteFill style={bgMove || bgShake ? { transform: `${bgMove} ${bgShake}`, ...(cam?.blur ? { filter: `blur(${cam.blur * ctx.u}px)` } : {}) } : undefined}>
        {layer}
        {f.halo && <Halo ctx={ctx} frame={frame} dark={plain != null && luminance(plain) <= 0.4} />}
      </AbsoluteFill>
      {veil > 0 && <AbsoluteFill style={{ background: tint(p.palette.darkBg, veil) }} />}
      {f.type === "telephone" ? (
        <>
          <AbsoluteFill style={at(0.9, true)}>
            <Elements elements={shot.elements.filter((e) => e.derriere)} ctx={ectx} shotFrames={shot.frames} ink={ink} />
          </AbsoluteFill>
          <AbsoluteFill style={at(0.7, true)}>
            <PhoneLayer f={f} ctx={ctx} frames={shot.frames} shake={shake} />
          </AbsoluteFill>
          <AbsoluteFill style={at(0.45)}>
            <Elements elements={shot.elements.filter((e) => !e.derriere)} ctx={ectx} shotFrames={shot.frames} ink={ink} />
          </AbsoluteFill>
        </>
      ) : (
        <AbsoluteFill style={at(0.45)}>
          <Elements elements={shot.elements} ctx={ectx} shotFrames={shot.frames} ink={ink} />
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
}

/** Des halos doux aux couleurs du kit, qui dérivent lentement : un fond plein qui vit, sans motif ni trait. */
function Halo({ ctx, frame, dark }: { ctx: Ctx; frame: number; dark: boolean }) {
  const { p } = ctx;
  const a = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
  const drift = (k: number) => Math.sin(frame / 45 + k) * 6;
  const accent = `${p.palette.accent}${a(dark ? 0.28 : 0.16)}`;
  const second = `${dark ? p.palette.lightBg : p.palette.primary}${a(dark ? 0.1 : 0.12)}`;
  return (
    <AbsoluteFill
      style={{
        background: [
          `radial-gradient(circle at ${82 + drift(0)}% ${14 + drift(1)}%, ${accent} 0%, transparent 42%)`,
          `radial-gradient(circle at ${12 + drift(2)}% ${88 + drift(3)}%, ${second} 0%, transparent 48%)`,
        ].join(", "),
      }}
    />
  );
}

/** Où en est la caméra d'un plan : un décalage (px) et un grossissement, du début à la fin du plan, en douceur. */
type CameraState = { x: number; y: number; scale: number; blur?: number; follow?: boolean; rotate?: number };
type ShotCamera = { move: string; amplitude: number; points?: { x: number; y: number; at: number; scale: number; rotate: number }[] };

/** La caméra en suivi : elle fonce vers chaque point à son heure (≈ 0,3 s), le garde, puis repart ; le fond se floute pendant le trajet. */
function followAt(points: NonNullable<ShotCamera["points"]>, frame: number, width: number, height: number): CameraState {
  const reach = (q: { x: number; y: number; scale: number; rotate: number }) => ({ x: -(q.x - 0.5) * width * q.scale, y: -(q.y - 0.5) * height * q.scale, scale: q.scale, rotate: q.rotate });
  let from = { x: 0, y: 0, scale: 1, rotate: 0 };
  let state = from;
  let blur = 0;
  for (const q of points) {
    if (frame < q.at) break;
    const to = reach(q);
    const k = interpolate(frame, [q.at, q.at + 9], [0, 1], { ...clamp, easing: Easing.out(Easing.cubic) });
    const mix = (a: number, b: number) => a + (b - a) * k;
    state = { x: mix(from.x, to.x), y: mix(from.y, to.y), scale: mix(from.scale, to.scale), rotate: mix(from.rotate, to.rotate) };
    blur = Math.sin(Math.PI * k) * 14;
    from = to;
  }
  // Tant qu'on est rapproché, le fond reste légèrement flou : l'élément visé ressort.
  const hold = state.scale > 1.05 ? 5 : 0;
  return { ...state, blur: Math.max(blur, hold), follow: true };
}

function cameraAt(camera: ShotCamera | null, frame: number, frames: number, width: number, height = width): CameraState | null {
  if (!camera) return null;
  if (camera.move === "suivi") return camera.points?.length ? followAt(camera.points, frame, width, height) : null;
  const k = interpolate(frame, [0, Math.max(1, frames)], [-1, 1], { ...clamp, easing: Easing.inOut(Easing.sin) });
  const d = 0.045 * width * camera.amplitude;
  switch (camera.move) {
    case "droite":
      return { x: -k * d, y: 0, scale: 1 };
    case "gauche":
      return { x: k * d, y: 0, scale: 1 };
    case "descente":
      return { x: 0, y: -k * d, scale: 1 };
    case "montee":
      return { x: 0, y: k * d, scale: 1 };
    case "avance":
      return { x: 0, y: 0, scale: 1 + (k + 1) * 0.05 * camera.amplitude };
    case "recul":
      return { x: 0, y: 0, scale: 1 + (1 - k) * 0.05 * camera.amplitude };
    default:
      return null;
  }
}

/**
 * Le téléphone d'un plan composé : l'écran filmé (zone utile entière) dans
 * son boîtier, qui entre en 3D (il monte en se redressant, ou bascule), flotte,
 * et peut plonger vers un point de l'écran — le point reste immobile, l'écran
 * grossit autour : un doigt posé dessus tombe juste.
 */
function PhoneLayer({ f, ctx, frames, shake }: { f: RenderPhone; ctx: Ctx; frames: number; shake: number }) {
  const { p, u } = ctx;
  const frame = useCurrentFrame();
  const { width, height } = p;
  const ph = f.height * height;
  const pw = ph * ((f.crop.w * f.srcAspect) / f.crop.h);
  const bezel = 16 * u;
  const left = f.x * width - pw / 2;
  const top = f.y * height - ph / 2;
  const len = 20 * PACE[p.style.pace];
  const k = f.entry === "aucune" ? 1 : interpolate(frame, [0, len], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.1)) });
  const float = Math.sin(frame / 22) * 8 * u;
  const pose =
    f.entry === "monte"
      ? `translateY(${(1 - k) * height * 0.9}px) rotateX(${(1 - k) * 38}deg) rotateZ(${(1 - k) * -12}deg)`
      : f.entry === "bascule"
        ? `rotateY(${(1 - k) * 70}deg) scale(${0.8 + 0.2 * k})`
        : "";
  const z = f.focus ? interpolate(frame, [f.focus.from, Math.max(f.focus.from + 1, f.focus.until)], [0, 1], { ...clamp, easing: Easing.inOut(Easing.cubic) }) : 0;
  const scale = f.focus ? 1 + (f.focus.scale - 1) * z : 1;
  // Le point de plongée, dans le cadre : là où il est sur l'écran filmé.
  const ox = left + (f.focus?.x ?? 0.5) * pw;
  const oy = top + (f.focus?.y ?? 0.5) * ph;
  // En plongée, le téléphone se remet de face (on lit l'écran) et cesse de flotter.
  const tilt = f.tilt * (1 - z);
  const asShot = { kind: "rush" as const, frames, src: f.src, srcAspect: f.srcAspect, fromSec: f.fromSec, playbackRate: f.playbackRate, crop: f.crop, cover: null, zoom: null, caption: null };
  return (
    <AbsoluteFill style={{ transform: `translate(${shake * 0.5}px, 0) scale(${scale})`, transformOrigin: `${ox}px ${oy}px` }}>
      <AbsoluteFill style={{ perspective: 2200 * u }}>
        <div
          style={{
            position: "absolute",
            left: left - bezel,
            top: top - bezel + float * (1 - z),
            width: pw + bezel * 2,
            height: ph + bezel * 2,
            padding: bezel,
            borderRadius: 70 * u,
            background: "#0b0d1c",
            boxShadow: `0 ${50 * u}px ${110 * u}px -${30 * u}px rgba(0,0,0,0.6), 0 0 0 ${3 * u}px rgba(255,255,255,0.08)`,
            transform: `${pose} rotateY(${tilt}deg)`,
            transformStyle: "preserve-3d",
          }}
        >
          <div style={{ position: "relative", width: pw, height: ph, borderRadius: 54 * u, overflow: "hidden", background: "#000" }}>
            <VideoView shot={asShot} base={f.crop} bound={f.crop} w={pw} h={ph} zoomTo={null} progress={0} />
          </div>
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

function ShotView({ shot, ctx }: { shot: RenderShot; ctx: Ctx }): ReactNode {
  if (shot.kind === "ouverture") return <Opening shot={shot} ctx={ctx} />;
  if (shot.kind === "rush") return <Rush shot={shot} ctx={ctx} />;
  if (shot.kind === "preuve") return <Proof shot={shot} ctx={ctx} />;
  if (shot.kind === "logo") return <LogoShot ctx={ctx} frames={shot.frames} />;
  if (shot.kind === "compo") return <Compo shot={shot} ctx={ctx} />;
  return <End shot={shot} ctx={ctx} />;
}

export const Pub: React.FC<RenderProps> = (p) => {
  const title = useFamily(p.style.titleFont);
  const body = useFamily(p.style.bodyFont);
  const { durationInFrames } = useVideoConfig();
  const ctx: Ctx = { p, title, body, u: p.width / 1080 };
  // Où chaque plan se dessine : sa place, élargie de la moitié de ses transitions (les plans se chevauchent sur la coupe).
  const cuts = p.cuts ?? p.shots.map(() => ({ type: "coupe" as const, frames: 0 }));
  const slots = layoutShots(p.shots.map((x) => x.frames), cuts);
  return (
    <AbsoluteFill style={{ background: p.palette.darkBg, ...BASE_TEXT }}>
      {p.shots.map((shot, i) => (
        <Sequence key={i} from={slots[i].from} durationInFrames={slots[i].duration} premountFor={15} name={`${i + 1}. ${shot.kind}`}>
          <Transitioned cut={cuts[i]} outCut={slots[i].outCut} duration={slots[i].duration} accent={p.palette.accent} u={ctx.u}>
            {/* Le plan se dessine sur toute sa place, transitions comprises : ses éléments restent là pendant qu'il sort. */}
            <ShotView shot={{ ...shot, frames: slots[i].duration }} ctx={ctx} />
          </Transitioned>
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
    <AbsoluteFill style={{ background: bg, color: fg, ...BASE_TEXT }}>
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
