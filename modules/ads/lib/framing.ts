/**
 * Le recadrage d'un rush (plan Publicité, §9 sexies, D1d) : ce que Charlie
 * autorise à montrer, et ce qui ne doit jamais sortir de l'image.
 *
 * - La ZONE UTILE : le seul morceau de l'image dont un montage peut se servir
 *   (sans la barre d'état de l'iPhone, sans un bandeau du bas…). Par défaut,
 *   l'image entière.
 * - La ZONE PROTÉGÉE : ce qu'aucun cadrage ne peut couper (le bouton
 *   « Pointer », la liste des compagnons). Par défaut, rien.
 *
 * Les rectangles sont en proportions de l'image (0 à 1), indépendants de sa
 * taille. Le moteur vidéo (D3) cadre avec les MÊMES fonctions que l'aperçu de
 * la fiche : ce que Charlie voit est ce qui sera rendu.
 */

export type Rect = { x: number; y: number; w: number; h: number };
export type Framing = { crop: Rect | null; protect: Rect | null };

export const FULL: Rect = { x: 0, y: 0, w: 1, h: 1 };
/** En dessous d'un dixième de l'image, une zone tracée est un clic raté, pas une intention. */
export const MIN_SIDE = 0.1;

export const FORMATS = [
  { key: "9x16", label: "9:16 · Reels, Stories", aspect: 9 / 16 },
  { key: "4x5", label: "4:5 · Fil d'actualité", aspect: 4 / 5 },
  { key: "1x1", label: "1:1 · Carré", aspect: 1 },
] as const;

const clamp01 = (n: number) => Math.min(1, Math.max(0, n));
const round = (n: number) => Math.round(n * 10_000) / 10_000;

/** Un rectangle lisible, ramené dans l'image ; `null` s'il n'en est pas un. Pure. */
export function cleanRect(raw: unknown): Rect | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const [x, y, w, h] = [r.x, r.y, r.w, r.h].map(Number);
  if (![x, y, w, h].every(Number.isFinite)) return null;
  const x0 = clamp01(x);
  const y0 = clamp01(y);
  return { x: round(x0), y: round(y0), w: round(Math.min(w, 1 - x0)), h: round(Math.min(h, 1 - y0)) };
}

export const contains = (outer: Rect, inner: Rect, eps = 1e-4): boolean =>
  inner.x >= outer.x - eps && inner.y >= outer.y - eps && inner.x + inner.w <= outer.x + outer.w + eps && inner.y + inner.h <= outer.y + outer.h + eps;

/**
 * Le recadrage enregistré, vérifié : zones assez grandes, zone protégée DANS
 * la zone utile. Renvoie l'erreur à dire, ou le recadrage propre. Pure.
 */
export function validateFraming(raw: unknown): { ok: true; framing: Framing } | { ok: false; error: string } {
  const r = (raw ?? {}) as Record<string, unknown>;
  const crop = cleanRect(r.crop);
  const protect = cleanRect(r.protect);
  if (crop && (crop.w < MIN_SIDE || crop.h < MIN_SIDE)) return { ok: false, error: "Zone utile trop petite : au moins un dixième de l'image dans chaque sens." };
  if (protect && (protect.w < 0.02 || protect.h < 0.02)) return { ok: false, error: "Zone à ne jamais couper trop petite : tracez-la autour de l'élément entier." };
  if (protect && !contains(crop ?? FULL, protect)) return { ok: false, error: "La zone à ne jamais couper doit être à l'intérieur de la zone utile." };
  return { ok: true, framing: { crop, protect } };
}

/**
 * Le cadrage plein cadre d'un format : le plus grand rectangle à la proportion
 * du format, DANS la zone utile, centré sur la zone protégée (sinon sur la zone
 * utile) et décalé pour la contenir. `fits: false` quand la zone protégée ne
 * tient pas dans ce format plein cadre : le moteur montre alors la zone utile
 * entière, sur un fond (rien n'est coupé). Pure.
 *
 * `srcAspect` : largeur / hauteur de l'image en pixels ; `aspect` : celui du format.
 */
export function coverRect(srcAspect: number, framing: Framing, aspect: number): { rect: Rect; fits: boolean } {
  const crop = framing.crop ?? FULL;
  // Travail en pixels relatifs : largeur = srcAspect, hauteur = 1.
  const cw = crop.w * srcAspect;
  const ch = crop.h;
  let w = cw;
  let h = w / aspect;
  if (h > ch) {
    h = ch;
    w = h * aspect;
  }
  const p = framing.protect;
  const focus = p ? { x: (p.x + p.w / 2) * srcAspect, y: p.y + p.h / 2 } : { x: (crop.x + crop.w / 2) * srcAspect, y: crop.y + crop.h / 2 };
  const minX = crop.x * srcAspect;
  const minY = crop.y;
  let x = Math.min(Math.max(focus.x - w / 2, minX), minX + cw - w);
  let y = Math.min(Math.max(focus.y - h / 2, minY), minY + ch - h);
  let fits = true;
  if (p) {
    const px = p.x * srcAspect;
    const pw = p.w * srcAspect;
    if (pw > w + 1e-6 || p.h > h + 1e-6) fits = false;
    else {
      // Décale juste assez pour que la zone protégée entre entièrement.
      x = Math.min(Math.max(x, px + pw - w), px);
      y = Math.min(Math.max(y, p.y + p.h - h), p.y);
    }
  }
  return { rect: { x: round(x / srcAspect), y: round(y), w: round(w / srcAspect), h: round(h) }, fits };
}

/** Un zoom proposé par un montage est-il permis ? Dans la zone utile, et la zone protégée entière dedans. Pure. */
export function viewAllowed(view: Rect, framing: Framing): boolean {
  if (!contains(framing.crop ?? FULL, view)) return false;
  return framing.protect ? contains(view, framing.protect) : true;
}
