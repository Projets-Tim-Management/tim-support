import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, Sequence, useCurrentFrame } from "remotion";

import type { RenderElement, RenderProps } from "../modules/ads/video/props";
import { AnimatedLogo } from "./logo";

/**
 * Les éléments animés d'un plan composé (plan Publicité, §9 sexies, M2) :
 * sans fond, posés par-dessus le fond du plan — l'interface de TIM recréée,
 * des gestes, du texte, des chiffres sourcés, la marque, des formes.
 *
 * Chaque élément est dessiné à SA largeur (fraction du cadre), centré sur son
 * point (x, y), et vit dans sa propre séquence : son image 0 est son entrée.
 * L'entrée, la sortie et le mouvement sont communs à tous ; le contenu vient
 * de la partition, déjà vérifiée (modules/ads/video/elements.ts).
 */

type Ctx = { p: RenderProps; title: string; body: string; u: number };

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
const pop = Easing.out(Easing.back(1.8));
const PACE = { pose: 1.4, dynamique: 1, rapide: 0.7 } as const;
const t = (frame: number, at: number, len = 10, easing = ease) => interpolate(frame, [at, at + len], [0, 1], { ...clamp, easing });
const stepOf = (p: RenderProps): number => (p.music?.beatFrames ? p.music.beatFrames / 2 : 7 * PACE[p.style.pace]);
const radius = (p: RenderProps, s: number, base = 34) => (p.style.corners === "carres" ? 0 : p.style.corners === "pilule" ? base * 2.4 * s : base * s);
const str = (v: unknown) => (typeof v === "string" ? v : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map(str).filter(Boolean) : []);

/** Les couleurs d'un élément : les cartes de l'app sont claires, le texte libre prend l'encre du plan. */
function inks(p: RenderProps, ink: string) {
  const c = p.palette;
  return { card: c.lightBg, cardFg: c.textOnLight, accent: c.accent, primary: c.primary, ink, onAccent: c.textOnDark };
}

const shadow = (s: number) => `0 ${36 * s}px ${90 * s}px -${36 * s}px rgba(0,0,0,0.55)`;

function Check({ k, color, size }: { k: number; color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible", flex: "none" }}>
      <circle cx="12" cy="12" r="11" fill={k > 0 ? color : "none"} stroke={color} strokeWidth={2} opacity={0.35 + 0.65 * k} />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={16} strokeDashoffset={16 * (1 - k)} />
    </svg>
  );
}

/** Une carte de l'app : surface claire, en-tête discret avec la pastille d'accent. */
function Card({ ctx, s, title, children }: { ctx: Ctx; s: number; title?: string; children: ReactNode }) {
  const c = inks(ctx.p, "");
  return (
    <div style={{ background: c.card, color: c.cardFg, borderRadius: radius(ctx.p, s, 38), boxShadow: shadow(s), overflow: "hidden" }}>
      {title && (
        <div style={{ display: "flex", alignItems: "center", gap: 16 * s, padding: `${30 * s}px ${38 * s}px`, borderBottom: `${2 * s}px solid ${c.cardFg}14` }}>
          <div style={{ width: 16 * s, height: 16 * s, borderRadius: "50%", background: c.accent }} />
          <div style={{ fontFamily: ctx.title, fontWeight: 800, fontSize: 38 * s }}>{title}</div>
        </div>
      )}
      <div style={{ padding: `${26 * s}px ${38 * s}px ${34 * s}px` }}>{children}</div>
    </div>
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

function Liste({ e, ctx, s }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  const step = stepOf(ctx.p);
  const items = (Array.isArray(e.data.elements) ? e.data.elements : []) as { nom?: string; detail?: string }[];
  const done = 6 + items.length * step + step * 0.6;
  return (
    <Card ctx={ctx} s={s} title={str(e.data.titre)}>
      {items.map((it, i) => {
        const at = 4 + i * step;
        const k = t(frame, at, 9);
        return (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 22 * s, padding: `${18 * s}px 0`, borderBottom: i < items.length - 1 ? `1px solid ${c.cardFg}1a` : "none", opacity: k, transform: `translateX(${(1 - k) * 40 * s}px)` }}>
            <div style={{ width: 60 * s, height: 60 * s, borderRadius: "50%", background: `${c.accent}26`, color: c.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ctx.body, fontWeight: 800, fontSize: 24 * s }}>{initials(str(it.nom))}</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 32 * s }}>{str(it.nom)}</div>
              {it.detail && <div style={{ fontFamily: ctx.body, fontSize: 24 * s, opacity: 0.6 }}>{str(it.detail)}</div>}
            </div>
            <Check k={t(frame, at + step * 0.8, 8, pop)} color={c.accent} size={50 * s} />
          </div>
        );
      })}
      {str(e.data.action) && (
        <div style={{ marginTop: 26 * s, background: c.accent, color: c.onAccent, borderRadius: radius(ctx.p, s, 20), padding: `${22 * s}px 0`, textAlign: "center", fontFamily: ctx.body, fontWeight: 800, fontSize: 32 * s, opacity: t(frame, done, 8), transform: `scale(${0.9 + 0.1 * t(frame, done, 10, pop)})` }}>
          {str(e.data.action)}
        </div>
      )}
    </Card>
  );
}

function Notification({ e, ctx, s }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  const app = str(e.data.app) || "TIM";
  return (
    <div style={{ display: "flex", gap: 26 * s, alignItems: "flex-start", background: c.card, color: c.cardFg, borderRadius: radius(ctx.p, s, 34), padding: 34 * s, boxShadow: shadow(s) }}>
      <div style={{ width: 84 * s, height: 84 * s, flex: "none", borderRadius: 22 * s, background: c.primary, color: c.onAccent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ctx.title, fontWeight: 900, fontSize: 28 * s }}>{app.slice(0, 3).toUpperCase()}</div>
      <div style={{ flex: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: ctx.body, fontSize: 22 * s, opacity: 0.55, marginBottom: 6 * s }}>
          <span>{app}</span>
          <span>maintenant</span>
        </div>
        <div style={{ fontFamily: ctx.body, fontWeight: 800, fontSize: 36 * s, lineHeight: 1.15 }}>{str(e.data.titre)}</div>
        <div style={{ fontFamily: ctx.body, fontSize: 28 * s, lineHeight: 1.3, opacity: 0.8, marginTop: 6 * s }}>{str(e.data.texte)}</div>
      </div>
      <Check k={t(frame, stepOf(ctx.p) * 3, 8, pop)} color={c.accent} size={52 * s} />
    </div>
  );
}

function Bouton({ e, ctx, s, frames }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  const tap = Math.min(frames * 0.35, 24);
  const press = interpolate(frame, [tap - 3, tap, tap + 5], [0, 1, 0], clamp);
  const ripple = t(frame, tap, 14);
  const ok = t(frame, tap + 6, 12, pop);
  const conf = str(e.data.confirmation);
  return (
    <div style={{ position: "relative" }}>
      <div style={{ background: c.accent, color: c.onAccent, borderRadius: radius(ctx.p, s, 22), padding: `${32 * s}px 0`, textAlign: "center", fontFamily: ctx.body, fontWeight: 800, fontSize: 42 * s, transform: `scale(${1 - press * 0.06})`, boxShadow: `0 ${(1 - press) * 16 * s}px ${34 * s}px -${12 * s}px rgba(0,0,0,0.45)` }}>
        {str(e.data.bouton)}
      </div>
      <div style={{ position: "absolute", left: "50%", top: 54 * s, width: 40 * s, height: 40 * s, marginLeft: -20 * s, marginTop: -20 * s, borderRadius: "50%", border: `${4 * s}px solid ${c.card}`, transform: `scale(${1 + ripple * 6})`, opacity: (1 - ripple) * (frame >= tap ? 1 : 0) }} />
      {conf && (
        <div style={{ marginTop: 26 * s, display: "flex", alignItems: "center", gap: 18 * s, background: c.card, color: c.cardFg, borderRadius: radius(ctx.p, s, 26), padding: `${22 * s}px ${28 * s}px`, opacity: ok, transform: `translateY(${(1 - ok) * 40 * s}px)`, boxShadow: shadow(s) }}>
          <Check k={ok} color={c.accent} size={50 * s} />
          <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 32 * s }}>{conf}</div>
        </div>
      )}
    </div>
  );
}

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

function Planning({ e, ctx, s, w }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  const step = stepOf(ctx.p);
  const days = DAYS.slice(0, Math.min(7, Math.max(5, Number(e.data.jours) || 5)));
  const lignes = strs(e.data.lignes);
  const labelW = w * 0.3;
  const cell = (w - 76 * s - labelW) / days.length - 8 * s;
  const tones = [c.accent, c.primary, `${c.accent}99`];
  return (
    <Card ctx={ctx} s={s} title={str(e.data.titre)}>
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
          {days.map((_, i) => {
            const off = (i + r * 2) % 5 === 4;
            const k = t(frame, 6 + r * step + i * (step / 3), 7, pop);
            return (
              <div key={i} style={{ width: cell, height: cell * 0.78, borderRadius: Math.min(12 * s, radius(ctx.p, s, 12)), background: `${c.cardFg}0f`, position: "relative", overflow: "hidden" }}>
                {!off && <div style={{ position: "absolute", inset: 4 * s, borderRadius: Math.min(9 * s, radius(ctx.p, s, 9)), background: tones[r % tones.length], transform: `scale(${k})`, opacity: k }} />}
              </div>
            );
          })}
        </div>
      ))}
    </Card>
  );
}

function Fiche({ e, ctx, s }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  return (
    <Card ctx={ctx} s={s} title={str(e.data.lieu)}>
      {strs(e.data.lignes).map((l, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 * s, fontFamily: ctx.body, fontSize: 30 * s, padding: `${8 * s}px 0`, opacity: t(frame, 6 + stepOf(ctx.p) * (1 + i), 8) }}>
          <div style={{ width: 14 * s, height: 14 * s, borderRadius: "50%", background: c.accent }} />
          {l}
        </div>
      ))}
    </Card>
  );
}

function Champ({ e, ctx, s }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  const value = str(e.data.valeur);
  const typed = Math.round(interpolate(frame, [6, 6 + value.length * 1.6], [0, value.length], clamp));
  const caret = Math.floor(frame / 8) % 2 === 0;
  return (
    <div style={{ background: c.card, color: c.cardFg, borderRadius: radius(ctx.p, s, 28), padding: `${26 * s}px ${32 * s}px`, boxShadow: shadow(s) }}>
      <div style={{ fontFamily: ctx.body, fontSize: 24 * s, opacity: 0.6, marginBottom: 10 * s }}>{str(e.data.libelle)}</div>
      <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 36 * s, borderBottom: `${3 * s}px solid ${c.accent}`, paddingBottom: 8 * s, minHeight: 44 * s }}>
        {value.slice(0, typed)}
        <span style={{ opacity: caret ? 1 : 0, color: c.accent }}>|</span>
      </div>
    </div>
  );
}

function Badge({ e, ctx, s }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 14 * s, background: c.accent, color: c.onAccent, borderRadius: 999, padding: `${16 * s}px ${30 * s}px ${16 * s}px ${18 * s}px`, fontFamily: ctx.body, fontWeight: 800, fontSize: 32 * s, boxShadow: shadow(s) }}>
      <Check k={t(frame, 4, 8, pop)} color={c.onAccent} size={40 * s} />
      {str(e.data.texte)}
    </div>
  );
}

function Tap({ ctx, s, w }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  const press = interpolate(frame, [6, 9, 14], [0, 1, 0], clamp);
  const ripple = t(frame, 9, 16);
  const inK = t(frame, 0, 8);
  return (
    <div style={{ position: "relative", width: w, height: w }}>
      <div style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `${5 * s}px solid ${c.accent}`, transform: `scale(${0.4 + ripple * 1.6})`, opacity: (1 - ripple) * (frame >= 9 ? 1 : 0) }} />
      <div style={{ position: "absolute", inset: "18%", borderRadius: "50%", background: "#ffffff", opacity: 0.88 * inK, transform: `scale(${1 - press * 0.18}) translate(${(1 - inK) * 60}%, ${(1 - inK) * 80}%)`, boxShadow: `0 ${10 * s}px ${30 * s}px rgba(0,0,0,0.35)` }} />
    </div>
  );
}

function Surbrillance({ e, ctx, s, w }: Props & { h: number }) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  const k = t(frame, 0, 12);
  const round = e.data.forme === "cercle";
  return (
    <div style={{ width: "100%", height: "100%", borderRadius: round ? "50%" : radius(ctx.p, s, 22), border: `${6 * s}px solid ${c.accent}`, boxShadow: `0 0 0 ${3000 * s}px rgba(0,0,0,${0.45 * k})`, transform: `scale(${1.25 - 0.25 * k})`, opacity: k, minWidth: w * 0.1 }} />
  );
}

function Soulignement({ ctx, s }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  return <div style={{ height: 14 * s, borderRadius: 7 * s, background: c.accent, width: `${t(frame, 0, 12) * 100}%` }} />;
}

function Titre({ e, ctx, s, ink }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, ink);
  const text = str(e.data.texte);
  const strong = str(e.data.mot_fort).toLowerCase();
  const anim = str(e.data.animation) || "mot-a-mot";
  const upper = ctx.p.style.titleUpper ? "uppercase" : "none";
  const step = stepOf(ctx.p);
  const base: CSSProperties = { fontFamily: ctx.title, fontWeight: 900, fontSize: 100 * s, lineHeight: 1.02, letterSpacing: "-0.02em", textTransform: upper, color: c.ink };
  if (anim === "frappe") {
    const n = Math.round(interpolate(frame, [2, 2 + text.length * 1.2], [0, text.length], clamp));
    return <div style={base}>{text.slice(0, n)}</div>;
  }
  if (anim === "bloc") {
    const k = t(frame, 0, 12, pop);
    return <div style={{ ...base, opacity: k, transform: `scale(${0.88 + 0.12 * k})` }}>{text}</div>;
  }
  if (anim === "barre-remplace") {
    const strike = t(frame, step * 2, 10);
    const out = t(frame, step * 3.4, 8);
    const inn = t(frame, step * 3.6, 12, pop);
    return (
      <div style={{ position: "relative" }}>
        <div style={{ ...base, opacity: 1 - out }}>
          <span style={{ position: "relative" }}>
            {text}
            <span style={{ position: "absolute", left: 0, top: "52%", height: 12 * s, width: `${strike * 100}%`, background: c.accent, borderRadius: 6 * s }} />
          </span>
        </div>
        <div style={{ ...base, position: "absolute", inset: 0, color: c.accent, opacity: inn, transform: `translateY(${(1 - inn) * 60 * s}px)` }}>{str(e.data.remplacement)}</div>
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
          <span key={i} style={{ display: "inline-block", marginRight: "0.25em", opacity: k, transform: `translateY(${(1 - k) * 0.3}em)`, color: hot ? c.accent : c.ink }}>
            {w}
          </span>
        );
      })}
    </div>
  );
}

function Etiquette({ e, ctx, s }: Props) {
  const c = inks(ctx.p, "");
  return (
    <div style={{ display: "inline-flex", alignItems: "center", gap: 14 * s, background: c.card, color: c.cardFg, borderRadius: 999, padding: `${14 * s}px ${28 * s}px`, fontFamily: ctx.body, fontWeight: 700, fontSize: 30 * s, boxShadow: shadow(s) }}>
      <div style={{ width: 16 * s, height: 16 * s, borderRadius: "50%", background: c.accent }} />
      {str(e.data.texte)}
    </div>
  );
}

function Bulle({ e, ctx, s }: Props) {
  const c = inks(ctx.p, "");
  return (
    <div style={{ position: "relative", background: c.card, color: c.cardFg, borderRadius: radius(ctx.p, s, 34), padding: `${28 * s}px ${34 * s}px`, fontFamily: ctx.body, fontWeight: 600, fontSize: 34 * s, lineHeight: 1.3, boxShadow: shadow(s) }}>
      {str(e.data.texte)}
      <div style={{ position: "absolute", left: 50 * s, bottom: -18 * s, width: 40 * s, height: 40 * s, background: c.card, transform: "rotate(45deg)" }} />
    </div>
  );
}

function Compteur({ e, ctx, s, frames, ink }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, ink);
  const f = e.figure;
  if (!f) return null;
  const target = Number(f.value.replace(/[^\d]/g, "")) || 0;
  const k = t(frame, 2, Math.min(frames * 0.55, 40), Easing.out(Easing.cubic));
  const current = Math.round(target * k).toLocaleString("fr-FR").replace(/ /g, " ");
  const shown = target ? f.value.replace(/\d[\d\s.,]*\d|\d/, current) : f.value;
  return (
    <div style={{ textAlign: "center", color: c.ink }}>
      <div style={{ fontFamily: ctx.title, fontWeight: 900, fontSize: 190 * s, lineHeight: 1, color: c.accent, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums" }}>{shown}</div>
      <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 46 * s, marginTop: 14 * s, opacity: t(frame, 10, 10) }}>{f.label}</div>
      <div style={{ fontFamily: ctx.body, fontSize: 24 * s, marginTop: 8 * s, opacity: 0.6 * t(frame, 16, 10) }}>Source : {f.source}</div>
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

function Cta({ ctx, s }: Props) {
  const c = inks(ctx.p, "");
  return (
    <div style={{ background: c.accent, color: c.onAccent, borderRadius: radius(ctx.p, s, 26), padding: `${28 * s}px ${50 * s}px`, textAlign: "center", fontFamily: ctx.body, fontWeight: 800, fontSize: 44 * s, boxShadow: shadow(s) }}>{ctx.p.cta}</div>
  );
}

function Pastilles({ ctx, w }: Props) {
  const c = inks(ctx.p, "");
  const d = w * 0.42;
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(2, ${d}px)`, gap: w * 0.16 }}>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} style={{ width: d, height: d, borderRadius: i === 1 ? "50% 50% 50% 0" : "50%", background: c.accent }} />
      ))}
    </div>
  );
}

function Confettis({ ctx, w }: Props) {
  const frame = useCurrentFrame();
  const c = inks(ctx.p, "");
  const k = t(frame, 0, 22, Easing.out(Easing.cubic));
  const colors = [c.accent, c.primary, "#ffffff"];
  return (
    <div style={{ position: "relative", width: w, height: w }}>
      {Array.from({ length: 18 }, (_, i) => {
        const a = (i / 18) * Math.PI * 2;
        const r = (0.25 + ((i * 37) % 10) / 20) * w * k;
        return (
          <div key={i} style={{ position: "absolute", left: w / 2 + Math.cos(a) * r, top: w / 2 + Math.sin(a) * r + k * k * w * 0.15, width: w * 0.035, height: w * 0.06, background: colors[i % 3], borderRadius: 3, transform: `rotate(${i * 40 + frame * 8}deg)`, opacity: 1 - t(frame, 16, 10) }} />
        );
      })}
    </div>
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
  liste: 0.8, notification: 0.86, bouton: 0.6, planning: 0.82, fiche: 0.78, champ: 0.7, badge: 0.36, tap: 0.12, surbrillance: 0.4, fleche: 0.3, soulignement: 0.5,
  titre: 0.86, etiquette: 0.42, bulle: 0.66, compteur: 0.8, logo: 0.42, cta: 0.5, pastilles: 0.14, confettis: 0.5,
};

const INLINE = new Set(["badge", "etiquette", "tap", "pastilles"]);

/** L'entrée, la sortie et le mouvement d'un élément, communs à tous. */
function useMotion(e: RenderElement, life: number, p: RenderProps): CSSProperties {
  const frame = useCurrentFrame();
  const len = 10 * PACE[p.style.pace];
  const k = e.entree === "aucune" ? 1 : t(frame, 0, len, e.entree === "pop" ? pop : ease);
  const out = e.sortie && e.sortie !== "aucune" ? interpolate(frame, [life - 8, life], [0, 1], clamp) : 0;
  const d = 70;
  const tr: string[] = [];
  let opacity = Math.min(1, k * 1.4) * (1 - out);
  switch (e.entree) {
    case "pop":
      tr.push(`scale(${0.6 + 0.4 * k})`);
      break;
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
  if (e.sortie === "fondu" || e.sortie === "glisse-haut" || e.sortie === "glisse-bas") opacity *= 1;
  if (e.mouvement === "derive") tr.push(`translate(${Math.sin(frame / 40) * 1.2}%, ${frame * 0.04}%)`);
  if (e.mouvement === "flottement") tr.push(`translateY(${Math.sin(frame / 14) * 2}%)`);
  if (e.mouvement === "pulsation") tr.push(`scale(${1 + Math.max(0, Math.sin(((frame / (p.music?.beatFrames ?? 15)) * Math.PI * 2) - Math.PI / 2)) * 0.04})`);
  return { opacity, transform: tr.join(" ") || undefined };
}

function Placed({ e, ctx, shotFrames, ink }: { e: RenderElement; ctx: Ctx; shotFrames: number; ink: string }) {
  const { p } = ctx;
  const life = Math.max(1, (e.to ?? shotFrames) - e.from);
  const motion = useMotion(e, life, p);
  const w = (e.largeur ?? DEFAULT_W[e.type] ?? 0.5) * p.width;
  // Une carte se dessine à sa largeur ; une pastille de texte, à l'échelle du cadre (agrandie si on lui donne plus de largeur).
  const s = INLINE.has(e.type) ? (p.width / 1080) * Math.max(0.6, (e.largeur ?? DEFAULT_W[e.type]) / DEFAULT_W[e.type]) : w / 1000;
  const cx = e.x * p.width;
  const cy = e.y * p.height;
  if (e.type === "surbrillance") {
    const h = (e.hauteur ?? 0.12) * p.height;
    return (
      <div style={{ position: "absolute", left: cx - w / 2, top: cy - h / 2, width: w, height: h, ...motion }}>
        <Surbrillance e={e} ctx={ctx} s={s} w={w} h={h} frames={life} ink={ink} />
      </div>
    );
  }
  if (e.type === "fleche") return <Fleche e={e} ctx={ctx} />;
  const Comp = RENDER[e.type];
  if (!Comp) return null;
  return (
    <div style={{ position: "absolute", left: cx, top: cy, width: w, transform: "translate(-50%, -50%)" }}>
      <div style={{ ...motion, transformOrigin: "center", display: "flex", justifyContent: "center" }}>
        {/* Les pastilles de texte (badge, étiquette) gardent leur taille, centrées ; les cartes prennent toute la largeur. */}
        <div style={INLINE.has(e.type) ? { display: "flex", justifyContent: "center" } : { width: "100%" }}>
          <Comp e={e} ctx={ctx} s={s} w={w} frames={life} ink={ink} />
        </div>
      </div>
    </div>
  );
}

/** Une flèche dessinée de (x, y) à (x2, y2), en coordonnées du cadre. */
function Fleche({ e, ctx }: { e: RenderElement; ctx: Ctx }) {
  const frame = useCurrentFrame();
  const { p } = ctx;
  const c = inks(p, "");
  const x1 = e.x * p.width;
  const y1 = e.y * p.height;
  const x2 = (e.x2 ?? e.x) * p.width;
  const y2 = (e.y2 ?? e.y) * p.height;
  const mx = (x1 + x2) / 2 + (y2 - y1) * 0.2;
  const my = (y1 + y2) / 2 - (x2 - x1) * 0.2;
  const k = t(frame, 0, 14);
  const len = Math.hypot(x2 - x1, y2 - y1) * 1.3;
  const angle = Math.atan2(y2 - my, x2 - mx);
  const head = 34 * (p.width / 1080);
  return (
    <svg style={{ position: "absolute", inset: 0, overflow: "visible" }} width={p.width} height={p.height}>
      <path d={`M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}`} fill="none" stroke={c.accent} strokeWidth={10 * (p.width / 1080)} strokeLinecap="round" strokeDasharray={len} strokeDashoffset={len * (1 - k)} />
      <path
        d={`M${x2} ${y2} L${x2 - head * Math.cos(angle - 0.5)} ${y2 - head * Math.sin(angle - 0.5)} M${x2} ${y2} L${x2 - head * Math.cos(angle + 0.5)} ${y2 - head * Math.sin(angle + 0.5)}`}
        stroke={c.accent}
        strokeWidth={10 * (p.width / 1080)}
        strokeLinecap="round"
        opacity={k > 0.9 ? 1 : 0}
      />
    </svg>
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
