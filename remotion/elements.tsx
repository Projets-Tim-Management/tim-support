import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { AbsoluteFill, continueRender, delayRender, Easing, interpolate, Sequence, useCurrentFrame } from "remotion";

import type { RenderElement, RenderProps } from "../modules/ads/video/props";
import { VALIDATION_GREEN } from "../modules/ads/video/element-params";
import { AnimatedLogo } from "./logo";

/**
 * Les éléments animés d'un plan composé (plan Publicité, §9 sexies, M2) :
 * sans fond, posés par-dessus le fond du plan — l'interface de TIM recréée,
 * des gestes, du texte, des chiffres sourcés, la marque, des formes.
 *
 * Chaque élément est dessiné à SA largeur (fraction du cadre), centré sur son
 * point (x, y), et vit dans sa propre séquence : son image 0 est son entrée.
 * Son allure vient de ses RÉGLAGES (modules/ads/video/element-params.ts),
 * ceux de sa variante dans l'atelier des éléments : surface, coins, ombre,
 * vitesse, rebond, et ce qui est propre à chacun. Le contenu vient de la
 * partition, déjà vérifiée (modules/ads/video/elements.ts).
 */

/** `bg` : la couleur pleine du fond du plan, quand il en a une (une couleur portée par l'élément ne doit pas s'y fondre). */
type Ctx = { p: RenderProps; title: string; body: string; u: number; bg?: string };
type Params = Record<string, string | number | boolean>;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
const PACE = { pose: 1.4, dynamique: 1, rapide: 0.7 } as const;
const t = (frame: number, at: number, len = 10, easing = ease) => interpolate(frame, [at, at + len], [0, 1], { ...clamp, easing });
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);
const num = (prm: Params, k: string, d: number) => (typeof prm[k] === "number" ? (prm[k] as number) : d);
const opt = (prm: Params, k: string, d: string) => (typeof prm[k] === "string" ? (prm[k] as string) : d);
const yes = (prm: Params, k: string, d: boolean) => (typeof prm[k] === "boolean" ? (prm[k] as boolean) : d);

/** L'image courante de l'élément, accélérée ou ralentie par son réglage « vitesse ». */
const useFrame = (e: RenderElement) => useCurrentFrame() * num(e.params, "vitesse", 1);
/** La courbe des entrées « pop » : le rebond vient du réglage. */
const popOf = (e: RenderElement) => {
  const r = num(e.params, "rebond", 1.8);
  return r > 0 ? Easing.out(Easing.back(r)) : ease;
};
/** Le pas entre deux entrées : un demi-temps de la musique, sinon le rythme du style. */
const stepOf = (p: RenderProps): number => (p.music?.beatFrames ? p.music.beatFrames / 2 : 7 * PACE[p.style.pace]);

/** Une couleur du kit, par son rôle. */
function colorOf(p: RenderProps, role: string): string {
  // Une couleur personnalisée (#RRGGBB) passe telle quelle.
  if (/^#[0-9a-f]{6}$/i.test(role)) return role;
  const c = p.palette;
  if (role === "validation") return VALIDATION_GREEN;
  return role === "principale" ? c.primary : role === "clair" ? c.lightBg : role === "sombre" ? c.darkBg : role === "texte-clair" ? c.textOnDark : role === "texte-sombre" ? c.textOnLight : c.accent;
}
/** La couleur d'une partie : celle de son réglage, ou `fallback` quand le réglage dit « auto » (ou n'existe pas). */
const pick = (p: RenderProps, prm: Params, key: string, fallback: string) => {
  const role = opt(prm, key, "auto");
  return role === "auto" ? fallback : colorOf(p, role);
};
/** Le texte lisible sur une couleur du kit. */
const onColor = (p: RenderProps, role: string) => {
  if (/^#[0-9a-f]{6}$/i.test(role)) {
    // Sur une couleur personnalisée : le texte sombre du kit si elle est claire, le clair sinon.
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(role.slice(i, i + 2), 16) / 255);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? p.palette.textOnLight : p.palette.textOnDark;
  }
  return role === "clair" ? p.palette.textOnLight : p.palette.textOnDark;
};

/** Les coins : ceux du style, ou ceux du réglage. */
/**
 * Règle de la marque (Charlie, 15/10/2026) : un LÉGER arrondi partout — jamais
 * d'angle vif, jamais de pilule ni de rond. Le réglage « coins » ne fait plus
 * que doser cet arrondi léger.
 */
function radiusOf(p: RenderProps, prm: Params, s: number, base = 34): number {
  const corners = opt(prm, "coins", "style");
  const kind = corners === "style" ? p.style.corners : corners;
  const r = base * s;
  return kind === "carres" ? r * 0.6 : r;
}

const SHADOW = { aucune: () => "none", douce: (s: number) => `0 ${16 * s}px ${44 * s}px -${18 * s}px rgba(0,0,0,0.35)`, forte: (s: number) => `0 ${36 * s}px ${90 * s}px -${36 * s}px rgba(0,0,0,0.55)` } as const;
const shadowOf = (prm: Params, s: number) => SHADOW[opt(prm, "ombre", "forte") as keyof typeof SHADOW]?.(s) ?? SHADOW.forte(s);

/** L'allure d'une surface (carte, bulle, étiquette) : couleur, coins, ombre, bordure — ou verre dépoli. */
function surface(p: RenderProps, prm: Params, s: number, base = 34, plain?: string): { style: CSSProperties; fg: string; line: string } {
  const c = p.palette;
  const kind = opt(prm, "surface", "clair");
  // Le verre est teinté du fond sombre du kit : translucide et flouté, mais le texte clair reste lisible sur un rush clair.
  const glass = /^#[0-9a-f]{6}$/i.test(c.darkBg) ? `${c.darkBg}8c` : "rgba(15,20,40,0.55)";
  const bg = kind === "sombre" ? c.darkBg : kind === "accent" ? c.accent : kind === "verre" ? glass : c.lightBg;
  const fg = pick(p, prm, "couleur_texte", kind === "clair" ? c.textOnLight : c.textOnDark);
  // Une carte de la couleur du fond s'y perdrait : un trait fin et une ombre plus marquée la détachent (règle du 15/10/2026).
  const blends = plain != null && plain.toLowerCase() === bg.toLowerCase();
  const border = blends ? "fine" : opt(prm, "bordure", kind === "verre" ? "fine" : "aucune");
  return {
    fg,
    line: `${fg}1f`,
    style: {
      background: bg,
      color: fg,
      borderRadius: radiusOf(p, prm, s, base),
      boxShadow: blends ? `0 ${24 * s}px ${60 * s}px -${20 * s}px rgba(15,20,50,0.35), 0 ${4 * s}px ${12 * s}px rgba(15,20,50,0.08)` : shadowOf(prm, s),
      border: border === "fine" ? `${Math.max(1, 2 * s)}px solid ${fg}33` : border === "accent" ? `${4 * s}px solid ${c.accent}` : "none",
      ...(kind === "verre" ? { backdropFilter: `blur(${24 * s}px)`, WebkitBackdropFilter: `blur(${24 * s}px)` } : {}),
    },
  };
}

function Check({ k, color, size, shape = "rond" }: { k: number; color: string; size: number; shape?: string }) {
  if (shape === "trait") return <div style={{ width: size, height: size * 0.16, borderRadius: size * 0.05, background: color, opacity: 0.25 + 0.75 * k, transform: `scaleX(${0.3 + 0.7 * k})`, flex: "none" }} />;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible", flex: "none" }}>
      {shape === "carre" ? (
        <rect x="1" y="1" width="22" height="22" rx="5" fill={k > 0 ? color : "none"} stroke={color} strokeWidth={2} opacity={0.35 + 0.65 * k} />
      ) : (
        <rect x="1" y="1" width="22" height="22" rx="5.5" fill={k > 0 ? color : "none"} stroke={color} strokeWidth={2} opacity={0.35 + 0.65 * k} />
      )}
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={16} strokeDashoffset={16 * (1 - k)} />
    </svg>
  );
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

type Props = { e: RenderElement; ctx: Ctx; s: number; w: number; frames: number; ink: string };

/** Une carte de l'app : la surface réglée, et un en-tête discret (si le réglage le veut). */
function Card({ e, ctx, s, title, children }: { e: RenderElement; ctx: Ctx; s: number; title?: string; children: ReactNode }) {
  const sf = surface(ctx.p, e.params, s, 38, ctx.bg);
  const header = title && yes(e.params, "en_tete", true);
  return (
    <div style={{ ...sf.style, overflow: "hidden" }}>
      {header && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 * s, padding: `${30 * s}px ${38 * s}px`, borderBottom: `${2 * s}px solid ${sf.line}` }}>
          <div style={{ width: 16 * s, height: 16 * s, borderRadius: "24%", background: pick(ctx.p, e.params, "couleur_point", ctx.p.palette.accent) }} />
          <div style={{ fontFamily: ctx.title, fontWeight: 800, fontSize: 38 * s }}>{title}</div>
        </div>
      )}
      <div style={{ padding: `${26 * s}px ${38 * s}px ${34 * s}px` }}>{children}</div>
    </div>
  );
}

/** L'avatar d'une ligne : initiales, silhouette, photo (Médias publicitaires, nature « Visage ») ou rien. */
function Avatar({ mode, name, color, face, size, font }: { mode: string; name: string; color: string; face: string | null; size: number; font: string }) {
  if (mode === "aucun") return null;
  const ring: CSSProperties = { width: size, height: size, flex: "none", borderRadius: "24%", overflow: "hidden", background: `${color}26`, display: "flex", alignItems: "center", justifyContent: "center" };
  if (mode === "photos" && face) {
    // eslint-disable-next-line @next/next/no-img-element -- rendu vidéo (Remotion), pas une page Next.
    return <img src={face} alt="" style={{ ...ring, objectFit: "cover" }} />;
  }
  if (mode === "silhouette" || mode === "photos") {
    return (
      <div style={ring}>
        <svg width={size} height={size} viewBox="0 0 40 40">
          <circle cx="20" cy="15" r="7" fill={color} />
          <path d="M6 38c1.5-8 7-12 14-12s12.5 4 14 12z" fill={color} />
        </svg>
      </div>
    );
  }
  return <div style={{ ...ring, color, fontFamily: font, fontWeight: 800, fontSize: size * 0.4 }}>{initials(name)}</div>;
}

function Liste({ e, ctx, s }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const sf = surface(p, prm, s, 34, ctx.bg);
  const step = stepOf(p) * num(prm, "cadence", 1);
  const items = (Array.isArray(e.data.elements) ? e.data.elements : []) as { nom?: string; detail?: string }[];
  const done = 6 + items.length * step + step * 0.6;
  const pop = popOf(e);
  return (
    <Card e={e} ctx={ctx} s={s} title={str(e.data.titre)}>
      {items.map((it, i) => {
        const at = 4 + i * step;
        const k = t(frame, at, 9);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 22 * s, padding: `${18 * s}px 0`, borderBottom: i < items.length - 1 ? `1px solid ${sf.line}` : "none", opacity: k, transform: `translateX(${(1 - k) * 40 * s}px)` }}>
            <Avatar mode={opt(prm, "avatars", "initiales")} name={str(it.nom)} color={pick(p, prm, "couleur_avatar", p.palette.accent)} face={p.faces?.length ? p.faces[i % p.faces.length] : null} size={60 * s} font={ctx.body} />
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 32 * s }}>{str(it.nom)}</div>
              {it.detail && <div style={{ fontFamily: ctx.body, fontSize: 24 * s, opacity: 0.6 }}>{str(it.detail)}</div>}
            </div>
            <Check k={t(frame, at + step * 0.8, 8, pop)} color={pick(p, prm, "couleur_coche", p.palette.accent)} size={50 * s} shape={opt(prm, "coche", "rond")} />
          </div>
        );
      })}
      {str(e.data.action) && (
        <div style={{ marginTop: 26 * s, background: pick(p, prm, "couleur_action", p.palette.accent), color: p.palette.textOnDark, borderRadius: radiusOf(p, prm, s, 20), padding: `${22 * s}px 0`, textAlign: "center", fontFamily: ctx.body, fontWeight: 800, fontSize: 32 * s, opacity: t(frame, done, 8), transform: `scale(${0.9 + 0.1 * t(frame, done, 10, pop)})` }}>
          {str(e.data.action)}
        </div>
      )}
    </Card>
  );
}

function Notification({ e, ctx, s }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const sf = surface(p, prm, s, 46, ctx.bg);
  const app = str(e.data.app) || "TIM";
  // Un visage (Médias publicitaires) plutôt que « TIM » : la notification vient de quelqu'un ; l'app à défaut de visage déposé.
  const faces = p.faces ?? [];
  const wanted = opt(prm, "icone", "visage");
  const icon = wanted === "visage" && !faces.length ? "app" : wanted;
  const face = faces.length ? faces[Math.abs(Math.round(num(e.data as Params, "visage", 0))) % faces.length] : null;
  const logo = p.logos.symbol ?? p.logos.light;
  if (opt(prm, "format", "banniere") === "grande") {
    // La confirmation en grand : ce qui vient de se passer doit sauter aux yeux (un pointage validé, une demande envoyée).
    const ok = t(frame, 4, 12, popOf(e));
    return (
      <div style={{ ...sf.style, display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 22 * s, padding: `${56 * s}px ${48 * s}px` }}>
        {yes(prm, "coche", true) && (
          <div style={{ transform: `scale(${0.4 + 0.6 * ok})` }}>
            <Check k={ok} color={pick(p, prm, "couleur_coche", p.palette.accent)} size={150 * s} />
          </div>
        )}
        <div style={{ fontFamily: ctx.title, fontWeight: 900, fontSize: 70 * s, lineHeight: 1.05 }}>{str(e.data.titre)}</div>
        {str(e.data.texte) && <div style={{ fontFamily: ctx.body, fontSize: 34 * s, lineHeight: 1.3, opacity: 0.8 }}>{str(e.data.texte)}</div>}
      </div>
    );
  }
  // La validation : la coche se remplit, une onde en part, un liseré s'allume autour de la carte et elle rebondit (15/10/2026).
  const checkAt = stepOf(p) * 3;
  const ok = t(frame, checkAt, 8, popOf(e));
  const wave = t(frame, checkAt + 2, 16);
  const okColor = pick(p, prm, "couleur_coche", VALIDATION_GREEN);
  const lit = Math.sin(Math.PI * Math.min(1, wave * 1.4));
  return (
    <div
      style={{
        ...sf.style,
        display: "flex",
        gap: 26 * s,
        alignItems: "flex-start",
        padding: 34 * s,
        transform: `scale(${1 + 0.035 * lit})`,
        boxShadow: [sf.style.boxShadow, yes(prm, "coche", true) && wave > 0 && wave < 1 ? `0 0 0 ${5 * s}px ${okColor}${Math.round(lit * 160).toString(16).padStart(2, "0")}` : null].filter(Boolean).join(", "),
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- rendu vidéo (Remotion), pas une page Next. */}
      {icon === "visage" && face && <img src={face} alt="" style={{ width: 84 * s, height: 84 * s, flex: "none", objectFit: "cover", borderRadius: 24 * s }} />}
      {icon === "app" && <div style={{ width: 84 * s, height: 84 * s, flex: "none", borderRadius: 22 * s, background: pick(p, prm, "couleur_icone", p.palette.primary), color: p.palette.textOnDark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ctx.title, fontWeight: 900, fontSize: 28 * s }}>{app.slice(0, 3).toUpperCase()}</div>}
      {/* eslint-disable-next-line @next/next/no-img-element -- rendu vidéo (Remotion), pas une page Next. */}
      {icon === "logo" && logo && <img src={logo} alt="" style={{ width: 84 * s, height: 84 * s, flex: "none", objectFit: "contain", borderRadius: 22 * s, background: p.palette.lightBg }} />}
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: ctx.body, fontSize: 22 * s, opacity: 0.55, marginBottom: 6 * s }}>
          <span>{app}</span>
          {yes(prm, "heure", true) && <span>maintenant</span>}
        </div>
        <div style={{ fontFamily: ctx.body, fontWeight: 800, fontSize: 36 * s, lineHeight: 1.15 }}>{str(e.data.titre)}</div>
        <div style={{ fontFamily: ctx.body, fontSize: 28 * s, lineHeight: 1.3, opacity: 0.8, marginTop: 6 * s }}>{str(e.data.texte)}</div>
      </div>
      {yes(prm, "coche", true) && (
        <div style={{ position: "relative", flex: "none" }}>
          <div style={{ position: "absolute", inset: 0, borderRadius: "24%", border: `${4 * s}px solid ${okColor}`, transform: `scale(${1 + wave * 1.3})`, opacity: wave > 0 ? 1 - wave : 0 }} />
          <Check k={ok} color={okColor} size={52 * s} />
        </div>
      )}
    </div>
  );
}

function Bouton({ e, ctx, s, frames }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const role = opt(prm, "couleur", "accent");
  const tap = Math.min(frames * 0.35, 24);
  const press = interpolate(frame, [tap - 3, tap, tap + 5], [0, 1, 0], clamp);
  const ripple = t(frame, tap, 14);
  const ok = t(frame, tap + 6, 12, popOf(e));
  const conf = str(e.data.confirmation);
  const sf = surface(p, { ...prm, surface: "clair", couleur_texte: "auto" }, s, 34, ctx.bg);
  const okColor = pick(p, prm, "couleur_coche", p.palette.accent);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ background: colorOf(p, role), color: pick(p, prm, "couleur_texte", onColor(p, role)), borderRadius: radiusOf(p, prm, s, 22), padding: `${32 * s}px 0`, textAlign: "center", fontFamily: ctx.body, fontWeight: 800, fontSize: 42 * s, transform: `scale(${1 - press * 0.06})`, boxShadow: `0 ${(1 - press) * 16 * s}px ${34 * s}px -${12 * s}px rgba(0,0,0,0.45)` }}>
        {str(e.data.bouton)}
      </div>
      {yes(prm, "onde", true) && (
        <div style={{ position: "absolute", left: "50%", top: 54 * s, width: 40 * s, height: 40 * s, marginLeft: -20 * s, marginTop: -20 * s, borderRadius: "24%", border: `${4 * s}px solid ${pick(p, prm, "couleur_onde", p.palette.lightBg)}`, transform: `scale(${1 + ripple * 6})`, opacity: (1 - ripple) * (frame >= tap ? 1 : 0) }} />
      )}
      {conf && opt(prm, "confirmation", "carte") === "carte" && (
        <div style={{ ...sf.style, marginTop: 26 * s, display: "flex", alignItems: "center", gap: 18 * s, padding: `${22 * s}px ${28 * s}px`, opacity: ok, transform: `translateY(${(1 - ok) * 40 * s}px)` }}>
          <Check k={ok} color={okColor} size={50 * s} />
          <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 32 * s }}>{conf}</div>
        </div>
      )}
      {conf && opt(prm, "confirmation", "carte") === "badge" && (
        <div style={{ display: "flex", justifyContent: "center", marginTop: 22 * s, opacity: ok, transform: `scale(${0.7 + 0.3 * ok})` }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 12 * s, background: okColor, color: p.palette.textOnDark, borderRadius: 14 * s, padding: `${12 * s}px ${26 * s}px`, fontFamily: ctx.body, fontWeight: 800, fontSize: 28 * s }}>
            <Check k={ok} color={p.palette.textOnDark} size={34 * s} />
            {conf}
          </div>
        </div>
      )}
    </div>
  );
}

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

function Planning({ e, ctx, s, w }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const sf = surface(p, prm, s, 34, ctx.bg);
  const step = stepOf(p) * num(prm, "cadence", 1);
  const days = DAYS.slice(0, Math.min(7, Math.max(5, Number(e.data.jours) || 5)));
  const lignes = strs(e.data.lignes);
  const labelW = w * 0.3;
  const cell = (w - 76 * s - labelW) / days.length - 8 * s;
  const tones = [pick(p, prm, "couleur_1", p.palette.accent), pick(p, prm, "couleur_2", p.palette.primary), pick(p, prm, "couleur_3", p.palette.darkBg)];
  const bars = opt(prm, "remplissage", "blocs") === "barres";
  const pop = popOf(e);
  return (
    <Card e={e} ctx={ctx} s={s} title={str(e.data.titre)}>
      <div style={{ display: "flex", marginLeft: labelW, gap: 8 * s, marginBottom: 12 * s }}>
        {days.map((d, i) => (
          <div key={i} style={{ width: cell, textAlign: "center", fontFamily: ctx.body, fontWeight: 700, fontSize: 22 * s, opacity: 0.5 }}>
            {d}
          </div>
        ))}
      </div>
      {lignes.map((l, r) => (
        <div key={r} style={{ display: "flex", alignItems: "center", gap: 8 * s, marginBottom: 10 * s }}>
          <div style={{ width: labelW - 8 * s, fontFamily: ctx.body, fontWeight: 700, fontSize: 26 * s, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
          {bars ? (
            <div style={{ flex: 1, height: cell * 0.5, borderRadius: cell * 0.12, background: sf.line, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${t(frame, 6 + r * step, 14) * (55 + ((r * 23) % 40))}%`, background: tones[r % tones.length], borderRadius: cell * 0.12 }} />
            </div>
          ) : (
            days.map((_, i) => {
              const off = (i + r * 2) % 5 === 4;
              const k = t(frame, 6 + r * step + i * (step / 3), 7, pop);
              return (
                <div key={i} style={{ width: cell, height: cell * 0.78, borderRadius: Math.min(12 * s, radiusOf(p, prm, s, 12)), background: sf.line, position: "relative", overflow: "hidden" }}>
                  {!off && <div style={{ position: "absolute", inset: 4 * s, borderRadius: Math.min(9 * s, radiusOf(p, prm, s, 9)), background: tones[r % tones.length], transform: `scale(${k})`, opacity: k }} />}
                </div>
              );
            })
          )}
        </div>
      ))}
    </Card>
  );
}

/** Le petit plan de la fiche chantier : un parc, un boulevard, des rues — et l'épingle qui tombe. */
function MiniMap({ w, h, pin, drop }: { w: number; h: number; pin: string; drop: number }) {
  return (
    <svg width={w} height={h} viewBox="0 0 400 140" preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
      <rect width="400" height="140" fill="#eef1ee" />
      <path d="M0 0 H400 V55 L0 95 Z" fill="#cfe8cf" />
      <path d="M-10 92 L410 40" stroke="#f6dc8b" strokeWidth="18" />
      <path d="M-10 92 L410 40" stroke="#ffffff" strokeWidth="1.5" strokeDasharray="6 8" opacity="0.8" />
      <path d="M120 140 L150 104 M200 140 L215 96 M290 140 L280 85 M330 120 L400 112" stroke="#ffffff" strokeWidth="6" />
      <rect x="230" y="105" width="40" height="22" rx="3" fill="#dde3df" />
      <rect x="300" y="100" width="55" height="26" rx="3" fill="#dde3df" />
      <g transform={`translate(200 ${30 - (1 - drop) * 60})`} opacity={Math.min(1, drop * 2)}>
        <path d="M0 0C-9 0 -15 6.5 -15 15c0 11 15 25 15 25s15-14 15-25C15 6.5 9 0 0 0z" fill={pin} />
        <circle cx="0" cy="15" r="5.5" fill="#ffffff" />
      </g>
    </svg>
  );
}

/** L'écran chantier de l'app : en-tête, onglets, plan, adresse, infos (dates, avancement, ouvriers), référents. */
function Fiche({ e, ctx, s, w }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const d = e.data;
  const sf = surface(p, prm, s, 40, ctx.bg);
  const accent = pick(p, prm, "couleur_accent", p.palette.accent);
  const bar = pick(p, prm, "couleur_barre", p.palette.primary);
  const dot = pick(p, prm, "couleur_puce", p.palette.accent);
  const step = stepOf(p);
  const pop = popOf(e);
  const onglets = strs(d.onglets);
  const lignes = strs(d.lignes);
  const refs = (Array.isArray(d.referents) ? d.referents : []) as { nom?: string; role?: string }[];
  const avancement = typeof d.avancement === "number" ? d.avancement : null;
  const ouvriers = typeof d.ouvriers === "number" ? d.ouvriers : null;
  const pad = 34 * s;
  const tile: CSSProperties = { background: `${sf.fg}0d`, borderRadius: 24 * s, padding: `${22 * s}px ${26 * s}px` };
  const label: CSSProperties = { fontFamily: ctx.title, fontWeight: 800, fontSize: 32 * s, margin: `${26 * s}px 0 ${12 * s}px` };
  const show = (at: number) => ({ opacity: t(frame, at, 9), transform: `translateY(${(1 - t(frame, at, 9)) * 24 * s}px)` });
  return (
    <div style={{ ...sf.style, overflow: "hidden", padding: pad }}>
      <div style={{ display: "flex", alignItems: "center", gap: 14 * s, fontFamily: ctx.title, fontWeight: 800, fontSize: 36 * s }}>
        <svg width={30 * s} height={38 * s} viewBox="0 0 30 40">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill={accent} />
          <circle cx="15" cy="15" r="5.5" fill="#ffffff" />
        </svg>
        <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{str(d.lieu)}</span>
        <svg width={24 * s} height={24 * s} viewBox="0 0 24 24" style={{ opacity: 0.5 }}>
          <path d="M6 9l6 6 6-6" fill="none" stroke={sf.fg} strokeWidth="2.4" strokeLinecap="round" />
        </svg>
      </div>
      {yes(prm, "onglets", true) && onglets.length > 0 && (
        <div style={{ display: "flex", gap: 8 * s, marginTop: 18 * s, fontFamily: ctx.body, fontSize: 26 * s }}>
          {onglets.map((o, i) => (
            <div key={i} style={{ padding: `${12 * s}px ${20 * s}px`, borderRadius: 12 * s, background: i === 0 ? `${sf.fg}12` : "transparent", color: i === 0 ? accent : sf.fg, fontWeight: i === 0 ? 800 : 500, opacity: i === 0 ? 1 : 0.8 }}>
              {o}
            </div>
          ))}
        </div>
      )}
      {yes(prm, "carte", true) && (
        <div style={{ marginTop: 18 * s, borderRadius: 16 * s, overflow: "hidden", boxShadow: `0 ${8 * s}px ${24 * s}px -${10 * s}px rgba(0,0,0,0.25)` }}>
          <MiniMap w={w - pad * 2} h={(w - pad * 2) * 0.36} pin={accent} drop={t(frame, 6, 14, Easing.out(Easing.bounce))} />
          <div style={{ display: "flex", alignItems: "center", gap: 16 * s, padding: `${20 * s}px ${24 * s}px`, background: `${sf.fg}08` }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: ctx.title, fontWeight: 800, fontSize: 30 * s }}>{str(d.lieu)}</div>
              {str(d.adresse) && <div style={{ fontFamily: ctx.body, fontSize: 24 * s, opacity: 0.6 }}>{str(d.adresse)}</div>}
            </div>
            {yes(prm, "itineraire", true) && (
              <div style={{ display: "flex", alignItems: "center", gap: 10 * s, background: `${accent}1f`, color: accent, borderRadius: 14 * s, padding: `${12 * s}px ${22 * s}px`, fontFamily: ctx.body, fontWeight: 800, fontSize: 24 * s, transform: `scale(${0.9 + 0.1 * t(frame, 14, 10, pop)})` }}>
                <svg width={22 * s} height={22 * s} viewBox="0 0 24 24">
                  <path d="M3 11l18-8-8 18-2-8z" fill={accent} />
                </svg>
                Itinéraire
              </div>
            )}
          </div>
        </div>
      )}
      {(str(d.debut) || ouvriers !== null) && (
        <div style={show(step * 2)}>
          <div style={label}>Infos chantier</div>
          <div style={tile}>
            {(str(d.debut) || str(d.fin)) && (
              <div style={{ display: "flex", alignItems: "center", gap: 18 * s }}>
                <div style={{ width: 52 * s, height: 52 * s, borderRadius: 14 * s, background: `${sf.fg}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26 * s }}>
                  <svg width={28 * s} height={28 * s} viewBox="0 0 24 24">
                    <rect x="3" y="5" width="18" height="16" rx="3" fill="none" stroke={sf.fg} strokeOpacity="0.7" strokeWidth="2" />
                    <path d="M3 10h18M8 3v4M16 3v4" stroke={sf.fg} strokeOpacity="0.7" strokeWidth="2" />
                  </svg>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: ctx.body, fontWeight: 800, fontSize: 28 * s }}>
                    Du {str(d.debut)} au {str(d.fin)}
                  </div>
                  {avancement !== null && (
                    <div style={{ marginTop: 10 * s, height: 10 * s, borderRadius: 3 * s, background: `${sf.fg}1a`, overflow: "hidden" }}>
                      <div style={{ height: "100%", width: `${avancement * t(frame, step * 2.5, 18, Easing.out(Easing.cubic))}%`, background: bar, borderRadius: 3 * s }} />
                    </div>
                  )}
                </div>
              </div>
            )}
            {ouvriers !== null && (
              <div style={{ display: "flex", alignItems: "center", gap: 18 * s, marginTop: 16 * s, paddingTop: 16 * s, borderTop: `1px solid ${sf.line}` }}>
                <div style={{ width: 52 * s, height: 52 * s, borderRadius: 14 * s, background: `${sf.fg}12`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24 * s }}>
                  <svg width={30 * s} height={30 * s} viewBox="0 0 24 24">
                    <circle cx="9" cy="9" r="3.2" fill={sf.fg} fillOpacity="0.7" />
                    <circle cx="16.5" cy="10" r="2.6" fill={sf.fg} fillOpacity="0.5" />
                    <path d="M3 19c.6-3.4 3-5.2 6-5.2s5.4 1.8 6 5.2zM14 19c.3-2.2 1.6-3.8 3.6-3.8 2 0 3.2 1.6 3.4 3.8z" fill={sf.fg} fillOpacity="0.6" />
                  </svg>
                </div>
                <div style={{ fontFamily: ctx.body, fontWeight: 800, fontSize: 28 * s }}>{ouvriers} ouvrier{ouvriers > 1 ? "s" : ""}</div>
              </div>
            )}
          </div>
        </div>
      )}
      {lignes.length > 0 && (
        <div style={{ marginTop: 16 * s }}>
          {lignes.map((l, i) => {
            const k = t(frame, step * (3 + i), 8);
            const puce = opt(prm, "puce", "rond");
            return (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 14 * s, fontFamily: ctx.body, fontSize: 28 * s, padding: `${6 * s}px 0`, opacity: k }}>
                {puce === "coche" ? <Check k={k} color={dot} size={32 * s} /> : <div style={{ width: puce === "trait" ? 22 * s : 12 * s, height: puce === "trait" ? 5 * s : 12 * s, borderRadius: 12 * s, background: dot }} />}
                {l}
              </div>
            );
          })}
        </div>
      )}
      {refs.length > 0 && (
        <div>
          <div style={{ ...label, ...show(step * 3.5) }}>Référents internes</div>
          <div style={tile}>
            {refs.map((r, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 18 * s, padding: `${10 * s}px 0`, borderTop: i ? `1px solid ${sf.line}` : "none", ...show(step * (4 + i)) }}>
                <Avatar mode={opt(prm, "avatars", "photos")} name={str(r.nom)} color={accent} face={p.faces?.length ? p.faces[i % p.faces.length] : null} size={64 * s} font={ctx.body} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: ctx.body, fontWeight: 800, fontSize: 28 * s }}>{str(r.nom)}</div>
                  {str(r.role) && <div style={{ fontFamily: ctx.body, fontSize: 22 * s, opacity: 0.6 }}>{str(r.role)}</div>}
                </div>
                <div style={{ width: 52 * s, height: 52 * s, borderRadius: 14 * s, background: `${accent}1f`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                  <svg width={26 * s} height={26 * s} viewBox="0 0 24 24">
                    <path d="M3 6h18v12H3z" fill={accent} />
                    <path d="M3 6l9 7 9-7" fill="none" stroke="#ffffff" strokeWidth="1.8" />
                  </svg>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Champ({ e, ctx, s }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const sf = surface(p, prm, s, 28, ctx.bg);
  const value = str(e.data.valeur);
  const speed = num(prm, "frappe", 1);
  const typed = Math.round(interpolate(frame, [6, 6 + (value.length * 1.6) / speed], [0, value.length], clamp));
  const caret = yes(prm, "curseur", true) && Math.floor(frame / 8) % 2 === 0;
  const line = pick(p, prm, "couleur_trait", p.palette.accent);
  return (
    <div style={{ ...sf.style, padding: `${26 * s}px ${32 * s}px` }}>
      <div style={{ fontFamily: ctx.body, fontSize: 24 * s, opacity: 0.6, marginBottom: 10 * s }}>{str(e.data.libelle)}</div>
      <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 36 * s, borderBottom: `${3 * s}px solid ${line}`, paddingBottom: 8 * s, minHeight: 44 * s }}>
        {value.slice(0, typed)}
        <span style={{ opacity: caret ? 1 : 0, color: line }}>|</span>
      </div>
    </div>
  );
}

function Badge({ e, ctx, s }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const role = opt(prm, "couleur", "accent");
  const icon = opt(prm, "icone", "coche");
  const k = t(frame, 4, 8, popOf(e));
  const fg = pick(p, prm, "couleur_texte", onColor(p, role));
  return (
    <div style={{ display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", gap: 14 * s, background: colorOf(p, role), color: fg, borderRadius: 14 * s, padding: `${16 * s}px ${30 * s}px ${16 * s}px ${icon === "aucune" ? 30 * s : 18 * s}px`, fontFamily: ctx.body, fontWeight: 800, fontSize: 32 * s, boxShadow: shadowOf(prm, s) }}>
      {icon === "coche" && <Check k={k} color={fg} size={40 * s} />}
      {icon === "etoile" && (
        <svg width={38 * s} height={38 * s} viewBox="0 0 24 24" style={{ transform: `scale(${k}) rotate(${(1 - k) * 90}deg)` }}>
          <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 21l1.6-7L2 9.2l7.1-.6z" fill={fg} />
        </svg>
      )}
      {str(e.data.texte)}
    </div>
  );
}

function Tap({ e, ctx, s, w }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const press = interpolate(frame, [6, 9, 14], [0, 1, 0], clamp);
  const ripple = t(frame, 9, 16);
  const inK = t(frame, 0, 8);
  const ring = opt(prm, "doigt", "disque") === "anneau";
  const finger = pick(p, prm, "couleur_doigt", p.palette.textOnDark);
  return (
    <div style={{ position: "relative", width: w, height: w }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "24%", border: `${5 * s}px solid ${colorOf(p, opt(prm, "onde_couleur", "accent"))}`, transform: `scale(${0.4 + ripple * 1.6})`, opacity: (1 - ripple) * (frame >= 9 ? 1 : 0) }} />
      <div
        style={{
          position: "absolute",
          inset: "18%",
          borderRadius: "24%",
          background: ring ? "transparent" : finger,
          border: ring ? `${8 * s}px solid ${finger}` : "none",
          opacity: 0.9 * inK,
          transform: `scale(${1 - press * 0.18}) translate(${(1 - inK) * 60}%, ${(1 - inK) * 80}%)`,
          boxShadow: `0 ${10 * s}px ${30 * s}px rgba(0,0,0,0.35)`,
        }}
      />
    </div>
  );
}

function Surbrillance({ e, ctx, s, w }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const k = t(frame, 0, 12);
  const round = e.data.forme === "cercle";
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        borderRadius: round ? "24%" : radiusOf(p, prm, s, 22),
        border: `${num(prm, "epaisseur", 6) * s}px solid ${colorOf(p, opt(prm, "couleur", "accent"))}`,
        boxShadow: `0 0 0 ${3000 * s}px rgba(0,0,0,${num(prm, "assombrir", 0.45) * k})`,
        transform: `scale(${1.25 - 0.25 * k})`,
        opacity: k,
        minWidth: w * 0.1,
      }}
    />
  );
}

function Soulignement({ e, ctx, s }: Props) {
  const frame = useFrame(e);
  const prm = e.params;
  const color = colorOf(ctx.p, opt(prm, "couleur", "accent"));
  const h = num(prm, "epaisseur", 14) * s;
  const k = t(frame, 0, 12);
  if (opt(prm, "forme", "droit") === "main-levee") {
    return (
      <svg viewBox="0 0 200 20" style={{ width: "100%", height: h * 2.4, overflow: "visible" }} preserveAspectRatio="none">
        <path d="M3 14 C 50 4, 90 18, 130 8 S 190 10, 197 6" fill="none" stroke={color} strokeWidth={h / 2} strokeLinecap="round" strokeDasharray={220} strokeDashoffset={220 * (1 - k)} />
      </svg>
    );
  }
  return <div style={{ height: h, borderRadius: h * 0.3, background: color, width: `${k * 100}%` }} />;
}

/** Une couleur qui se fondrait dans le fond plein du plan est remplacée par celle qui y ressort. */
function visible(ctx: Ctx, color: string): string {
  if (!ctx.bg || color.toLowerCase() !== ctx.bg.toLowerCase()) return color;
  return ctx.bg.toLowerCase() === ctx.p.palette.darkBg.toLowerCase() ? ctx.p.palette.textOnDark : ctx.p.palette.darkBg;
}

/** La taille « affiche » : le mot le plus long tient dans la largeur, et le titre en trois lignes au plus. */
function posterSize(texts: string[], w: number): number {
  const longest = Math.max(1, ...texts.flatMap((x) => x.split(/\s+/)).map((x) => x.length));
  const total = Math.max(1, ...texts.map((x) => x.length));
  return Math.min(w / (longest * 0.62), (w * 3) / (total * 0.62));
}

function Titre({ e, ctx, s, w, ink: plan }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const ink = pick(p, prm, "couleur_texte", plan);
  const text = str(e.data.texte);
  const strong = str(e.data.mot_fort).toLowerCase();
  const anim = str(e.data.animation) || "mot-a-mot";
  const casse = opt(prm, "casse", "style");
  const upper = (casse === "style" ? p.style.titleUpper : casse === "majuscules") ? "uppercase" : "none";
  const step = stepOf(p);
  const hotColor = visible(ctx, colorOf(p, opt(prm, "mot_fort_couleur", "accent")));
  const poster = opt(prm, "taille", "affiche") === "affiche";
  const base: CSSProperties = {
    fontFamily: ctx.title,
    fontWeight: num(prm, "graisse", 900),
    fontSize: poster ? Math.min(posterSize([text, str(e.data.remplacement)].filter(Boolean), w) * num(prm, "taille_texte", 1), 220 * ctx.u) : 100 * s,
    // Une police d'affiche étroite (Bebas…) se lit mal serrée : un souffle entre les lettres et les lignes (15/10/2026).
    lineHeight: poster ? 1.0 : 1.05,
    letterSpacing: "0.015em",
    textTransform: upper,
    color: ink,
    textAlign: opt(prm, "alignement", "centre") === "centre" ? "center" : "left",
    ...(yes(prm, "contour", false) ? { WebkitTextStroke: `${3 * s}px ${ink}`, color: "transparent" } : {}),
    ...(yes(prm, "ombre_texte", false) ? { textShadow: `0 ${6 * s}px ${24 * s}px rgba(0,0,0,0.55)` } : {}),
  };
  if (anim === "frappe") {
    // Comme tapé au clavier : la police des textes, en casse normale, lettre après lettre, avec le curseur qui clignote.
    const n = Math.round(interpolate(frame, [2, 2 + text.length * 1.6], [0, text.length], clamp));
    const caret = Math.floor(frame / 12) % 2 === 0 || n < text.length;
    const size = Math.min(64 * s, (w * 2) / Math.max(1, text.length * 0.5));
    return (
      <div style={{ ...base, fontFamily: ctx.body, fontWeight: 600, textTransform: "none", letterSpacing: "0", fontSize: size, lineHeight: 1.3 }}>
        {text.slice(0, n)}
        <span style={{ display: "inline-block", width: size * 0.08, height: size * 1.05, marginLeft: size * 0.06, verticalAlign: "text-bottom", background: hotColor, opacity: caret ? 1 : 0, borderRadius: size * 0.03 }} />
      </div>
    );
  }
  if (anim === "bloc") {
    const k = t(frame, 0, 12, popOf(e));
    return (
      <div style={{ ...base, opacity: k, transform: `scale(${0.88 + 0.12 * k})` }}>
        {strong
          ? text.split(/(\s+)/).map((w, i) => (
              <span key={i} style={w.toLowerCase().replace(/[.,!?;:]/g, "").includes(strong.split(/\s+/)[0]) ? { color: hotColor } : undefined}>
                {w}
              </span>
            ))
          : text}
      </div>
    );
  }
  if (anim === "barre-remplace") {
    // On lit d'abord l'ancienne façon (≈ 1 s), puis chaque mot est barré à son tour ; l'ancienne recule, la nouvelle s'écrase dessus.
    const words = text.split(/\s+/).filter(Boolean);
    const read = Math.round(28 * PACE[p.style.pace]);
    const per = 5;
    const struck = read + words.length * per;
    const out = t(frame, struck + 10, 8);
    // Une secousse quand le dernier mot est barré : « non ».
    const jolt = frame >= struck && frame < struck + 8 ? Math.sin((frame - struck) * 2.4) * (1 - (frame - struck) / 8) * 10 * s : 0;
    const bar = visible(ctx, pick(p, prm, "couleur_barre", p.palette.accent));
    const repl = str(e.data.remplacement);
    const parts = repl.split(/(\s+)/);
    const key = strong ? strong.split(/\s+/)[0] : (parts.filter((x) => x.trim()).at(-1) ?? "").toLowerCase().replace(/[.,!?;:]/g, "");
    let wi = 0;
    return (
      <div style={{ position: "relative" }}>
        {/* L'ancienne façon : chaque mot se ternit quand le trait le barre, puis tout s'efface (rien ne reste derrière la nouvelle). */}
        <div style={{ ...base, opacity: 1 - out, transform: `translateX(${jolt}px) scale(${1 - out * 0.15})` }}>
          {words.map((w, i) => {
            const k = t(frame, read + i * per, per + 2);
            return (
              <span key={i} style={{ position: "relative", display: "inline-block", marginRight: "0.25em" }}>
                <span style={{ opacity: 1 - 0.55 * k }}>{w}</span>
                <span style={{ position: "absolute", left: "-3%", top: "50%", height: Math.max(8, 0.1 * Number(base.fontSize)), width: `${k * 106}%`, background: bar, borderRadius: 4 * s, transform: "translateY(-50%) rotate(-2deg)" }} />
              </span>
            );
          })}
        </div>
        {/* La nouvelle : mot par mot, chacun s'écrase à sa place. */}
        <div style={{ ...base, position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", WebkitTextStroke: undefined }}>
          <div>
            {parts.map((w, i) => {
              if (!w.trim()) return <span key={i}>{w}</span>;
              const k = t(frame, struck + 14 + wi++ * 4, 10, Easing.out(Easing.back(2.2)));
              const hot = w.toLowerCase().replace(/[.,!?;:]/g, "").includes(key);
              return (
                <span key={i} style={{ display: "inline-block", opacity: Math.min(1, k * 3), transform: `scale(${1.7 - 0.7 * k})`, ...(hot ? { color: hotColor } : {}) }}>
                  {w}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    );
  }
  const words = text.split(/\s+/).filter(Boolean);
  return (
    <div style={base}>
      {words.map((w, i) => {
        const k = t(frame, i * (step / 2), 7);
        const hot = strong && w.toLowerCase().replace(/[.,!?;:]/g, "").includes(strong.split(/\s+/)[0]);
        return (
          <span key={i} style={{ display: "inline-block", marginRight: "0.25em", opacity: k, transform: `translateY(${(1 - k) * 0.3}em)`, color: hot ? hotColor : undefined }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

function Etiquette({ e, ctx, s }: Props) {
  const sf = surface(ctx.p, e.params, s, 34, ctx.bg);
  return (
    <div style={{ ...sf.style, display: "inline-flex", alignItems: "center", whiteSpace: "nowrap", gap: 14 * s, borderRadius: 14 * s, padding: `${14 * s}px ${28 * s}px`, fontFamily: ctx.body, fontWeight: 700, fontSize: 30 * s }}>
      <div style={{ width: 16 * s, height: 16 * s, borderRadius: "24%", background: pick(ctx.p, e.params, "couleur_pastille", ctx.p.palette.accent) }} />
      {str(e.data.texte)}
    </div>
  );
}

function Bulle({ e, ctx, s }: Props) {
  const sf = surface(ctx.p, e.params, s, 34, ctx.bg);
  const tip = opt(e.params, "pointe", "bas-gauche");
  return (
    <div style={{ ...sf.style, position: "relative", padding: `${28 * s}px ${34 * s}px`, fontFamily: ctx.body, fontWeight: 600, fontSize: 34 * s, lineHeight: 1.3 }}>
      {str(e.data.texte)}
      {tip !== "aucune" && <div style={{ position: "absolute", [tip === "bas-droite" ? "right" : "left"]: 50 * s, bottom: -18 * s, width: 40 * s, height: 40 * s, background: sf.style.background as string, transform: "rotate(45deg)" }} />}
    </div>
  );
}

function Compteur({ e, ctx, s, frames, ink: plan }: Props) {
  const frame = useFrame(e);
  const f = e.figure;
  if (!f) return null;
  const prm = e.params;
  const ink = pick(ctx.p, prm, "couleur_libelle", plan);
  const target = Number(f.value.replace(/[^\d]/g, "")) || 0;
  const k = t(frame, 2, Math.min(frames * 0.55, 40), Easing.out(Easing.cubic));
  const current = Math.round(target * k).toLocaleString("fr-FR").replace(/ /g, " ");
  const shown = target ? f.value.replace(/\d[\d\s.,]*\d|\d/, current) : f.value;
  const color = opt(prm, "couleur", "accent") === "accent" ? ctx.p.palette.accent : opt(prm, "couleur", "accent") === "principale" ? ctx.p.palette.primary : ink;
  const size = 190 * s;
  const rolls = opt(prm, "style", "rouleaux") === "rouleaux" && target > 0;
  const crowd = yes(prm, "foule", true);
  const doneAt = rolls ? 2 + f.value.length * 3 + 22 : 2 + Math.min(frames * 0.55, 40);
  return (
    <div style={{ textAlign: "center", color: ink }}>
      <div style={{ fontFamily: ctx.title, fontWeight: 900, fontSize: size, lineHeight: 1, color, letterSpacing: "0.01em", fontVariantNumeric: "tabular-nums", display: "flex", justifyContent: "center" }}>
        {rolls
          ? // Chaque chiffre tourne comme un rouleau de compteur, de gauche à droite, et se pose sur sa valeur.
            f.value.split("").map((ch, i) => {
              if (!/\d/.test(ch)) return <span key={i}>{ch === " " ? "\u00a0" : ch}</span>;
              const k = t(frame, 2 + i * 3, 22, Easing.out(Easing.cubic));
              const turns = (2 + i) * 10 + Number(ch);
              const pos = (turns * k) % 10;
              return (
                <span key={i} style={{ display: "inline-block", height: size, overflow: "hidden", position: "relative" }}>
                  <span style={{ display: "flex", flexDirection: "column", transform: `translateY(${-pos * size}px)` }}>
                    {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d, j) => (
                      <span key={j} style={{ height: size, lineHeight: 1 }}>
                        {d}
                      </span>
                    ))}
                  </span>
                </span>
              );
            })
          : shown}
      </div>
      <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 46 * s, marginTop: 14 * s, opacity: t(frame, doneAt - 14, 10) }}>{f.label}</div>
      {crowd && <Crowd frame={frame - doneAt} s={s} ink={ink} accent={ctx.p.palette.accent} font={ctx.body} />}
      {yes(prm, "source", true) && <div style={{ fontFamily: ctx.body, fontSize: 24 * s, marginTop: 8 * s, opacity: 0.6 * t(frame, 16, 10) }}>Source : {f.source}</div>}
    </div>
  );
}

/**
 * La foule derrière le chiffre : des silhouettes (coins légèrement arrondis,
 * jamais de rond) qui se remplissent en vague ; la dernière, en couleur, c'est
 * « vous ». Abstraites : aucun visage, aucun témoignage.
 */
function Crowd({ frame, s, ink, accent, font }: { frame: number; s: number; ink: string; accent: string; font: string }) {
  const cols = 9;
  const rows = 2;
  const n = cols * rows;
  const w = 78 * s;
  return (
    <div style={{ marginTop: 34 * s, display: "inline-grid", gridTemplateColumns: `repeat(${cols}, ${w}px)`, gap: `${18 * s}px ${14 * s}px`, justifyContent: "center" }}>
      {Array.from({ length: n }, (_, i) => {
        const last = i === n - 1;
        const k = t(frame, (i % cols) * 1.2 + Math.floor(i / cols) * 4 + (last ? 10 : 0), 8, Easing.out(Easing.back(2)));
        const c = last ? accent : `${ink}55`;
        return (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 * s, opacity: Math.min(1, k * 2), transform: `translateY(${(1 - k) * 20 * s}px) scale(${last ? 1 + 0.25 * Math.sin(Math.PI * k) : 1})` }}>
            <div style={{ width: w * 0.42, height: w * 0.42, borderRadius: w * 0.12, background: c }} />
            <div style={{ width: w * 0.78, height: w * 0.42, borderRadius: `${w * 0.16}px ${w * 0.16}px ${w * 0.06}px ${w * 0.06}px`, background: c }} />
            {last && <div style={{ position: "absolute", marginTop: w * 1.05, fontFamily: font, fontWeight: 800, fontSize: 26 * s, color: accent, opacity: k }}>vous</div>}
          </div>
        );
      })}
    </div>
  );
}

function Logo({ ctx, w, frames, ink }: Props) {
  const p = ctx.p;
  const onDark = ink === p.palette.textOnDark;
  if (p.logoAnimated && p.style.logoAnimation !== "aucune") return <AnimatedLogo ctx={ctx} height={w * 0.45} onDark={onDark} frames={frames} />;
  const img = onDark ? (p.logos.dark ?? p.logos.light) : (p.logos.light ?? p.logos.dark);
  // eslint-disable-next-line @next/next/no-img-element -- rendu vidéo (Remotion), pas une page Next.
  return img ? <img src={img} alt="" style={{ width: "100%", height: "auto" }} /> : null;
}

function Cta({ e, ctx, s }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const role = opt(prm, "couleur", "accent");
  const beat = p.music?.beatFrames ?? 15;
  const pulse = yes(prm, "pulsation", false) ? 1 + Math.max(0, Math.sin((frame / beat) * Math.PI * 2)) * 0.05 : 1;
  return (
    <div style={{ background: colorOf(p, role), color: pick(p, prm, "couleur_texte", onColor(p, role)), borderRadius: radiusOf(p, prm, s, 26), padding: `${28 * s}px ${50 * s}px`, textAlign: "center", fontFamily: ctx.body, fontWeight: 800, fontSize: 44 * s, boxShadow: shadowOf(prm, s), transform: `scale(${pulse})` }}>{p.cta}</div>
  );
}

/**
 * Le symbole du logo, sans le texte : les formes découpées du logo animable
 * (Kit de marque › Logos), avec leurs ombres et reflets, qui arrivent une à
 * une. Sans logo animable : le « Symbole seul » du kit ; sans lui, quatre
 * pastilles aux couleurs du kit.
 */
function Pastilles({ e, ctx, w }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const tint = opt(prm, "couleur", "auto");
  const color = tint === "auto" ? null : colorOf(p, tint);
  const mode = opt(prm, "animation", "construction");
  const step = p.music?.beatFrames ? p.music.beatFrames / 2 : 5;
  const logo = p.logoAnimated;
  if (logo && logo.symbol.length) return <Symbol e={e} logo={logo} color={color} mode={mode} step={step} frame={frame} w={w} />;
  const k = mode === "aucune" ? 1 : t(frame, 0, 12);
  if (p.logos.symbol) {
    // eslint-disable-next-line @next/next/no-img-element -- rendu vidéo (Remotion), pas une page Next.
    return <img src={p.logos.symbol} alt="" style={{ width: "100%", height: "auto", opacity: k }} />;
  }
  const d = w * 0.42;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(2, ${d}px)`, gap: w * 0.16, opacity: k }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ width: d, height: d, borderRadius: i === 1 ? "50% 50% 50% 0" : "50%", background: color ?? p.palette.accent }} />
      ))}
    </div>
  );
}

/**
 * Le symbole découpé du logo, recadré sur lui seul : le cadre du SVG englobe
 * tout le logo (nom compris). Il est mesuré au rendu sur une copie invisible
 * et non animée ; le rendu attend la mesure, pour que la vidéo soit juste dès
 * la première image.
 */
function Symbol({ e, logo, color, mode, step, frame, w }: { e: RenderElement; logo: NonNullable<RenderProps["logoAnimated"]>; color: string | null; mode: string; step: number; frame: number; w: number }) {
  const measure = useRef<SVGGElement>(null);
  const [box, setBox] = useState<string | null>(null);
  const [handle] = useState(() => delayRender("Mesure du symbole du logo"));
  useLayoutEffect(() => {
    const b = measure.current?.getBBox();
    const pad = b ? Math.max(b.width, b.height) * 0.04 : 0;
    setBox(b && b.width > 0 ? `${b.x - pad} ${b.y - pad} ${b.width + pad * 2} ${b.height + pad * 2}` : logo.viewBox);
    continueRender(handle);
  }, [logo, handle]);
  const pop = popOf(e);
  const cls = `sym-${Math.round(w)}`;
  return (
    <svg viewBox={box ?? logo.viewBox} style={{ width: "100%", height: "auto", overflow: "visible" }}>
      {color && <style>{`.${cls} *{fill:${color} !important}`}</style>}
      {logo.defs && <g dangerouslySetInnerHTML={{ __html: logo.defs }} />}
      <g ref={measure} style={{ visibility: "hidden" }} dangerouslySetInnerHTML={{ __html: logo.symbol.join("") }} />
      {box && (
        <g className={color ? cls : undefined}>
          {logo.symbol.map((m, i) => {
            const k = mode === "aucune" ? 1 : mode === "fondu" ? t(frame, 0, 12) : t(frame, i * step, 8, pop);
            return (
              <g
                key={i}
                style={{ opacity: Math.min(1, k * 1.5), transform: mode === "construction" ? `scale(${k})` : undefined, transformBox: "fill-box", transformOrigin: "center" }}
                dangerouslySetInnerHTML={{ __html: m }}
              />
            );
          })}
        </g>
      )}
    </svg>
  );
}

function Confettis({ e, ctx, w }: Props) {
  const frame = useFrame(e);
  const p = ctx.p;
  const prm = e.params;
  const n = Math.round(num(prm, "quantite", 18));
  const k = t(frame, 0, 22, Easing.out(Easing.cubic));
  const colors = opt(prm, "couleurs", "marque") === "accent" ? [p.palette.accent] : [p.palette.accent, p.palette.primary, "#ffffff"];
  return (
    <div style={{ position: "relative", width: w, height: w }}>
      {Array.from({ length: n }, (_, i) => {
        const a = (i / n) * Math.PI * 2;
        const r = (0.25 + ((i * 37) % 10) / 20) * w * k;
        return (
          <div key={i} style={{ position: "absolute", left: w / 2 + Math.cos(a) * r, top: w / 2 + Math.sin(a) * r + k * k * w * 0.15, width: w * 0.035, height: w * 0.06, background: colors[i % colors.length], borderRadius: 3, transform: `rotate(${i * 40 + frame * 8}deg)`, opacity: 1 - t(frame, 16, 10) }} />
        );
      })}
    </div>
  );
}

/** Une flèche dessinée de (x, y) à (x2, y2), en coordonnées du cadre. */
function Fleche({ e, ctx }: { e: RenderElement; ctx: Ctx }) {
  const frame = useFrame(e);
  const { p } = ctx;
  const prm = e.params;
  const color = colorOf(p, opt(prm, "couleur", "accent"));
  const k1 = p.width / 1080;
  const x1 = e.x * p.width;
  const y1 = e.y * p.height;
  const x2 = (e.x2 ?? e.x) * p.width;
  const y2 = (e.y2 ?? e.y) * p.height;
  const bend = num(prm, "courbure", 0.4) * 0.5;
  const mx = (x1 + x2) / 2 + (y2 - y1) * bend;
  const my = (y1 + y2) / 2 - (x2 - x1) * bend;
  const k = t(frame, 0, 14);
  const len = Math.hypot(x2 - x1, y2 - y1) * 1.4;
  const angle = Math.atan2(y2 - my, x2 - mx);
  const width = num(prm, "epaisseur", 10) * k1;
  const head = width * 3.4;
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width={p.width} height={p.height}>
      <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - k)} />
      <path
        d={`M${x2} ${y2} L${x2 - head * Math.cos(angle - 0.5)} ${y2 - head * Math.sin(angle - 0.5)} M${x2} ${y2} L${x2 - head * Math.cos(angle + 0.5)} ${y2 - head * Math.sin(angle + 0.5)}`}
        stroke={color}
        strokeWidth={width}
        strokeLinecap="round"
        opacity={k > 0.9 ? 1 : 0}
      />
    </svg>
  );
}

const RENDER: Record<string, (p: Props) => ReactNode> = {
  liste: Liste,
  notification: Notification,
  bouton: Bouton,
  planning: Planning,
  fiche: Fiche,
  champ: Champ,
  badge: Badge,
  tap: Tap,
  soulignement: Soulignement,
  titre: Titre,
  etiquette: Etiquette,
  bulle: Bulle,
  compteur: Compteur,
  logo: Logo,
  cta: Cta,
  pastilles: Pastilles,
  confettis: Confettis,
};

const DEFAULT_W: Record<string, number> = {
  liste: 0.8,
  notification: 0.92,
  bouton: 0.7,
  planning: 0.82,
  fiche: 0.86,
  champ: 0.7,
  badge: 0.36,
  tap: 0.12,
  surbrillance: 0.4,
  fleche: 0.3,
  soulignement: 0.5,
  titre: 0.86,
  etiquette: 0.42,
  bulle: 0.66,
  compteur: 0.8,
  logo: 0.42,
  cta: 0.5,
  pastilles: 0.2,
  confettis: 0.5,
};

const INLINE = new Set(["badge", "etiquette", "tap", "pastilles"]);

/**
 * Le grossissement du contenu, par élément (décision du 15/10/2026 : « les
 * éléments sont trop discrets et petits ») : une pub se regarde sur un
 * téléphone, en passant — le texte d'une carte doit se lire d'un coup d'œil.
 */
const BOOST: Record<string, number> = { notification: 1.3, bouton: 1.3, champ: 1.3, bulle: 1.3, badge: 1.5, etiquette: 1.35, cta: 1.25, compteur: 1.15, liste: 1.15, planning: 1.05, fiche: 1.05, titre: 1.2, tap: 1.25 };

/** L'entrée, la sortie et le mouvement d'un élément, communs à tous ; la vitesse et le rebond viennent de ses réglages. */
function useMotion(e: RenderElement, life: number, p: RenderProps): CSSProperties {
  const frame = useCurrentFrame();
  const speed = num(e.params, "vitesse", 1);
  const len = (10 * PACE[p.style.pace]) / speed;
  const k = e.entree === "aucune" ? 1 : t(frame, 0, len, e.entree === "pop" ? popOf(e) : ease);
  const out = e.sortie && e.sortie !== "aucune" ? interpolate(frame, [life - 8, life], [0, 1], clamp) : 0;
  const d = 70;
  const tr: string[] = [];
  const opacity = (e.entree === "impact" ? Math.min(1, frame / 3) : Math.min(1, k * 1.4)) * (1 - out);
  switch (e.entree) {
    case "pop":
      tr.push(`scale(${0.6 + 0.4 * k})`);
      break;
    case "impact": {
      // L'élément s'écrase sur l'écran : il arrive grand et retombe à sa taille avec un léger rebond.
      const hit = t(frame, 0, 9 / speed, Easing.out(Easing.back(2.2)));
      tr.push(`scale(${1.9 - 0.9 * hit}) rotate(${(1 - hit) * -4}deg)`);
      break;
    }
    case "glisse-haut":
      tr.push(`translateY(${(1 - k) * -d}%)`);
      break;
    case "glisse-bas":
      tr.push(`translateY(${(1 - k) * d}%)`);
      break;
    case "glisse-gauche":
      tr.push(`translateX(${(1 - k) * -d}%)`);
      break;
    case "glisse-droite":
      tr.push(`translateX(${(1 - k) * d}%)`);
      break;
    default:
      break;
  }
  if (e.sortie === "glisse-haut") tr.push(`translateY(${-out * d}%)`);
  if (e.sortie === "glisse-bas") tr.push(`translateY(${out * d}%)`);
  if (e.mouvement === "derive") tr.push(`translate(${Math.sin(frame / 40) * 1.2}%, ${frame * 0.04}%)`);
  if (e.mouvement === "flottement") tr.push(`translateY(${Math.sin(frame / 14) * 2}%)`);
  if (e.mouvement === "pulsation") tr.push(`scale(${1 + Math.max(0, Math.sin((frame / (p.music?.beatFrames ?? 15)) * Math.PI * 2 - Math.PI / 2)) * 0.04})`);
  return { opacity, transform: tr.join(" ") || undefined };
}

function Placed({ e, ctx, shotFrames, ink }: { e: RenderElement; ctx: Ctx; shotFrames: number; ink: string }) {
  const { p } = ctx;
  const frame = useCurrentFrame();
  const life = Math.max(1, (e.to ?? shotFrames) - e.from);
  const motion = useMotion(e, life, p);
  const w = (e.largeur ?? DEFAULT_W[e.type] ?? 0.5) * p.width;
  const scale = num(e.params, "taille_texte", 1);
  // Une carte se dessine à sa largeur ; une pastille de texte, à l'échelle du cadre (agrandie si on lui donne plus de largeur).
  const s = (INLINE.has(e.type) ? (p.width / 1080) * Math.max(0.6, (e.largeur ?? DEFAULT_W[e.type]) / DEFAULT_W[e.type]) : w / 1000) * scale * (BOOST[e.type] ?? 1);
  const cx = e.x * p.width;
  const cy = e.y * p.height;
  if (e.type === "surbrillance") {
    const h = (e.hauteur ?? 0.12) * p.height;
    return (
      <div style={{ position: "absolute", left: cx - w / 2, top: cy - h / 2, width: w, height: h, ...motion }}>
        <Surbrillance e={e} ctx={ctx} s={s} w={w} frames={life} ink={ink} />
      </div>
    );
  }
  if (e.type === "fleche") return <Fleche e={e} ctx={ctx} />;
  const Comp = RENDER[e.type];
  if (!Comp) return null;
  // L'élément qui se penche, lui seul : jusqu'à son angle, en 0,4 s, à partir de son heure.
  const tiltAt = e.inclinaison ? Math.round((e.inclinaison.debut ?? e.debut) * 30) - e.from : 0;
  const tilt = e.inclinaison ? e.inclinaison.angle * interpolate(frame, [tiltAt, tiltAt + 12], [0, 1], { ...clamp, easing: Easing.out(Easing.back(1.4)) }) : 0;
  return (
    <div style={{ position: "absolute", left: cx, top: cy, width: w, transform: `translate(-50%, -50%) rotate(${tilt}deg)` }}>
      <div style={{ ...motion, transformOrigin: "center", display: "flex", justifyContent: "center" }}>
        {/* Les pastilles de texte (badge, étiquette) gardent leur taille, centrées ; les cartes prennent toute la largeur. */}
        <div style={INLINE.has(e.type) ? { display: "flex", justifyContent: "center" } : { width: "100%" }}>
          <Comp e={e} ctx={ctx} s={s} w={w} frames={life} ink={ink} />
        </div>
      </div>
    </div>
  );
}

/** Les éléments d'un plan composé, chacun dans sa séquence (son image 0 est son entrée). */
export function Elements({ elements, ctx, shotFrames, ink }: { elements: RenderElement[]; ctx: Ctx; shotFrames: number; ink: string }) {
  return (
    <AbsoluteFill>
      {elements.map((e, i) => (
        <Sequence key={i} from={e.from} durationInFrames={Math.max(1, (e.to ?? shotFrames) - e.from)} layout="none">
          <Placed e={e} ctx={ctx} shotFrames={shotFrames} ink={ink} />
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
