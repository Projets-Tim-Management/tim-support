import { allowedNumbers, checkForbidden, checkNumbers, checkTestimonial } from "@/modules/ads/lib/copy/guardrails";
import { viewAllowed, type Framing, type Rect } from "@/modules/ads/lib/framing";
import { elementProblems, parseElement, parseFond, phoneProblems, type Element, type Fond } from "@/modules/ads/video/elements";
import { baseV1Problems, parseRole, type BaseContext, type BeatRole } from "@/modules/ads/video/base-v1";
import { parseTransition, transitionProblems, type Transition } from "@/modules/ads/video/transitions";

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

/** Une pub vidéo Meta efficace tient en 5 à 20 secondes (au-delà, on perd le fil d'actualité). */
export const MIN_TOTAL = 5;
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

type ShotBody =
  /** L'ouverture : le style décide de sa forme (titre mot à mot, problème sur un aplat, titre posé). */
  | { kind: "ouverture"; seconds: number; text: string; highlight?: string | null; sub?: string | null }
  /** Un passage d'un rush, éventuellement zoomé, avec une phrase en sous-titre. */
  | { kind: "rush"; seconds: number; rush: number; from: number; to: number; zoom?: Rect | null; caption?: string | null }
  /** Une preuve chiffrée : un fait sourcé (Paramètres › Faits sourcés), jamais un chiffre inventé. */
  | { kind: "preuve"; seconds: number; fact: number }
  /** Un plan composé : un fond (style, couleur, rush, image) et des éléments animés posés dessus (voir video/elements.ts). */
  | { kind: "compo"; seconds: number; fond: Fond; elements: Element[]; camera?: Camera | null }
  /** Le logo seul, animé s'il est déposé en SVG à calques (Kit de marque › Logos) : une signature, en ouverture par exemple. */
  | { kind: "logo"; seconds: number }
  /** La fin : logo, une phrase, le bouton et l'adresse du Kit de marque. */
  | { kind: "fin"; seconds: number; line?: string | null };

/**
 * Le mouvement de caméra d'un plan composé, tout le plan durant : un
 * panoramique (gauche, droite), une montée ou une descente, une avancée ou un
 * recul. Le fond bouge plus que les éléments posés dessus : on sent la profondeur.
 */
export const CAMERA_MOVES = ["aucun", "droite", "gauche", "descente", "montee", "avance", "recul", "suivi"] as const;
/** « suivi » : la caméra fonce d'un point à l'autre (un élément qui apparaît, puis le suivant), grossit, et floute le fond pendant le trajet. */
export type CameraPoint = { x: number; y: number; debut: number; echelle?: number; rotation?: number };
export type Camera = { mouvement: (typeof CAMERA_MOVES)[number]; amplitude?: number; points?: CameraPoint[] };

/** Un plan, et comment il entre depuis le précédent (voir video/transitions.ts ; sans choix : la transition du style). */
export type Shot = ShotBody & { transition?: Transition | null; role?: BeatRole };

/** `base` : la base de montage suivie (voir video/base-v1.ts). */
export type Score = { shots: Shot[]; base?: "v1" };

export type RushInfo = { id: number; ready: boolean; durationSec: number | null; framing: Framing | null; srcAspect?: number | null };
export type FactInfo = { id: number; statement: string; source: string };
export type ScoreContext = {
  rushes: Map<number, RushInfo>;
  facts: Map<number, FactInfo>;
  /** Chiffres autorisés au-delà des faits : ceux de l'offre (« essai gratuit de 30 jours »). */
  offer?: string | null;
  forbidden?: string[];
  /** Les variantes de l'atelier des éléments, par identifiant. */
  variants?: Map<number, { type: string; status: string }>;
  /** Un nouveau montage : seules les variantes actives (voir elements.ts). */
  requireActive?: boolean;
  /** Un montage écrit par une IA : la Base V1 est obligatoire (voir base-v1.ts). */
  requireBase?: boolean;
  /** De quoi vérifier la Base V1 : l'angle et les fonctionnalités des rushes. */
  base?: Omit<BaseContext, "facts" | "maxTotal">;
};

const n = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);
const s = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/** La partition reçue (d'un modèle) remise en forme ; les champs inconnus sont ignorés. Pure. */
export function parseScore(raw: unknown): Score {
  const shots = Array.isArray((raw as { shots?: unknown })?.shots) ? ((raw as { shots: unknown[] }).shots as Record<string, unknown>[]) : [];
  return {
    shots: shots.map((x): Shot => {
      const transition = parseTransition(x.transition);
      const role = parseRole(x.role);
      return { ...parseShotBody(x), ...(transition ? { transition } : {}), ...(role ? { role } : {}) };
    }),
    ...((raw as { base?: unknown })?.base === "v1" ? { base: "v1" as const } : {}),
  };
}

function parseShotBody(x: Record<string, unknown>): ShotBody {
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
    case "compo":
      return { kind: "compo", seconds, fond: parseFond(x.fond), elements: Array.isArray(x.elements) ? x.elements.map(parseElement) : [], ...(x.camera ? { camera: parseCameraMove(x.camera) } : {}) };
    default:
      return { kind: "fin", seconds, line: s(x.line) || null };
  }
}

function parseCameraMove(raw: unknown): Camera {
  const c = (raw && typeof raw === "object" ? raw : { mouvement: raw }) as Record<string, unknown>;
  const points = Array.isArray(c.points)
    ? (c.points as Record<string, unknown>[]).map((q) => ({ x: n(q.x), y: n(q.y), debut: n(q.debut), ...(typeof q.echelle === "number" ? { echelle: q.echelle } : {}), ...(typeof q.rotation === "number" ? { rotation: q.rotation } : {}) }))
    : undefined;
  return { mouvement: String(c.mouvement ?? "") as Camera["mouvement"], ...(typeof c.amplitude === "number" ? { amplitude: c.amplitude } : {}), ...(points ? { points } : {}) };
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
  const showsSoftware = (x: Shot) =>
    x.kind === "rush" || (x.kind === "compo" && (x.fond.type === "rush" || x.fond.type === "telephone" || x.elements.some((e) => ["liste", "notification", "bouton", "planning", "fiche", "champ"].includes(e.type))));
  if (!shots.some(showsSoftware)) out.push("Au moins un plan montre le logiciel : un passage de rush, ou un plan composé sur un rush ou avec un élément d'interface.");
  const total = shots.reduce((t, x) => t + (Number.isFinite(x.seconds) ? x.seconds : 0), 0);
  if (total < MIN_TOTAL || total > MAX_TOTAL) out.push(`Durée totale de ${Math.round(total * 10) / 10} s : entre ${MIN_TOTAL} et ${MAX_TOTAL} s.`);

  const allowed = allowedNumbers([...[...ctx.facts.values()].map((f) => f.statement), ctx.offer ?? ""]);
  shots.forEach((shot, i) => {
    const at = `Plan ${i + 1} (${shot.kind})`;
    if (!Number.isFinite(shot.seconds) || shot.seconds < MIN_SHOT || shot.seconds > MAX_SHOT) out.push(`${at} : durée de ${MIN_SHOT} à ${MAX_SHOT} s.`);
    for (const p of transitionProblems(shot.transition, i, i > 0 ? shots[i - 1].seconds : null, shot.seconds)) out.push(`${at} : ${p}`);
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
    if (shot.kind === "compo") {
      let rush: { srcAspect: number; framing: Framing | null } | null = null;
      if (shot.camera && !CAMERA_MOVES.includes(shot.camera.mouvement)) out.push(`${at} : caméra « ${shot.camera.mouvement} » inconnue (${CAMERA_MOVES.join(", ")}).`);
      if (shot.camera?.mouvement === "suivi") {
        const pts = shot.camera.points ?? [];
        if (pts.length < 1 || pts.length > 6) out.push(`${at} : caméra en suivi — de 1 à 6 points.`);
        pts.forEach((q, k) => {
          if (![q.x, q.y].every((v) => v >= 0 && v <= 1)) out.push(`${at} : caméra, point ${k + 1} — x et y entre 0 et 1.`);
          if (!(q.debut >= 0 && q.debut < shot.seconds)) out.push(`${at} : caméra, point ${k + 1} — début dans la durée du plan.`);
          if (k > 0 && !(q.debut >= pts[k - 1].debut + 0.3)) out.push(`${at} : caméra, point ${k + 1} — au moins 0,3 s après le précédent.`);
          if (q.echelle !== undefined && !(q.echelle >= 1 && q.echelle <= 2.5)) out.push(`${at} : caméra, point ${k + 1} — grossissement de ×1 à ×2,5.`);
          if (q.rotation !== undefined && !(Math.abs(q.rotation) <= 15)) out.push(`${at} : caméra, point ${k + 1} — inclinaison de -15 à 15 degrés.`);
        });
      }
      if (shot.camera?.amplitude !== undefined && !(shot.camera.amplitude >= 0.3 && shot.camera.amplitude <= 2)) out.push(`${at} : amplitude de caméra de 0,3 à 2.`);
      if (shot.fond.type === "telephone") for (const p of phoneProblems(shot.fond.telephone, shot.seconds)) out.push(`${at} : fond — ${p}`);
      if (shot.fond.type === "rush" || shot.fond.type === "telephone") {
        const r = ctx.rushes.get(Number(shot.fond.rush));
        const from = shot.fond.from ?? 0;
        const to = shot.fond.to ?? from + shot.seconds;
        if (!r) out.push(`${at} : fond — rush ${String(shot.fond.rush)} introuvable.`);
        else if (!r.ready) out.push(`${at} : fond — rush ${String(shot.fond.rush)} pas encore converti.`);
        else {
          const d = r.durationSec ?? 0;
          if (!(from >= 0 && to > from && to <= d + 0.05)) out.push(`${at} : fond — passage de ${from} à ${to} s hors du rush (${d} s).`);
          else {
            const speed = (to - from) / shot.seconds;
            if (speed < MIN_SPEED || speed > MAX_SPEED) out.push(`${at} : fond — vitesse ×${Math.round(speed * 10) / 10}, entre ×${MIN_SPEED} et ×${MAX_SPEED}.`);
          }
          const z = shot.fond.zoom;
          if (z) {
            if (![z.x, z.y, z.w, z.h].every(Number.isFinite) || z.w < MIN_ZOOM || z.h < MIN_ZOOM) out.push(`${at} : fond — zoom trop serré (${MIN_ZOOM * 100} % de l'image au moins).`);
            else if (!viewAllowed(z, r.framing ?? { crop: null, protect: null })) out.push(`${at} : fond — ce zoom sort de la zone utile ou coupe la zone à ne jamais couper.`);
          }
          const cam = shot.fond.camera;
          if (cam) {
            const v = cam.vers;
            const a = cam.debut ?? 0;
            const b = cam.fin ?? shot.seconds;
            if (![v.x, v.y, v.w, v.h].every(Number.isFinite) || v.w < MIN_ZOOM || v.h < MIN_ZOOM) out.push(`${at} : fond — caméra trop serrée (${MIN_ZOOM * 100} % de l'image au moins).`);
            else if (!viewAllowed(v, r.framing ?? { crop: null, protect: null })) out.push(`${at} : fond — la caméra sort de la zone utile ou coupe la zone à ne jamais couper.`);
            if (!(a >= 0 && b > a && b <= shot.seconds + 1e-9)) out.push(`${at} : fond — caméra de ${a} à ${b} s, dans la durée du plan (${shot.seconds} s).`);
          }
          // Dans un téléphone, l'écran filmé est montré entier : pas de zone protégée à recouvrir.
          rush = r.srcAspect && shot.fond.type === "rush" ? { srcAspect: r.srcAspect, framing: r.framing } : null;
        }
      }
      for (const p of elementProblems(shot.elements, shot.fond, { seconds: shot.seconds, facts: new Set(ctx.facts.keys()), allowed, forbidden: ctx.forbidden ?? [], rush, variants: ctx.variants, requireActive: ctx.requireActive })) out.push(`${at} : ${p}`);
    }
    for (const text of textsOf(shot).filter(Boolean)) {
      const problem = checkNumbers(text, allowed) ?? checkForbidden(text, ctx.forbidden ?? []) ?? checkTestimonial(text);
      if (problem) out.push(`${at} : ${problem}`);
    }
  });
  if (ctx.requireBase && score.base !== "v1") out.push("Un montage d'IA part de la Base V1 : écris base « v1 » et le rôle de chaque plan (voir la base dans lire_rushes).");
  if (score.base === "v1" || ctx.requireBase)
    out.push(...baseV1Problems(score, { angleFeatures: ctx.base?.angleFeatures ?? [], rushFeatures: ctx.base?.rushFeatures ?? new Map(), facts: new Set(ctx.facts.keys()), maxTotal: MAX_TOTAL }));
  return out;
}

/** La durée de la vidéo, en images. Pure. */
export const totalFrames = (score: Score): number => Math.max(1, Math.round(score.shots.reduce((t, x) => t + x.seconds, 0) * FPS));
