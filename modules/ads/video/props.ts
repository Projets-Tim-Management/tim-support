import { coverRect, FULL, type Framing, type Rect } from "@/modules/ads/lib/framing";
import { BACKGROUNDS, CORNERS, fontFamily, LOGO_ANIMATIONS, mixColor, OPENINGS, PACES, paletteOf, PHONE_FRAMES, PROOF_STYLES, SUBTITLE_STYLES, type Palette } from "@/modules/ads/lib/style";
import type { LogoParts } from "@/modules/ads/video/logo";
import { checkParams } from "@/modules/ads/video/element-params";
import type { Element, Fond } from "@/modules/ads/video/elements";
import { oneOf } from "@/modules/ads/video/parse";
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
/** `tiltAt` : l'image (depuis l'entrée de l'élément) où il commence à se pencher, quand il a une inclinaison. */
export type RenderElement = Element & { from: number; to: number | null; figure: { value: string; label: string; source: string } | null; params: Record<string, string | number | boolean>; tiltAt?: number };

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
/** Les valeurs d'une liste de choix des Paramètres (lib/style.ts) : la même source pour le formulaire et pour le moteur. */
const valuesOf = <T extends string>(list: readonly { value: T }[]): readonly T[] => list.map((x) => x.value);
const OPENING_VALUES = valuesOf(OPENINGS);
const BACKGROUND_VALUES = valuesOf(BACKGROUNDS);
const PROOF_VALUES = valuesOf(PROOF_STYLES);
const PHONE_FRAME_VALUES = valuesOf(PHONE_FRAMES);
const CORNER_VALUES = valuesOf(CORNERS);
const PACE_VALUES = valuesOf(PACES);
const SUBTITLE_VALUES = valuesOf(SUBTITLE_STYLES);
const LOGO_ANIMATION_VALUES = valuesOf(LOGO_ANIMATIONS);

/** Une police de style : la sienne, ou celle du Kit de marque quand le style dit « kit ». */
const fontOf = (v: unknown, kit: unknown): string => fontFamily(v === "kit" ? kit : v);

/** Le style tel que le moteur le lit, chaque valeur inconnue remplacée par celle du style A. Pure. */
export function renderStyleOf(doc: StyleDoc, kit: Record<string, unknown> = {}): RenderStyle {
  return {
    opening: oneOf(doc.opening, OPENING_VALUES, "titre-mot-a-mot"),
    background: oneOf(doc.background, BACKGROUND_VALUES, "sombre"),
    proof: oneOf(doc.proof, PROOF_VALUES, "ligne"),
    titleFont: fontOf(doc.titleFont, kit.titleFont),
    bodyFont: fontOf(doc.bodyFont, kit.bodyFont),
    titleUpper: (doc.titleCase === "kit" ? kit.titleCase : doc.titleCase) === "majuscules",
    phoneFrame: oneOf(doc.phoneFrame, PHONE_FRAME_VALUES, "maquette"),
    zoomOnGesture: doc.zoomOnGesture === true,
    corners: oneOf(doc.corners, CORNER_VALUES, "arrondis"),
    graphics: Array.isArray(doc.graphics) ? (doc.graphics as string[]) : [],
    pace: oneOf(doc.pace, PACE_VALUES, "dynamique"),
    transitions: Array.isArray(doc.transitions) ? (doc.transitions as string[]) : [],
    subtitles: oneOf(doc.subtitles, SUBTITLE_VALUES, "bandeau"),
    logoAnimation: oneOf(doc.logoAnimation, LOGO_ANIMATION_VALUES, "construction"),
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
  rushes: Map<number, ResolvedRush>;
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

type ResolvedRush = { url: string; width: number; height: number; framing: Framing | null };

/** Le passage d'un fond rush ou téléphone : depuis le début du rush, et pour la durée du plan, sauf mention contraire. Pure. */
const fondSpan = (f: Fond, seconds: number): { from: number; to: number } => {
  const from = f.from ?? 0;
  return { from, to: f.to ?? from + seconds };
};

/**
 * Un passage de rush tel que le moteur le lit : son adresse, sa proportion, son
 * début, sa vitesse et sa zone utile. La vitesse est bornée : le calage sur la
 * musique peut allonger ou raccourcir un plan d'un demi-temps. Pure.
 */
function passageOf(r: ResolvedRush, from: number, to: number, seconds: number) {
  return {
    src: r.url,
    srcAspect: r.width / r.height,
    fromSec: from,
    playbackRate: Math.min(MAX_SPEED, Math.max(MIN_SPEED, Math.round(((to - from) / seconds) * 1000) / 1000)),
    crop: r.framing?.crop ?? FULL,
  };
}

/** Le cadrage plein cadre d'un rush dans un format, ou `null` s'il couperait la zone protégée. Pure. */
function coverOf(r: ResolvedRush, aspect: number): Rect | null {
  const c = coverRect(r.width / r.height, r.framing ?? { crop: null, protect: null }, aspect);
  return c.fits ? c.rect : null;
}

/** Le fond d'un plan composé, résolu (adresse, cadrage, couleur). Un rush ou une image introuvable retombe sur le fond du style. Pure. */
function fondOf(f: Fond, seconds: number, aspect: number, ctx: ResolveContext, pal: Palette): RenderFond {
  if (f.type === "couleur") return { type: "couleur", color: backgroundColor(pal, f.couleur ?? "principale") };
  if (f.type === "rush") {
    const r = ctx.rushes.get(Number(f.rush));
    if (!r) return { type: "style" };
    const { from, to } = fondSpan(f, seconds);
    return {
      type: "rush",
      ...passageOf(r, from, to, seconds),
      cover: coverOf(r, aspect),
      zoom: f.zoom ?? null,
      camera: f.camera ? { to: f.camera.vers, from: Math.round((f.camera.debut ?? 0) * FPS), until: Math.round((f.camera.fin ?? seconds) * FPS) } : null,
      flou: Boolean(f.flou),
      voile: f.voile ?? 0,
    };
  }
  if (f.type === "telephone") {
    const r = ctx.rushes.get(Number(f.rush));
    if (!r) return { type: "style" };
    const { from, to } = fondSpan(f, seconds);
    const t = f.telephone ?? {};
    return {
      type: "telephone",
      ...passageOf(r, from, to, seconds),
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

/** Le halo d'un fond plein (voir Fond.halo), reporté tel quel. */
const withHalo = <T extends RenderFond>(fond: T, f: Fond): T => (f.halo ? { ...fond, halo: true } : fond);

/** La partition résolue pour un format. Suppose une partition VÉRIFIÉE (scoreProblems vide). Pure. */
export function buildRenderProps(score: Score, ctx: ResolveContext): RenderProps {
  const { width, height } = FORMAT_SIZES[ctx.format];
  const aspect = width / height;
  const frames = (seconds: number) => Math.max(1, Math.round(seconds * FPS));
  const style = renderStyleOf(ctx.style, ctx.kit);
  const palette = paletteOf(ctx.kit, ctx.appearance);
  const props: RenderProps = {
    format: ctx.format,
    width,
    height,
    fps: FPS,
    style,
    palette,
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
          return {
            kind: "rush",
            frames: frames(shot.seconds),
            ...passageOf(r, shot.from, shot.to, shot.seconds),
            cover: coverOf(r, aspect),
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
            fond: withHalo(fondOf(shot.fond, shot.seconds, aspect, ctx, palette), shot.fond),
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
                ...(e.inclinaison ? { tiltAt: Math.round((e.inclinaison.debut ?? e.debut) * FPS) - Math.round(e.debut * FPS) } : {}),
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

/** L'image de l'app que montre l'affiche : au milieu du premier passage qui montre le logiciel. Pure. */
function posterScreen(score: Score, props: RenderProps): Extract<RenderShot, { kind: "rush" }> | null {
  const mid = (from: number, to: number) => Math.round(((from + to) / 2) * 100) / 100;
  for (const [i, source] of score.shots.entries()) {
    const shot = props.shots[i];
    if (source.kind === "rush" && shot?.kind === "rush") return { ...shot, fromSec: mid(source.from, source.to), playbackRate: 1 };
    if (source.kind === "compo" && shot?.kind === "compo" && (shot.fond.type === "telephone" || shot.fond.type === "rush")) {
      const f = shot.fond;
      const { from, to } = fondSpan(source.fond, source.seconds);
      return { kind: "rush", frames: shot.frames, src: f.src, srcAspect: f.srcAspect, fromSec: mid(from, to), playbackRate: 1, crop: f.crop, cover: f.type === "rush" ? f.cover : null, zoom: null, caption: null };
    }
  }
  return null;
}

/**
 * L'affiche d'une créa (image fixe, dans le style) pour un format : l'accroche,
 * l'image du premier passage de rush (au milieu du passage, là où le geste se
 * voit), le logo et le bouton. Suppose une partition VÉRIFIÉE. Pure.
 */
export function buildPosterProps(score: Score, ctx: ResolveContext, hook: string): RenderProps {
  const props = buildRenderProps(score, ctx);
  const opening = score.shots.find((s) => s.kind === "ouverture");
  // L'écran de l'app : le premier passage de rush, ou — en Base V1, faite de plans composés — le premier fond qui
  // montre le logiciel (le téléphone du geste, un rush). Sans lui, l'affiche n'aurait que l'accroche (revue du 16/10/2026).
  const screen = posterScreen(score, props);
  return {
    ...props,
    music: null,
    shots: [],
    poster: {
      hook: hook.trim() || (opening && opening.kind === "ouverture" ? opening.text : ""),
      highlight: opening && opening.kind === "ouverture" ? (opening.highlight ?? null) : null,
      rush: screen,
    },
  };
}
