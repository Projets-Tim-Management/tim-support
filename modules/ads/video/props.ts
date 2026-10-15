import { coverRect, FULL, type Framing, type Rect } from "@/modules/ads/lib/framing";
import { fontFamily, mixColor, paletteOf, type Palette } from "@/modules/ads/lib/style";
import type { LogoParts } from "@/modules/ads/video/logo";
import { checkParams } from "@/modules/ads/video/element-params";
import type { Element, Fond } from "@/modules/ads/video/elements";
import { FORMAT_SIZES, FPS, MAX_SPEED, MIN_SPEED, type FormatKey, type Score } from "@/modules/ads/video/score";
import { resolveCuts, styleTransition, type RenderCut } from "@/modules/ads/video/transitions";

/**
 * Ce que le moteur vidéo reçoit (plan Publicité, §9 sexies, D3) : la
 * partition RÉSOLUE — adresses des rushes, cadrages calculés, polices et
 * couleurs du style et du kit. Le rendu (Remotion) n'a plus rien à décider ni
 * à aller chercher en base : il dessine. Sérialisable (JSON), car il traverse
 * jusqu'à la Sandbox.
 */

export type RenderStyle = {
  opening: "titre-mot-a-mot" | "aplat-probleme" | "titre-pose";
  background: "sombre" | "clair" | "aplats";
  proof: "ligne" | "chiffre-geant" | "chiffre-source";
  titleFont: string;
  bodyFont: string;
  titleUpper: boolean;
  phoneFrame: "maquette" | "ecran-seul" | "incline";
  zoomOnGesture: boolean;
  corners: "carres" | "arrondis" | "pilule";
  graphics: string[];
  pace: "pose" | "dynamique" | "rapide";
  transitions: string[];
  subtitles: "bandeau" | "mot-a-mot" | "aucun";
  /** Comment le logo arrive, quand il est déposé en SVG à calques : élément par élément, en fondu, ou posé (l'image). */
  logoAnimation: "construction" | "fondu" | "aucune";
};

export type RenderShot =
  | { kind: "ouverture"; frames: number; text: string; highlight: string | null; sub: string | null }
  | {
      kind: "rush";
      frames: number;
      src: string;
      /** Largeur / hauteur de l'image du rush. */
      srcAspect: number;
      /** Le début du passage, en secondes, et sa vitesse de lecture. */
      fromSec: number;
      playbackRate: number;
      /** La zone utile (montrée en entier dans un téléphone). */
      crop: Rect;
      /** Le cadrage plein cadre du format (écran seul), ou `null` s'il couperait la zone protégée. */
      cover: Rect | null;
      /** Le zoom demandé par la partition, déjà vérifié. */
      zoom: Rect | null;
      caption: string | null;
    }
  | { kind: "preuve"; frames: number; value: string; label: string; source: string }
  | { kind: "logo"; frames: number }
  /** Un plan composé : son fond résolu, et ses éléments minutés en images (un compteur reçoit le chiffre et la source de son fait). */
  | { kind: "compo"; frames: number; fond: RenderFond; elements: RenderElement[]; camera?: { move: string; amplitude: number; points?: { x: number; y: number; at: number; scale: number; rotate: number }[] } | null }
  | { kind: "fin"; frames: number; line: string | null };

export type RenderFond = (

  | { type: "style" }
  | { type: "couleur"; color: string }
  | { type: "rush"; src: string; srcAspect: number; fromSec: number; playbackRate: number; crop: Rect; cover: Rect | null; zoom: Rect | null; camera?: { to: Rect; from: number; until: number } | null; flou: boolean; voile: number }
  | { type: "image"; src: string; flou: boolean; voile: number }
  | RenderPhone
) & { halo?: boolean };
/** Le téléphone : l'écran filmé (zone utile entière), sa place, son entrée en 3D, sa plongée minutée en images. */
export type RenderPhone = {
  type: "telephone";
  src: string;
  srcAspect: number;
  fromSec: number;
  playbackRate: number;
  crop: Rect;
  /** La couleur derrière le téléphone, ou `null` : le fond du style. */
  color: string | null;
  x: number;
  y: number;
  height: number;
  entry: "monte" | "bascule" | "aucune";
  tilt: number;
  focus: { x: number; y: number; scale: number; from: number; until: number } | null;
};

/** Un élément prêt à dessiner : minuté en images, avec ses réglages (ceux de sa variante, complétés par les défauts). */
export type RenderElement = Element & { from: number; to: number | null; figure: { value: string; label: string; source: string } | null; params: Record<string, string | number | boolean> };

export type RenderProps = {
  format: FormatKey;
  width: number;
  height: number;
  fps: number;
  style: RenderStyle;
  palette: Palette;
  logos: { light: string | null; dark: string | null; symbol: string | null };
  cta: string;
  url: string;
  showLogo: boolean;
  /** La musique de cette vidéo : prise à son passage retenu ; `beatFrames` (un temps, en images) quand le tempo est connu. */
  music: { src: string; startSec: number; beatFrames: number | null } | null;
  /** Le logo animable (SVG à calques, découpé), ou `null` : on pose alors l'image du logo. */
  logoAnimated: LogoParts | null;
  /** Les visages des avatars (Médias publicitaires, nature « Visage »), pour les éléments qui en montrent. */
  faces?: string[];
  /**
   * L'affiche (image fixe) de la créa, quand on la rend : l'accroche, l'image
   * du rush dans son écran, le logo, le bouton. `null` pour la vidéo.
   */
  poster?: { hook: string; highlight: string | null; rush: Extract<RenderShot, { kind: "rush" }> | null } | null;
  shots: RenderShot[];
  /** Comment chaque plan entre (une par plan ; la première est toujours sèche). Absent : coupes sèches. */
  cuts?: RenderCut[];
};

type StyleDoc = Record<string, unknown>;
type Kit = Record<string, unknown> & { palette?: Record<string, unknown> | null; endCard?: { url?: string | null; showLogo?: boolean | null } | null };
const urlOf = (v: unknown): string | null => (v && typeof v === "object" ? ((v as { url?: string }).url ?? null) : null);
const one = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Une police de style : la sienne, ou celle du Kit de marque quand le style dit « kit ». */
const fontOf = (v: unknown, kit: unknown): string => fontFamily(v === "kit" ? kit : v);

/** Le style tel que le moteur le lit, chaque valeur inconnue remplacée par celle du style A. Pure. */
export function renderStyleOf(doc: StyleDoc, kit: Record<string, unknown> = {}): RenderStyle {
  return {
    opening: one(doc.opening, ["titre-mot-a-mot", "aplat-probleme", "titre-pose"] as const, "titre-mot-a-mot"),
    background: one(doc.background, ["sombre", "clair", "aplats"] as const, "sombre"),
    proof: one(doc.proof, ["ligne", "chiffre-geant", "chiffre-source"] as const, "ligne"),
    titleFont: fontOf(doc.titleFont, kit.titleFont),
    bodyFont: fontOf(doc.bodyFont, kit.bodyFont),
    titleUpper: (doc.titleCase === "kit" ? kit.titleCase : doc.titleCase) === "majuscules",
    phoneFrame: one(doc.phoneFrame, ["maquette", "ecran-seul", "incline"] as const, "maquette"),
    zoomOnGesture: doc.zoomOnGesture === true,
    corners: one(doc.corners, ["carres", "arrondis", "pilule"] as const, "arrondis"),
    graphics: Array.isArray(doc.graphics) ? (doc.graphics as string[]) : [],
    pace: one(doc.pace, ["pose", "dynamique", "rapide"] as const, "dynamique"),
    transitions: Array.isArray(doc.transitions) ? (doc.transitions as string[]) : [],
    subtitles: one(doc.subtitles, ["bandeau", "mot-a-mot", "aucun"] as const, "bandeau"),
    logoAnimation: one(doc.logoAnimation, ["construction", "fondu", "aucune"] as const, "construction"),
  };
}

/** Le chiffre d'un fait (« plus de 5 000 utilisateurs » → « 5 000 »), pour la preuve en géant. Pure. */
export function figureOf(statement: string): string {
  const m = statement.match(/\d[\d\s.,/]*\d|\d/);
  return m ? m[0].trim() : statement;
}

export type ResolveContext = {
  format: FormatKey;
  style: StyleDoc;
  kit: Kit;
  appearance?: Record<string, unknown> | null;
  cta: string;
  rushes: Map<number, { url: string; width: number; height: number; framing: Framing | null }>;
  facts: Map<number, { statement: string; source: string }>;
  /** La musique choisie pour cette vidéo (aucune : `null`). La partition est déjà calée sur son tempo. */
  music?: { url: string; startSec: number; bpm: number | null } | null;
  logoAnimated?: LogoParts | null;
  /** Les images des Médias publicitaires qu'un fond peut montrer, par identifiant. */
  media?: Map<number, string>;
  /** Les visages des avatars (Médias publicitaires, nature « Visage »). */
  faces?: string[];
  /** Les variantes d'éléments (Publicité › Éléments) : leur type de base et leurs réglages, par identifiant. */
  variants?: Map<number, { type: string; params: unknown }>;
};

/** Le fond d'un plan composé, résolu (adresse, cadrage, couleur). Un rush ou une image introuvable retombe sur le fond du style. Pure. */
/** La couleur d'un fond plein : une couleur du kit, ou une de ses nuances. Pure. */
export function backgroundColor(pal: Palette, c: NonNullable<Fond["couleur"]>): string {
  const white = "#ffffff";
  return {
    principale: pal.primary,
    accent: pal.accent,
    sombre: pal.darkBg,
    clair: pal.lightBg,
    "accent-pale": mixColor(pal.accent, white, 0.88),
    "principale-pale": mixColor(pal.primary, white, 0.9),
    "sombre-doux": mixColor(pal.darkBg, white, 0.16),
  }[c];
}

function fondOf(f: Fond, seconds: number, aspect: number, ctx: ResolveContext): RenderFond {
  const pal = paletteOf(ctx.kit, ctx.appearance);
  if (f.type === "couleur") return { type: "couleur", color: backgroundColor(pal, f.couleur ?? "principale") };
  if (f.type === "rush") {
    const r = ctx.rushes.get(Number(f.rush));
    if (!r) return { type: "style" };
    const framing = r.framing ?? { crop: null, protect: null };
    const srcAspect = r.width / r.height;
    const c = coverRect(srcAspect, framing, aspect);
    const from = f.from ?? 0;
    const to = f.to ?? from + seconds;
    return {
      type: "rush",
      src: r.url,
      srcAspect,
      fromSec: from,
      playbackRate: Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(((to - from) / seconds) * 1000) / 1000)),
      crop: framing.crop ?? FULL,
      cover: c.fits ? c.rect : null,
      zoom: f.zoom ?? null,
      camera: f.camera ? { to: f.camera.vers, from: Math.round((f.camera.debut ?? 0) * FPS), until: Math.round((f.camera.fin ?? seconds) * FPS) } : null,
      flou: Boolean(f.flou),
      voile: f.voile ?? 0,
    };
  }
  if (f.type === "telephone") {
    const r = ctx.rushes.get(Number(f.rush));
    if (!r) return { type: "style" };
    const from = f.from ?? 0;
    const to = f.to ?? from + seconds;
    const t = f.telephone ?? {};
    return {
      type: "telephone",
      src: r.url,
      srcAspect: r.width / r.height,
      fromSec: from,
      playbackRate: Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(((to - from) / seconds) * 1000) / 1000)),
      crop: r.framing?.crop ?? FULL,
      color: f.couleur ? backgroundColor(pal, f.couleur) : null,
      x: t.x ?? 0.5,
      y: t.y ?? 0.52,
      height: t.hauteur ?? 0.72,
      entry: t.entree ?? "monte",
      tilt: t.inclinaison ?? 0,
      focus: t.focus ? { x: t.focus.x, y: t.focus.y, scale: t.focus.echelle, from: Math.round((t.focus.debut ?? 0) * FPS), until: Math.round((t.focus.fin ?? seconds) * FPS) } : null,
    };
  }
  if (f.type === "image") {
    const src = f.media != null ? ctx.media?.get(f.media) : undefined;
    return src ? { type: "image", src, flou: Boolean(f.flou), voile: f.voile ?? 0 } : { type: "style" };
  }
  return { type: "style" };
}

/** La partition résolue pour un format. Suppose une partition VÉRIFIÉE (scoreProblems vide). Pure. */
/** Le halo d'un fond plein (voir Fond.halo), reporté tel quel. */
const withHalo = <T extends RenderFond>(fond: T, f: Fond): T => (f.halo ? { ...fond, halo: true } : fond);

export function buildRenderProps(score: Score, ctx: ResolveContext): RenderProps {
  const { width, height } = FORMAT_SIZES[ctx.format];
  const aspect = width / height;
  const frames = (seconds: number) => Math.max(1, Math.round(seconds * FPS));
  const style = renderStyleOf(ctx.style, ctx.kit);
  const props: RenderProps = {
    format: ctx.format,
    width,
    height,
    fps: FPS,
    style,
    palette: paletteOf(ctx.kit, ctx.appearance),
    logos: { light: urlOf(ctx.kit.logoOnLight), dark: urlOf(ctx.kit.logoOnDark), symbol: urlOf(ctx.kit.logoSymbol) },
    cta: ctx.cta,
    url: ctx.kit.endCard?.url || "tim-management.co",
    showLogo: ctx.kit.endCard?.showLogo !== false,
    logoAnimated: ctx.logoAnimated ?? null,
    faces: ctx.faces ?? [],
    music: ctx.music ? { src: ctx.music.url, startSec: ctx.music.startSec, beatFrames: ctx.music.bpm ? Math.round((60 / ctx.music.bpm) * FPS * 100) / 100 : null } : null,
    shots: score.shots.map((shot): RenderShot => {
      switch (shot.kind) {
        case "ouverture":
          return { kind: "ouverture", frames: frames(shot.seconds), text: shot.text, highlight: shot.highlight ?? null, sub: shot.sub ?? null };
        case "rush": {
          const r = ctx.rushes.get(shot.rush)!;
          const srcAspect = r.width / r.height;
          const framing = r.framing ?? { crop: null, protect: null };
          const c = coverRect(srcAspect, framing, aspect);
          return {
            kind: "rush",
            frames: frames(shot.seconds),
            src: r.url,
            srcAspect,
            fromSec: shot.from,
            // Bornée : le calage sur la musique peut allonger ou raccourcir un plan d'un demi-temps.
            playbackRate: Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(((shot.to - shot.from) / shot.seconds) * 1000) / 1000)),
            crop: framing.crop ?? FULL,
            cover: c.fits ? c.rect : null,
            zoom: shot.zoom ?? null,
            caption: shot.caption ?? null,
          };
        }
        case "preuve": {
          const f = ctx.facts.get(shot.fact)!;
          return { kind: "preuve", frames: frames(shot.seconds), value: figureOf(f.statement), label: f.statement, source: f.source };
        }
        case "logo":
          return { kind: "logo", frames: frames(shot.seconds) };
        case "compo":
          return {
            kind: "compo",
            frames: frames(shot.seconds),
            fond: withHalo(fondOf(shot.fond, shot.seconds, aspect, ctx), shot.fond),
            camera:
              shot.camera && shot.camera.mouvement !== "aucun"
                ? {
                    move: shot.camera.mouvement,
                    amplitude: shot.camera.amplitude ?? 1,
                    ...(shot.camera.points ? { points: shot.camera.points.map((q) => ({ x: q.x, y: q.y, at: Math.round(q.debut * FPS), scale: q.echelle ?? 1.6, rotate: q.rotation ?? 0 })) } : {}),
                  }
                : null,
            elements: shot.elements.map((e) => {
              const fact = e.type === "compteur" ? ctx.facts.get(Number(e.data.fact)) : null;
              const variant = e.variante != null ? ctx.variants?.get(e.variante) : undefined;
              return {
                ...e,
                params: checkParams(e.type, variant && variant.type === e.type ? variant.params : {}).params,
                from: Math.round(e.debut * FPS),
                to: e.fin !== undefined ? Math.round(e.fin * FPS) : null,
                figure: fact ? { value: figureOf(fact.statement), label: String(e.data.libelle ?? "") || fact.statement, source: fact.source } : null,
              };
            }),
          };
        default:
          return { kind: "fin", frames: frames(shot.seconds), line: shot.line ?? null };
      }
    }),
  };
  props.cuts = resolveCuts(
    score.shots.map((x) => x.transition),
    props.shots.map((x) => x.frames),
    styleTransition(style.transitions, style.pace),
    FPS,
  );
  return props;
}

/**
 * L'affiche d'une créa (image fixe, dans le style) pour un format : l'accroche,
 * l'image du premier passage de rush (au milieu du passage, là où le geste se
 * voit), le logo et le bouton. Suppose une partition VÉRIFIÉE. Pure.
 */
export function buildPosterProps(score: Score, ctx: ResolveContext, hook: string): RenderProps {
  const props = buildRenderProps(score, ctx);
  const opening = score.shots.find((s) => s.kind === "ouverture");
  const rush = props.shots.find((s): s is Extract<RenderShot, { kind: "rush" }> => s.kind === "rush") ?? null;
  const source = score.shots.find((s) => s.kind === "rush");
  const mid = source && source.kind === "rush" ? Math.round(((source.from + source.to) / 2) * 100) / 100 : 0;
  return {
    ...props,
    music: null,
    shots: [],
    poster: {
      hook: hook.trim() || (opening && opening.kind === "ouverture" ? opening.text : ""),
      highlight: opening && opening.kind === "ouverture" ? (opening.highlight ?? null) : null,
      rush: rush ? { ...rush, fromSec: mid, playbackRate: 1 } : null,
    },
  };
}
