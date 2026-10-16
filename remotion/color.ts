import type { RenderProps } from "../modules/ads/video/props";

/**
 * Les couleurs du moteur : une seule règle de lisibilité et une seule façon
 * de rendre une couleur transparente, pour qu'une même couleur reçoive le même
 * texte partout (plans, éléments).
 */

const HEX = /^#([0-9a-f]{6})$/i;

/** Les trois composantes (0-255) d'une couleur #RRGGBB, ou null si ce n'en est pas une. */
function rgb(hex: string): [number, number, number] | null {
  const m = HEX.exec(hex.trim());
  if (!m) return null;
  const v = parseInt(m[1], 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/** La clarté d'une couleur (#RRGGBB), de 0 (noir) à 1 (blanc), linéarisée comme le WCAG : au-delà de 0,4, on écrit en sombre dessus. */
export function luminance(hex: string): number {
  const c = rgb(hex);
  if (!c) return 0;
  const lin = (x: number) => (x / 255 <= 0.03928 ? x / 255 / 12.92 : ((x / 255 + 0.055) / 1.055) ** 2.4);
  return 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
}

/** Le texte du kit lisible sur une couleur : le sombre si elle est claire, le clair sinon. */
export function textOn(p: RenderProps, hex: string): string {
  return luminance(hex) > 0.4 ? p.palette.textOnLight : p.palette.textOnDark;
}

/** Une couleur du kit (#RRGGBB) rendue transparente : un voile ou un trait prend la teinte de la marque, pas un gris. */
export function withAlpha(hex: string, alpha: number): string {
  const c = rgb(hex);
  return c ? `rgba(${c[0]},${c[1]},${c[2]},${alpha})` : `rgba(0,0,0,${alpha})`;
}

/** Vrai pour une couleur #RRGGBB (les seules que withAlpha sait teinter). */
export const isHex = (v: string) => HEX.test(v.trim());
