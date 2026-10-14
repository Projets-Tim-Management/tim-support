import { coverRect, FULL, type Framing, type Rect } from "@/modules/ads/lib/framing";
import { fontFamily, paletteOf, type Palette } from "@/modules/ads/lib/style";
import { FORMAT_SIZES, FPS, type FormatKey, type Score } from "@/modules/ads/video/score";

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
  | { kind: "fin"; frames: number; line: string | null };

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
  music: string | null;
  shots: RenderShot[];
};

type StyleDoc = Record<string, unknown>;
type Kit = Record<string, unknown> & { palette?: Record<string, unknown> | null; endCard?: { url?: string | null; showLogo?: boolean | null } | null };
const urlOf = (v: unknown): string | null => (v && typeof v === "object" ? ((v as { url?: string }).url ?? null) : null);
const one = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);

/** Le style tel que le moteur le lit, chaque valeur inconnue remplacée par celle du style A. Pure. */
export function renderStyleOf(doc: StyleDoc): RenderStyle {
  return {
    opening: one(doc.opening, ["titre-mot-a-mot", "aplat-probleme", "titre-pose"] as const, "titre-mot-a-mot"),
    background: one(doc.background, ["sombre", "clair", "aplats"] as const, "sombre"),
    proof: one(doc.proof, ["ligne", "chiffre-geant", "chiffre-source"] as const, "ligne"),
    titleFont: fontFamily(doc.titleFont),
    bodyFont: fontFamily(doc.bodyFont),
    titleUpper: doc.titleCase === "majuscules",
    phoneFrame: one(doc.phoneFrame, ["maquette", "ecran-seul", "incline"] as const, "maquette"),
    zoomOnGesture: doc.zoomOnGesture === true,
    corners: one(doc.corners, ["carres", "arrondis", "pilule"] as const, "arrondis"),
    graphics: Array.isArray(doc.graphics) ? (doc.graphics as string[]) : [],
    pace: one(doc.pace, ["pose", "dynamique", "rapide"] as const, "dynamique"),
    transitions: Array.isArray(doc.transitions) ? (doc.transitions as string[]) : [],
    subtitles: one(doc.subtitles, ["bandeau", "mot-a-mot", "aucun"] as const, "bandeau"),
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
};

/** La partition résolue pour un format. Suppose une partition VÉRIFIÉE (scoreProblems vide). Pure. */
export function buildRenderProps(score: Score, ctx: ResolveContext): RenderProps {
  const { width, height } = FORMAT_SIZES[ctx.format];
  const aspect = width / height;
  const frames = (seconds: number) => Math.max(1, Math.round(seconds * FPS));
  return {
    format: ctx.format,
    width,
    height,
    fps: FPS,
    style: renderStyleOf(ctx.style),
    palette: paletteOf(ctx.kit, ctx.appearance),
    logos: { light: urlOf(ctx.kit.logoOnLight), dark: urlOf(ctx.kit.logoOnDark), symbol: urlOf(ctx.kit.logoSymbol) },
    cta: ctx.cta,
    url: ctx.kit.endCard?.url || "tim-management.co",
    showLogo: ctx.kit.endCard?.showLogo !== false,
    music: urlOf(ctx.kit.music),
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
            playbackRate: Math.round(((shot.to - shot.from) / shot.seconds) * 1000) / 1000,
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
        default:
          return { kind: "fin", frames: frames(shot.seconds), line: shot.line ?? null };
      }
    }),
  };
}
