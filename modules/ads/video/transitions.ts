/**
 * Les transitions entre deux plans d'une vidéo (plan Publicité, décision du
 * 15/10/2026 : « les transitions, c'est vraiment pas fameux »). Une coupe n'est
 * plus un plan qui s'arrête net et un autre qui commence : les deux plans se
 * CHEVAUCHENT le temps de la transition, centrée sur la coupe — la durée totale
 * ne change pas, et une coupe calée sur un temps de la musique le reste.
 *
 * Chaque plan dit comment il ENTRE (le premier entre toujours sec). Sans choix,
 * c'est la transition par défaut du style. Pur : rien ici ne dessine.
 */

export const TRANSITION_TYPES = ["coupe", "fondu", "poussee", "glisse", "zoom", "volet", "flash", "cercle"] as const;
export type TransitionType = (typeof TRANSITION_TYPES)[number];

/** Ce que chaque transition fait, pour l'agent et l'écran. */
export const TRANSITION_GUIDE: Record<TransitionType, string> = {
  coupe: "coupe sèche — énergie, sur un temps fort",
  fondu: "fondu enchaîné — doux, pour passer d'une idée à la suite",
  poussee: "le plan suivant pousse le précédent vers le haut — un fil continu (geste, défilement)",
  glisse: "glissé latéral rapide avec flou de mouvement — dynamique, « et en plus… »",
  zoom: "zoom qui traverse : on plonge dans le plan suivant — pour entrer dans un détail",
  volet: "dévoilement en biais, à bord doux, avec un léger zoom — changement de partie, révélation",
  flash: "éclair à la couleur d'accent sur la coupe — impact, chiffre, résultat",
  cercle: "le plan suivant s'ouvre en cercle depuis un point (x, y en fractions du cadre) — depuis un doigt qui tape, un bouton, une coche : la conséquence d'un geste",
};

export type Transition = { type: TransitionType; seconds?: number | null; x?: number | null; y?: number | null };

/** Bornes d'une transition : en deçà on ne la voit pas, au-delà elle mange le plan. */
export const MIN_TRANSITION = 0.15;
export const MAX_TRANSITION = 0.8;
/** Durée par défaut, selon le rythme du style. */
export const DEFAULT_TRANSITION_SEC = { pose: 0.5, dynamique: 0.4, rapide: 0.3 } as const;

export const isTransitionType = (v: unknown): v is TransitionType => TRANSITION_TYPES.includes(v as TransitionType);

/** Une transition reçue (d'un modèle) remise en forme, ou `null`. Pure. */
export function parseTransition(raw: unknown): Transition | null {
  if (!raw || typeof raw !== "object") return isTransitionType(raw) ? { type: raw } : null;
  const r = raw as Record<string, unknown>;
  const seconds = typeof r.seconds === "number" && Number.isFinite(r.seconds) ? r.seconds : null;
  const at = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  return { type: (isTransitionType(r.type) ? r.type : String(r.type ?? "")) as TransitionType, seconds, ...(at(r.x) != null || at(r.y) != null ? { x: at(r.x), y: at(r.y) } : {}) };
}

/** Ce qui ne va pas dans la transition d'entrée d'un plan, sachant la durée des deux plans. Pure. */
export function transitionProblems(t: Transition | null | undefined, index: number, prevSeconds: number | null, seconds: number): string[] {
  if (!t) return [];
  if (!isTransitionType(t.type)) return [`transition « ${String(t.type)} » inconnue (${TRANSITION_TYPES.join(", ")}).`];
  if (index === 0 && t.type !== "coupe") return ["le premier plan entre sec : pas de transition avant lui."];
  if (t.type === "cercle" && [t.x, t.y].some((v) => v != null && !(v >= 0 && v <= 1))) return ["transition en cercle : x et y entre 0 et 1."];
  if (t.seconds == null || t.type === "coupe") return [];
  if (t.seconds < MIN_TRANSITION || t.seconds > MAX_TRANSITION) return [`transition de ${t.seconds} s : de ${MIN_TRANSITION} à ${MAX_TRANSITION} s.`];
  const room = Math.min(prevSeconds ?? Infinity, seconds) / 2;
  if (t.seconds > room + 1e-9) return [`transition de ${t.seconds} s : au plus la moitié du plus court des deux plans (${Math.round(room * 100) / 100} s).`];
  return [];
}

/** La transition par défaut d'un style : la première de sa liste (les styles ne connaissaient que coupe, glissé, zoom). Pure. */
export function styleTransition(styleTransitions: string[], pace: keyof typeof DEFAULT_TRANSITION_SEC): Transition {
  const first = styleTransitions.find(isTransitionType) ?? "coupe";
  return { type: first, seconds: DEFAULT_TRANSITION_SEC[pace] };
}

/** Une transition prête à dessiner : son type et sa durée en images (0 pour une coupe). */
export type RenderCut = { type: TransitionType; frames: number; x?: number; y?: number };

/**
 * Les coupes résolues, une par plan (comment il entre) : la transition choisie
 * ou celle du style, bornée à la moitié du plus court des deux plans. Pure.
 */
export function resolveCuts(chosen: (Transition | null | undefined)[], shotFrames: number[], fallback: Transition, fps: number): RenderCut[] {
  return shotFrames.map((frames, i) => {
    if (i === 0) return { type: "coupe", frames: 0 };
    const t = chosen[i] && isTransitionType(chosen[i]!.type) ? chosen[i]! : fallback;
    if (t.type === "coupe") return { type: "coupe", frames: 0 };
    const want = Math.round((t.seconds ?? fallback.seconds ?? 0.4) * fps);
    const room = Math.floor(Math.min(shotFrames[i - 1], frames) / 2);
    const d = Math.max(0, Math.min(want, room));
    if (d < 2) return { type: "coupe", frames: 0 };
    return t.type === "cercle" ? { type: t.type, frames: d, x: t.x ?? 0.5, y: t.y ?? 0.5 } : { type: t.type, frames: d };
  });
}

/**
 * Où chaque plan se dessine, en images : il commence la moitié de sa
 * transition d'entrée AVANT sa coupe et finit la moitié de la transition
 * suivante APRÈS — les deux plans se superposent, centrés sur la coupe. Pure.
 */
export function layoutShots(shotFrames: number[], cuts: RenderCut[]): { from: number; duration: number; inFrames: number; outFrames: number; outCut: RenderCut | null }[] {
  let start = 0;
  return shotFrames.map((frames, i) => {
    const inFrames = cuts[i]?.frames ?? 0;
    const next = cuts[i + 1] ?? null;
    const outFrames = next?.frames ?? 0;
    const head = Math.floor(inFrames / 2);
    const tail = outFrames - Math.floor(outFrames / 2);
    const slot = { from: start - head, duration: frames + head + tail, inFrames, outFrames, outCut: next && next.frames > 0 ? next : null };
    start += frames;
    return slot;
  });
}
