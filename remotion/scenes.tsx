import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";

import type { RenderProps, RenderShot } from "../modules/ads/video/props";
import type { SceneData } from "../modules/ads/video/scenes";

/**
 * Les scènes de motion design (plan Publicité, §9 sexies, M2) : l'interface de
 * TIM recréée en vectoriel et animée — jamais une capture. Chacune prend les
 * couleurs du Kit (palette), les polices et les coins du style, et cale ses
 * entrées sur les demi-temps de la musique quand le tempo est connu.
 *
 * Le contenu (titres, noms, chiffres) vient de la partition, déjà vérifiée
 * (modules/ads/video/scenes.ts) : ce fichier ne fait que dessiner.
 */

type Ctx = { p: RenderProps; title: string; body: string; u: number };
type SceneShot = Extract<RenderShot, { kind: "scene" }>;

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const ease = Easing.bezier(0.2, 0.7, 0.2, 1);
const pop = Easing.out(Easing.back(1.8));
const PACE = { pose: 1.4, dynamique: 1, rapide: 0.7 } as const;

/** Le pas entre deux entrées : un demi-temps de la musique, sinon le rythme du style. */
const stepOf = (p: RenderProps): number => (p.music?.beatFrames ? p.music.beatFrames / 2 : 7 * PACE[p.style.pace]);
const radius = (p: RenderProps, u: number, base = 34) => (p.style.corners === "carres" ? 0 : p.style.corners === "pilule" ? Math.min(9999, base * 2.4 * u) : base * u);

/** Le fond de la scène, et la surface « écran de l'app » qui s'y détache. */
function colors(p: RenderProps) {
  const c = p.palette;
  const light = p.style.background === "clair";
  return {
    bg: light ? c.lightBg : c.darkBg,
    fg: light ? c.textOnLight : c.textOnDark,
    // L'écran de l'app : clair sur fond sombre, et l'inverse d'un ton sur fond clair.
    card: light ? c.textOnDark : c.lightBg,
    cardFg: c.textOnLight,
    accent: c.accent,
    primary: c.primary,
    muted: light ? `${c.textOnLight}99` : `${c.textOnLight}88`,
  };
}

const t = (frame: number, at: number, len = 10, easing = ease) => interpolate(frame, [at, at + len], [0, 1], { ...clamp, easing });

/** L'écran de l'app : une carte arrondie avec son en-tête — pas de bordure de téléphone, l'interface est le sujet. */
function Screen({ ctx, width, children, title, at = 0 }: { ctx: Ctx; width: number; children: ReactNode; title: string; at?: number }) {
  const { p, u } = ctx;
  const frame = useCurrentFrame();
  const k = t(frame, at, 12);
  const c = colors(p);
  return (
    <div
      style={{
        width,
        background: c.card,
        color: c.cardFg,
        borderRadius: radius(p, u, 40),
        boxShadow: `0 ${40 * u}px ${100 * u}px -${40 * u}px rgba(0,0,0,0.55)`,
        overflow: "hidden",
        opacity: k,
        transform: `translateY(${(1 - k) * 60 * u}px) scale(${0.96 + 0.04 * k})`,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 18 * u, padding: `${34 * u}px ${40 * u}px`, borderBottom: `${2 * u}px solid ${c.cardFg}14` }}>
        <div style={{ width: 18 * u, height: 18 * u, borderRadius: "50%", background: c.accent }} />
        <div style={{ fontFamily: ctx.title, fontWeight: 800, fontSize: 40 * u, letterSpacing: "-0.01em" }}>{title}</div>
      </div>
      <div style={{ padding: `${30 * u}px ${40 * u}px ${40 * u}px` }}>{children}</div>
    </div>
  );
}

function Center({ ctx, children, gap = 0 }: { ctx: Ctx; children: ReactNode; gap?: number }) {
  const c = colors(ctx.p);
  return <AbsoluteFill style={{ background: c.bg, color: c.fg, justifyContent: "center", alignItems: "center", gap: gap * ctx.u, padding: 70 * ctx.u }}>{children}</AbsoluteFill>;
}

/**
 * La légende d'une scène (facultative) : une grande phrase en haut, dans la
 * police du style ; la scène se décale alors vers le bas. En 9:16, la scène est
 * aussi un peu agrandie : le vertical a de la place.
 */
function Framed({ ctx, legend, children }: { ctx: Ctx; legend?: string; children: ReactNode }) {
  const { p, u } = ctx;
  const frame = useCurrentFrame();
  const tall = p.height > p.width * 1.4;
  const k = t(frame, 0, 10);
  const upper = p.style.titleUpper ? "uppercase" : "none";
  const c = colors(p);
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      {/* La scène d'abord (elle peint son fond), la légende par-dessus. */}
      <AbsoluteFill style={{ transform: legend ? `translateY(${p.height * (tall ? 0.07 : 0.06)}px) scale(${tall ? 0.96 : 0.86})` : `scale(${tall ? 1.08 : 1})` }}>{children}</AbsoluteFill>
      {legend && (
        <div style={{ position: "absolute", left: 80 * u, right: 80 * u, top: p.height * (tall ? 0.07 : 0.05), fontFamily: ctx.title, fontWeight: 900, fontSize: (tall ? 92 : 66) * u, lineHeight: 1.02, letterSpacing: "-0.02em", textTransform: upper, color: c.fg, opacity: k, transform: `translateY(${(1 - k) * 30 * u}px)` }}>
          {legend}
        </div>
      )}
    </AbsoluteFill>
  );
}

const screenWidth = (p: RenderProps) => p.width * (p.height > p.width * 1.4 ? 0.86 : p.height > p.width * 1.1 ? 0.74 : 0.66);
const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");

function Check({ k, color, size }: { k: number; color: string; size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" style={{ overflow: "visible" }}>
      <circle cx="12" cy="12" r="11" fill={k > 0 ? color : "none"} stroke={color} strokeWidth={2} opacity={0.35 + 0.65 * k} transform={`scale(${0.7 + 0.3 * k})`} style={{ transformOrigin: "12px 12px" }} />
      <path d="M7 12.5l3.2 3.2L17 9" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={16} strokeDashoffset={16 * (1 - k)} />
    </svg>
  );
}

/** Une liste de l'app qui se coche élément par élément, puis le bouton d'action. */
function Liste({ shot, ctx }: { shot: SceneShot; ctx: Ctx }) {
  const { p, u } = ctx;
  const d = shot.data as SceneData["liste"];
  const frame = useCurrentFrame();
  const step = stepOf(p);
  const c = colors(p);
  const done = 10 + d.elements.length * step + step;
  return (
    <Center ctx={ctx}>
      <Screen ctx={ctx} width={screenWidth(p)} title={d.titre}>
        {d.elements.map((e, i) => {
          const at = 8 + i * step;
          const k = t(frame, at, 9);
          const ck = t(frame, at + step * 0.8, 8, pop);
          return (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 24 * u, padding: `${20 * u}px 0`, borderBottom: i < d.elements.length - 1 ? `1px solid ${c.cardFg}1a` : "none", opacity: k, transform: `translateX(${(1 - k) * 50 * u}px)` }}>
              <div style={{ width: 64 * u, height: 64 * u, borderRadius: "50%", background: `${c.accent}26`, color: c.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ctx.body, fontWeight: 800, fontSize: 26 * u }}>{initials(e.nom)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 34 * u }}>{e.nom}</div>
                {e.detail && <div style={{ fontFamily: ctx.body, fontSize: 26 * u, opacity: 0.6 }}>{e.detail}</div>}
              </div>
              <Check k={ck} color={c.accent} size={52 * u} />
            </div>
          );
        })}
        <div
          style={{
            marginTop: 30 * u,
            background: c.accent,
            color: p.palette.textOnDark,
            borderRadius: radius(p, u, 20),
            padding: `${24 * u}px 0`,
            textAlign: "center",
            fontFamily: ctx.body,
            fontWeight: 800,
            fontSize: 34 * u,
            opacity: t(frame, done, 8),
            transform: `scale(${0.9 + 0.1 * t(frame, done, 10, pop)})`,
          }}
        >
          {d.action}
        </div>
      </Screen>
    </Center>
  );
}

/** Une notification de l'app glisse depuis le haut, sur un écran flouté. */
function Notification({ shot, ctx }: { shot: SceneShot; ctx: Ctx }) {
  const { p, u } = ctx;
  const d = shot.data as SceneData["notification"];
  const frame = useCurrentFrame();
  const c = colors(p);
  const k = t(frame, 6, 14, pop);
  const tick = t(frame, 6 + stepOf(p) * 3, 8, pop);
  return (
    <AbsoluteFill style={{ background: c.bg, color: c.fg }}>
      {/* L'écran derrière : des lignes d'interface floutées. */}
      <div style={{ position: "absolute", inset: `${p.height * 0.22}px ${p.width * 0.12}px`, borderRadius: radius(p, u, 40), background: `${c.card}`, opacity: 0.18, filter: `blur(${6 * u}px)` }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} style={{ height: 30 * u, margin: `${50 * u}px ${50 * u}px 0`, borderRadius: 15 * u, background: c.cardFg, width: `${60 + ((i * 17) % 35)}%` }} />
        ))}
      </div>
      <div
        style={{
          position: "absolute",
          left: p.width * 0.07,
          right: p.width * 0.07,
          top: p.height * (p.height > p.width * 1.4 ? 0.3 : 0.24),
          background: c.card,
          color: c.cardFg,
          borderRadius: radius(p, u, 36),
          padding: 36 * u,
          display: "flex",
          gap: 28 * u,
          alignItems: "flex-start",
          boxShadow: `0 ${30 * u}px ${80 * u}px -${20 * u}px rgba(0,0,0,0.5)`,
          transform: `translateY(${(1 - k) * -p.height * 0.35}px)`,
        }}
      >
        <div style={{ width: 88 * u, height: 88 * u, flex: "none", borderRadius: 22 * u, background: c.primary, color: p.palette.textOnDark, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: ctx.title, fontWeight: 900, fontSize: 30 * u }}>{d.app.slice(0, 3).toUpperCase()}</div>
        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: ctx.body, fontSize: 24 * u, opacity: 0.55, marginBottom: 6 * u }}>
            <span>{d.app}</span>
            <span>maintenant</span>
          </div>
          <div style={{ fontFamily: ctx.body, fontWeight: 800, fontSize: 38 * u, lineHeight: 1.15 }}>{d.titre}</div>
          <div style={{ fontFamily: ctx.body, fontSize: 30 * u, lineHeight: 1.3, opacity: 0.8, marginTop: 6 * u }}>{d.texte}</div>
        </div>
        <Check k={tick} color={c.accent} size={56 * u} />
      </div>
    </AbsoluteFill>
  );
}

const DAYS = ["L", "M", "M", "J", "V", "S", "D"];

/** Une semaine de planning dont les cases se remplissent, ligne par ligne. */
function Planning({ shot, ctx }: { shot: SceneShot; ctx: Ctx }) {
  const { p, u } = ctx;
  const d = shot.data as SceneData["planning"];
  const frame = useCurrentFrame();
  const c = colors(p);
  const step = stepOf(p);
  const days = DAYS.slice(0, Math.min(7, Math.max(5, d.jours)));
  const w = screenWidth(p);
  const labelW = w * 0.3;
  const cell = (w - 80 * u - labelW) / days.length - 8 * u;
  const tones = [c.accent, c.primary, `${c.accent}99`];
  return (
    <Center ctx={ctx}>
      <Screen ctx={ctx} width={w} title={d.titre}>
        <div style={{ display: "flex", marginLeft: labelW, gap: 8 * u, marginBottom: 14 * u }}>
          {days.map((day, i) => (
            <div key={i} style={{ width: cell, textAlign: "center", fontFamily: ctx.body, fontWeight: 700, fontSize: 24 * u, opacity: 0.5 }}>
              {day}
            </div>
          ))}
        </div>
        {d.lignes.map((l, r) => (
          <div key={r} style={{ display: "flex", alignItems: "center", gap: 8 * u, marginBottom: 12 * u }}>
            <div style={{ width: labelW - 8 * u, fontFamily: ctx.body, fontWeight: 700, fontSize: 28 * u, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{l}</div>
            {days.map((_, i) => {
              // Une case sur cinq reste vide (repos), à une place qui varie selon la ligne.
              const off = (i + r * 2) % 5 === 4;
              const k = t(frame, 10 + r * step + i * (step / 3), 7, pop);
              return (
                <div key={i} style={{ width: cell, height: cell * 0.78, borderRadius: Math.min(14 * u, radius(p, u, 14)), background: `${c.cardFg}0f`, position: "relative", overflow: "hidden" }}>
                  {!off && <div style={{ position: "absolute", inset: 4 * u, borderRadius: Math.min(10 * u, radius(p, u, 10)), background: tones[r % tones.length], transform: `scale(${k})`, opacity: k }} />}
                </div>
              );
            })}
          </div>
        ))}
      </Screen>
    </Center>
  );
}

/** Un chiffre sourcé qui défile jusqu'à sa valeur. */
function Compteur({ shot, ctx }: { shot: SceneShot; ctx: Ctx }) {
  const { p, u } = ctx;
  const frame = useCurrentFrame();
  const c = colors(p);
  const f = shot.figure;
  if (!f) return <Center ctx={ctx}>{null}</Center>;
  const digits = f.value.replace(/[^\d]/g, "");
  const target = Number(digits) || 0;
  const k = t(frame, 4, Math.min(shot.frames * 0.55, 40), Easing.out(Easing.cubic));
  // Le chiffre garde sa forme (espaces, séparateurs) : on remplace la partie numérique au fil du défilement.
  const current = Math.round(target * k).toLocaleString("fr-FR").replace(/ /g, " ");
  const shown = target ? f.value.replace(/\d[\d\s.,]*\d|\d/, current) : f.value;
  return (
    <Center ctx={ctx} gap={20}>
      <div style={{ fontFamily: ctx.title, fontWeight: 900, fontSize: 210 * u, lineHeight: 1, color: c.accent, letterSpacing: "-0.03em", fontVariantNumeric: "tabular-nums", transform: `scale(${0.85 + 0.15 * t(frame, 0, 12, pop)})` }}>{shown}</div>
      <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 52 * u, textAlign: "center", maxWidth: "88%", opacity: t(frame, 12, 10) }}>{f.label}</div>
      <div style={{ fontFamily: ctx.body, fontSize: 26 * u, opacity: 0.55 * t(frame, 18, 10) }}>Source : {f.source}</div>
    </Center>
  );
}

/** Une feuille papier se froisse ; l'écran propre la remplace. */
function AvantApres({ shot, ctx }: { shot: SceneShot; ctx: Ctx }) {
  const { p, u } = ctx;
  const d = shot.data as SceneData["avant-apres"];
  const frame = useCurrentFrame();
  const c = colors(p);
  const half = shot.frames * 0.45;
  const crumple = t(frame, half - 8, 12, Easing.in(Easing.cubic));
  const after = t(frame, half, 14, pop);
  const w = screenWidth(p) * 0.92;
  return (
    <Center ctx={ctx}>
      {/* La feuille : lignes manuscrites, puis froissée et jetée. */}
      <div
        style={{
          position: "absolute",
          width: w,
          height: w * 1.15,
          background: "#f5f0e6",
          color: "#3b3b3b",
          borderRadius: 8 * u,
          padding: 50 * u,
          transform: `rotate(${-4 - crumple * 40}deg) scale(${1 - crumple * 0.75}) translateY(${crumple * p.height * 0.35}px)`,
          opacity: 1 - crumple,
          boxShadow: `0 ${20 * u}px ${60 * u}px -${20 * u}px rgba(0,0,0,0.4)`,
        }}
      >
        <div style={{ fontFamily: ctx.title, fontWeight: 800, fontSize: 46 * u, marginBottom: 30 * u, textDecoration: frame > half * 0.5 ? "line-through" : "none", textDecorationColor: c.accent, textDecorationThickness: 6 * u }}>{d.avant}</div>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} style={{ height: 6 * u, margin: `${34 * u}px 0`, background: "#9a948a", opacity: 0.5, width: `${55 + ((i * 23) % 40)}%`, transform: `rotate(${((i % 3) - 1) * 0.8}deg)` }} />
        ))}
      </div>
      <div style={{ opacity: after, transform: `scale(${0.8 + 0.2 * after})` }}>
        <Screen ctx={ctx} width={w} title={d.apres} at={half}>
          {[0, 1, 2].map((i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 20 * u, padding: `${16 * u}px 0` }}>
              <Check k={t(frame, half + 8 + i * stepOf(p), 8, pop)} color={c.accent} size={46 * u} />
              <div style={{ height: 22 * u, borderRadius: 11 * u, background: `${c.cardFg}22`, flex: 1 }} />
            </div>
          ))}
        </Screen>
      </div>
    </Center>
  );
}

/** Un doigt tape le bouton, qui s'enfonce ; la confirmation apparaît. */
function Bouton({ shot, ctx }: { shot: SceneShot; ctx: Ctx }) {
  const { p, u } = ctx;
  const d = shot.data as SceneData["bouton"];
  const frame = useCurrentFrame();
  const c = colors(p);
  const tap = shot.frames * 0.4;
  const press = interpolate(frame, [tap - 3, tap, tap + 5], [0, 1, 0], clamp);
  const ripple = t(frame, tap, 14);
  const confirm = t(frame, tap + 6, 12, pop);
  const fingerIn = t(frame, 4, tap - 6, Easing.inOut(Easing.cubic));
  const w = screenWidth(p);
  return (
    <Center ctx={ctx}>
      <div style={{ position: "relative" }}>
        <Screen ctx={ctx} width={w} title={d.titre}>
          {[0, 1].map((i) => (
            <div key={i} style={{ height: 26 * u, borderRadius: 13 * u, background: `${c.cardFg}1c`, margin: `${22 * u}px 0`, width: `${85 - i * 25}%` }} />
          ))}
          <div style={{ position: "relative", marginTop: 40 * u }}>
            <div style={{ background: c.accent, color: p.palette.textOnDark, borderRadius: radius(p, u, 22), padding: `${30 * u}px 0`, textAlign: "center", fontFamily: ctx.body, fontWeight: 800, fontSize: 40 * u, transform: `scale(${1 - press * 0.06})`, boxShadow: `0 ${(1 - press) * 14 * u}px ${30 * u}px -${12 * u}px ${c.accent}` }}>
              {d.bouton}
            </div>
            <div style={{ position: "absolute", left: "50%", top: "50%", width: 40 * u, height: 40 * u, marginLeft: -20 * u, marginTop: -20 * u, borderRadius: "50%", border: `${4 * u}px solid ${c.accent}`, transform: `scale(${1 + ripple * 6})`, opacity: (1 - ripple) * (frame >= tap ? 1 : 0) }} />
          </div>
        </Screen>
        {/* Le doigt : un disque qui arrive sur le bouton. */}
        <div style={{ position: "absolute", left: "50%", bottom: 40 * u, width: 90 * u, height: 90 * u, marginLeft: -10 * u, borderRadius: "50%", background: `${c.fg}`, opacity: 0.85 * (1 - t(frame, tap + 8, 8)), transform: `translate(${(1 - fingerIn) * 200 * u}px, ${(1 - fingerIn) * 300 * u}px) scale(${1 - press * 0.15})`, boxShadow: `0 ${10 * u}px ${30 * u}px rgba(0,0,0,0.35)` }} />
      </div>
      <div style={{ position: "absolute", bottom: p.height * 0.12, left: p.width * 0.1, right: p.width * 0.1, display: "flex", alignItems: "center", gap: 20 * u, background: c.card, color: c.cardFg, borderRadius: radius(p, u, 28), padding: `${26 * u}px ${32 * u}px`, opacity: confirm, transform: `translateY(${(1 - confirm) * 80 * u}px)`, boxShadow: `0 ${20 * u}px ${60 * u}px -${20 * u}px rgba(0,0,0,0.5)` }}>
        <Check k={confirm} color={c.accent} size={56 * u} />
        <div style={{ fontFamily: ctx.body, fontWeight: 700, fontSize: 34 * u }}>{d.confirmation}</div>
      </div>
    </Center>
  );
}

/** Une épingle tombe sur une carte, une fiche chantier s'ouvre. */
function Carte({ shot, ctx }: { shot: SceneShot; ctx: Ctx }) {
  const { p, u } = ctx;
  const d = shot.data as SceneData["carte"];
  const frame = useCurrentFrame();
  const c = colors(p);
  const drop = t(frame, 6, 12, Easing.out(Easing.bounce));
  const card = t(frame, 6 + stepOf(p) * 2, 12, pop);
  const roads = [
    "M-50 300 C 250 260, 500 420, 1150 380",
    "M200 -50 C 260 400, 180 900, 300 2000",
    "M-50 1100 C 400 1000, 700 1250, 1150 1150",
    "M760 -50 C 700 600, 900 1300, 820 2000",
    "M-50 700 L 1150 760",
  ];
  return (
    <AbsoluteFill style={{ background: c.bg }}>
      <svg viewBox={`0 0 1080 ${Math.round((1080 * p.height) / p.width)}`} style={{ position: "absolute", inset: 0, opacity: 0.35 }}>
        {roads.map((r, i) => (
          <path key={i} d={r} fill="none" stroke={c.fg} strokeOpacity={0.35} strokeWidth={i === 4 ? 18 : 10} strokeDasharray={2400} strokeDashoffset={2400 * (1 - t(frame, i * 2, 20))} />
        ))}
      </svg>
      <div style={{ position: "absolute", left: p.width / 2 - 45 * u, top: p.height * 0.38 - 120 * u, transform: `translateY(${(1 - drop) * -p.height * 0.3}px)` }}>
        <svg width={90 * u} height={120 * u} viewBox="0 0 30 40">
          <path d="M15 0C6.7 0 0 6.7 0 15c0 11 15 25 15 25s15-14 15-25C30 6.7 23.3 0 15 0z" fill={c.accent} />
          <circle cx="15" cy="15" r="6" fill={p.palette.textOnDark} />
        </svg>
      </div>
      <div style={{ position: "absolute", left: p.width * 0.1, right: p.width * 0.1, top: p.height * 0.48, background: c.card, color: c.cardFg, borderRadius: radius(p, u, 32), padding: 40 * u, opacity: card, transform: `translateY(${(1 - card) * 60 * u}px)`, boxShadow: `0 ${30 * u}px ${80 * u}px -${30 * u}px rgba(0,0,0,0.5)` }}>
        <div style={{ fontFamily: ctx.title, fontWeight: 800, fontSize: 44 * u, marginBottom: 14 * u }}>{d.lieu}</div>
        {d.lignes.map((l, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 16 * u, fontFamily: ctx.body, fontSize: 32 * u, padding: `${8 * u}px 0`, opacity: t(frame, 10 + stepOf(p) * (3 + i), 8) }}>
            <div style={{ width: 14 * u, height: 14 * u, borderRadius: "50%", background: c.accent }} />
            {l}
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}

/** Texte cinétique : la phrase d'avant se barre, la bonne la remplace. */
function Texte({ shot, ctx }: { shot: SceneShot; ctx: Ctx }) {
  const { p, u } = ctx;
  const d = shot.data as SceneData["texte"];
  const frame = useCurrentFrame();
  const c = colors(p);
  const half = shot.frames * 0.42;
  const strike = t(frame, half * 0.55, 10);
  const out = t(frame, half, 8);
  const inn = t(frame, half + 4, 12, pop);
  const upper = p.style.titleUpper ? "uppercase" : "none";
  const size = (p.height > p.width * 1.4 ? 112 : 92) * u;
  const style: CSSProperties = { fontFamily: ctx.title, fontWeight: 900, fontSize: size, lineHeight: 1.02, letterSpacing: "-0.02em", textTransform: upper, textAlign: "center", maxWidth: "90%" };
  return (
    <Center ctx={ctx}>
      <div style={{ position: "absolute", ...style, opacity: (1 - out) * t(frame, 0, 8), transform: `translateY(${-out * 80 * u}px)` }}>
        <span style={{ position: "relative", opacity: 0.85 }}>
          {d.avant}
          <span style={{ position: "absolute", left: 0, top: "52%", height: 12 * u, width: `${strike * 100}%`, background: c.accent, borderRadius: 6 * u }} />
        </span>
      </div>
      <div style={{ position: "absolute", ...style, color: c.accent, opacity: inn, transform: `translateY(${(1 - inn) * 90 * u}px) scale(${0.92 + 0.08 * inn})` }}>{d.apres}</div>
    </Center>
  );
}

export function SceneView({ shot, ctx }: { shot: SceneShot; ctx: Ctx }): ReactNode {
  return (
    <Framed ctx={ctx} legend={shot.data.legende}>
      <Scene shot={shot} ctx={ctx} />
    </Framed>
  );
}

function Scene({ shot, ctx }: { shot: SceneShot; ctx: Ctx }): ReactNode {
  switch (shot.scene) {
    case "liste":
      return <Liste shot={shot} ctx={ctx} />;
    case "notification":
      return <Notification shot={shot} ctx={ctx} />;
    case "planning":
      return <Planning shot={shot} ctx={ctx} />;
    case "compteur":
      return <Compteur shot={shot} ctx={ctx} />;
    case "avant-apres":
      return <AvantApres shot={shot} ctx={ctx} />;
    case "bouton":
      return <Bouton shot={shot} ctx={ctx} />;
    case "carte":
      return <Carte shot={shot} ctx={ctx} />;
    default:
      return <Texte shot={shot} ctx={ctx} />;
  }
}
