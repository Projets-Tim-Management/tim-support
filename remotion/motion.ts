import { Easing } from "remotion";

/** Les réglages de mouvement communs au moteur : une seule courbe et une seule borne pour tous les fichiers. */

/** Une interpolation qui ne déborde jamais de ses bornes. */
export const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** La courbe d'entrée de la marque : rapide au départ, posée à l'arrivée. */
export const ease = Easing.bezier(0.2, 0.7, 0.2, 1);

/**
 * Un flou CSS, ou rien quand il est nul : un `blur(0px)` coûte quand même un
 * calque de filtre sur tout ce qu'il couvre (et sin(π) n'est pas tout à fait 0).
 */
export const blurFilter = (px: number): string | undefined => (px > 0.01 ? `blur(${px}px)` : undefined);
