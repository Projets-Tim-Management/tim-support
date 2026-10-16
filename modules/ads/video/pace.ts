/**
 * Le rythme d'un style (posé, dynamique, rapide) : le facteur qui allonge ou
 * raccourcit les animations du moteur. Partagé par le moteur (remotion/) et
 * par les contrôles (le temps de lecture de la Base V1 doit compter comme lui).
 */
export const PACE = { pose: 1.4, dynamique: 1, rapide: 0.7 } as const;
export type Pace = keyof typeof PACE;
export const paceOf = (v: unknown): number => PACE[(v as Pace) in PACE ? (v as Pace) : "dynamique"];
