import { allowedNumbers, checkForbidden, checkNumbers, checkTestimonial } from "@/modules/ads/lib/copy/guardrails";
import { viewAllowed, type Framing, type Rect } from "@/modules/ads/lib/framing";
import { isSceneType, parseSceneData, sceneProblems, type SceneCommon, type SceneData, type SceneType } from "@/modules/ads/video/scenes";

/**
 * La partition d'une vidéo publicitaire (plan Publicité, §9 sexies, D3) : ce
 * que le directeur artistique écrit — des plans, dans l'ordre — et que le
 * moteur (Remotion) rend dans le style choisi, aux trois formats Meta.
 *
 * L'IA n'écrit pas de code : elle écrit une partition, que CE fichier vérifie
 * avant tout rendu. Durées, passages de rush, zooms, textes, chiffres : une
 * partition qui ne passe pas n'est jamais rendue, et la raison est dite.
 */

export const FPS = 30;
export const FORMAT_SIZES = {
  "9x16": { width: 1080, height: 1920 },
  "4x5": { width: 1080, height: 1350 },
  "1x1": { width: 1080, height: 1080 },
} as const;
export type FormatKey = keyof typeof FORMAT_SIZES;
export const FORMAT_KEYS = Object.keys(FORMAT_SIZES) as FormatKey[];

/** Une pub vidéo Meta efficace tient en 6 à 20 secondes (au-delà, on perd le fil d'actualité). */
export const MIN_TOTAL = 6;
export const MAX_TOTAL = 20;
export const MIN_SHOT = 0.8;
export const MAX_SHOT = 6;
/** Un passage de rush peut être ralenti ou accéléré, dans ces bornes : au-delà, l'écran devient illisible ou saccadé. */
export const MIN_SPEED = 0.5;
export const MAX_SPEED = 2.5;
/** Un zoom plus serré que 30 % de l'image grossirait les pixels. */
export const MIN_ZOOM = 0.3;
export const MAX_OPENING_CHARS = 70;
export const MAX_CAPTION_CHARS = 90;

export type Shot =
  /** L'ouverture : le style décide de sa forme (titre mot à mot, problème sur un aplat, titre posé). */
  | { kind: "ouverture"; seconds: number; text: string; highlight?: string | null; sub?: string | null }
  /** Un passage d'un rush, éventuellement zoomé, avec une phrase en sous-titre. */
  | { kind: "rush"; seconds: number; rush: number; from: number; to: number; zoom?: Rect | null; caption?: string | null }
  /** Une preuve chiffrée : un fait sourcé (Paramètres › Faits sourcés), jamais un chiffre inventé. */
  | { kind: "preuve"; seconds: number; fact: number }
  /** Une scène de motion design : l'interface de TIM recréée et animée (voir video/scenes.ts). */
  | { kind: "scene"; seconds: number; scene: SceneType; data: SceneData[SceneType] & SceneCommon }
  /** Le logo seul, animé s'il est déposé en SVG à calques (Kit de marque › Logos) : une signature, en ouverture par exemple. */
  | { kind: "logo"; seconds: number }
  /** La fin : logo, une phrase, le bouton et l'adresse du Kit de marque. */
  | { kind: "fin"; seconds: number; line?: string | null };

export type Score = { shots: Shot[] };

export type RushInfo = { id: number; ready: boolean; durationSec: number | null; framing: Framing | null };
export type FactInfo = { id: number; statement: string; source: string };
export type ScoreContext = {
  rushes: Map<number, RushInfo>;
  facts: Map<number, FactInfo>;
  /** Chiffres autorisés au-delà des faits : ceux de l'offre (« essai gratuit de 30 jours »). */
  offer?: string | null;
  forbidden?: string[];
};

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** La partition reçue (d'un modèle) remise en forme ; les champs inconnus sont ignorés. Pure. */
export function parseScore(raw: unknown): Score {
  const shots = Array.isArray((raw as { shots?: unknown })?.shots) ? ((raw as { shots: unknown[] }).shots as Record<string, unknown>[]) : [];
  return {
    shots: shots.map((x): Shot => {
      const seconds = n(x.seconds);
      switch (x.kind) {
        case "ouverture":
          return { kind: "ouverture", seconds, text: s(x.text), highlight: s(x.highlight) || null, sub: s(x.sub) || null };
        case "rush": {
          const z = x.zoom as Record<string, unknown> | null | undefined;
          const zoom = z && typeof z === "object" ? { x: n(z.x), y: n(z.y), w: n(z.w), h: n(z.h) } : null;
          return { kind: "rush", seconds, rush: n(x.rush), from: n(x.from), to: n(x.to), zoom, caption: s(x.caption) || null };
        }
        case "preuve":
          return { kind: "preuve", seconds, fact: n(x.fact) };
        case "logo":
          return { kind: "logo", seconds };
        case "scene": {
          // Un type inconnu garde son nom : la vérification le refusera avec la raison.
          const scene = (isSceneType(x.scene) ? x.scene : String(x.scene ?? "")) as SceneType;
          return { kind: "scene", seconds, scene, data: isSceneType(x.scene) ? parseSceneData(x.scene, x.data) : ({} as never) };
        }
        default:
          return { kind: "fin", seconds, line: s(x.line) || null };
      }
    }),
  };
}

/** Les textes affichés à l'écran, pour les garde-fous. Pure. */
const textsOf = (shot: Shot): string[] =>
  shot.kind === "ouverture" ? [shot.text, shot.sub ?? ""] : shot.kind === "rush" ? [shot.caption ?? ""] : shot.kind === "fin" ? [shot.line ?? ""] : [];

/**
 * Tout ce qui empêche de rendre cette partition, dans l'ordre des plans ; vide
 * si elle est bonne. Pure.
 */
export function scoreProblems(score: Score, ctx: ScoreContext): string[] {
  const out: string[] = [];
  const shots = score.shots;
  if (shots.length < 2) out.push("Une vidéo a au moins deux plans, dont la fin.");
  if (shots.at(-1)?.kind !== "fin") out.push("Le dernier plan est la fin (logo, bouton, adresse).");
  if (shots.filter((x) => x.kind === "fin").length > 1) out.push("Une seule fin.");
  if (!shots.some((x) => x.kind === "rush" || x.kind === "scene")) out.push("Au moins un plan montre le logiciel : un passage de rush ou une scène recréée.");
  const total = shots.reduce((t, x) => t + (Number.isFinite(x.seconds) ? x.seconds : 0), 0);
  if (total < MIN_TOTAL || total > MAX_TOTAL) out.push(`Durée totale de ${Math.round(total * 10) / 10} s : entre ${MIN_TOTAL} et ${MAX_TOTAL} s.`);

  const allowed = allowedNumbers([...[...ctx.facts.values()].map((f) => f.statement), ctx.offer ?? ""]);
  shots.forEach((shot, i) => {
    const at = `Plan ${i + 1} (${shot.kind})`;
    if (!Number.isFinite(shot.seconds) || shot.seconds < MIN_SHOT || shot.seconds > MAX_SHOT) out.push(`${at} : durée de ${MIN_SHOT} à ${MAX_SHOT} s.`);
    if (shot.kind === "ouverture") {
      if (!shot.text) out.push(`${at} : texte vide.`);
      if (shot.text.length > MAX_OPENING_CHARS) out.push(`${at} : ${shot.text.length} caractères, ${MAX_OPENING_CHARS} au plus — une ouverture se lit en un coup d'œil.`);
      if (shot.highlight && !shot.text.toLowerCase().includes(shot.highlight.toLowerCase())) out.push(`${at} : le mot mis en avant doit être dans le texte.`);
    }
    if (shot.kind === "rush") {
      const r = ctx.rushes.get(shot.rush);
      if (!r) out.push(`${at} : rush ${shot.rush} introuvable.`);
      else if (!r.ready) out.push(`${at} : rush ${shot.rush} pas encore converti.`);
      else {
        const d = r.durationSec ?? 0;
        if (!(shot.from >= 0 && shot.to > shot.from && shot.to <= d + 0.05)) out.push(`${at} : passage de ${shot.from} à ${shot.to} s hors du rush (${d} s).`);
        else {
          const speed = (shot.to - shot.from) / shot.seconds;
          if (speed < MIN_SPEED || speed > MAX_SPEED) out.push(`${at} : vitesse ×${Math.round(speed * 10) / 10}, entre ×${MIN_SPEED} et ×${MAX_SPEED}.`);
        }
        if (shot.zoom) {
          const z = shot.zoom;
          if (![z.x, z.y, z.w, z.h].every(Number.isFinite) || z.w < MIN_ZOOM || z.h < MIN_ZOOM) out.push(`${at} : zoom trop serré (${MIN_ZOOM * 100} % de l'image au moins).`);
          else if (!viewAllowed(z, r.framing ?? { crop: null, protect: null })) out.push(`${at} : ce zoom sort de la zone utile ou coupe la zone à ne jamais couper.`);
        }
      }
      if ((shot.caption ?? "").length > MAX_CAPTION_CHARS) out.push(`${at} : sous-titre de ${(shot.caption ?? "").length} caractères, ${MAX_CAPTION_CHARS} au plus.`);
    }
    if (shot.kind === "preuve" && !ctx.facts.has(shot.fact)) out.push(`${at} : fait ${shot.fact} introuvable — une preuve est toujours un fait sourcé.`);
    if (shot.kind === "scene") {
      if (!isSceneType(shot.scene)) out.push(`${at} : scène « ${shot.scene} » inconnue.`);
      else for (const p of sceneProblems(shot.scene, shot.data, { facts: new Set(ctx.facts.keys()), allowed, forbidden: ctx.forbidden ?? [] })) out.push(`${at} (${shot.scene}) : ${p}`);
    }
    for (const text of textsOf(shot).filter(Boolean)) {
      const problem = checkNumbers(text, allowed) ?? checkForbidden(text, ctx.forbidden ?? []) ?? checkTestimonial(text);
      if (problem) out.push(`${at} : ${problem}`);
    }
  });
  return out;
}

/** La durée de la vidéo, en images. Pure. */
export const totalFrames = (score: Score): number => Math.max(1, Math.round(score.shots.reduce((t, x) => t + x.seconds, 0) * FPS));
