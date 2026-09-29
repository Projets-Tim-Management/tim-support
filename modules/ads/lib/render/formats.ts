/**
 * Les formats des visuels Meta, et leur zone sûre (plan Publicité, §9 ter).
 *
 * 9:16 : la zone sûre UNIFIÉE de Meta (mars 2026) pour Stories et Reels,
 * Facebook et Instagram — 14 % en haut, 35 % en bas, 6 % sur les côtés. Tout ce
 * qui compte (accroche, logo, bouton) reste dedans ; le reste peut être couvert
 * par l'interface de l'application.
 * 1:1 et 4:5 : fil d'actualité, une marge de 6 % tout autour — rien n'y est
 * recouvert, mais un texte collé au bord se lit mal.
 */
export type FormatKey = "1x1" | "4x5" | "9x16";

export type Format = {
  key: FormatKey;
  width: number;
  height: number;
  safe: { top: number; bottom: number; left: number; right: number };
  /** Taille de base de l'accroche, en pixels. */
  hookSize: number;
};

const pct = (n: number, p: number) => Math.round((n * p) / 100);

export const FORMATS: Record<FormatKey, Format> = {
  "1x1": { key: "1x1", width: 1080, height: 1080, safe: { top: pct(1080, 6), bottom: pct(1080, 6), left: pct(1080, 6), right: pct(1080, 6) }, hookSize: 84 },
  "4x5": { key: "4x5", width: 1080, height: 1350, safe: { top: pct(1350, 6), bottom: pct(1350, 6), left: pct(1080, 6), right: pct(1080, 6) }, hookSize: 92 },
  "9x16": { key: "9x16", width: 1080, height: 1920, safe: { top: pct(1920, 14), bottom: pct(1920, 35), left: pct(1080, 6), right: pct(1080, 6) }, hookSize: 100 },
};

export const FORMAT_KEYS: FormatKey[] = ["1x1", "4x5", "9x16"];

/** La zone où tout ce qui compte doit tenir. */
export const safeBox = (f: Format) => ({
  x: f.safe.left,
  y: f.safe.top,
  width: f.width - f.safe.left - f.safe.right,
  height: f.height - f.safe.top - f.safe.bottom,
});

/**
 * Taille de l'accroche : pleine jusqu'à 40 caractères (deux à trois lignes sur
 * la largeur utile), puis réduite — jamais sous 60 % de la taille de base. Une
 * publicité se lit en une seconde, en passant : l'accroche doit être grande.
 */
export const hookFontSize = (f: Format, text: string): number => {
  const n = [...text].length;
  return Math.round(f.hookSize * Math.min(1, Math.max(0.6, 40 / Math.max(n, 1))));
};

/** Les dimensions d'une image ramenées dans une boîte, proportions gardées. */
export const fit = (img: { width: number; height: number }, box: { width: number; height: number }) => {
  const k = Math.min(box.width / img.width, box.height / img.height, 1.5);
  return { width: Math.round(img.width * k), height: Math.round(img.height * k) };
};

/** Poids maximal d'une image chez Meta. */
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
