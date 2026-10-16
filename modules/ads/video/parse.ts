/**
 * Les petits outils de lecture des partitions (ce qu'un modèle écrit) : une
 * seule version de chacun, partagée par score.ts, elements.ts, props.ts,
 * base-v1.ts et default-score.ts. Purs.
 */

/** Un texte, sans espaces autour ; `""` pour tout ce qui n'est pas une chaîne. */
export const str = (v: unknown): string => (typeof v === "string" ? v.trim() : "");

/**
 * Un nombre STRICT : seul un vrai nombre fini passe, tout le reste (même « 3 »
 * en chaîne) donne `NaN` — que les contrôles de la partition refusent ensuite
 * avec la raison (durées, passages, identifiants de plan).
 */
export const strictNumber = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : NaN);

/**
 * Un nombre TOLÉRANT : un nombre fini, ou une chaîne qui en est un (« 3 ») ;
 * `undefined` sinon, pour retomber sur la valeur par défaut (placement et
 * minutage des éléments, réglages d'un fond).
 */
export const looseNumber = (v: unknown): number | undefined =>
  typeof v === "number" && Number.isFinite(v) ? v : typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : undefined;

/** Une valeur de la liste, ou le repli. */
export const oneOf = <T extends string>(v: unknown, list: readonly T[], fallback: T): T => (list.includes(v as T) ? (v as T) : fallback);

/**
 * Un texte coupé à `max` caractères, points de suspension compris. `trimEnd` :
 * sans espace avant le « … » (un texte affiché) ; sans lui, la coupe est
 * brute (un extrait cité dans un message).
 */
export const clip = (text: string, max: number, opts: { trimEnd?: boolean } = {}): string => {
  if (text.length <= max) return text;
  const head = text.slice(0, max - 1);
  return `${opts.trimEnd ? head.trimEnd() : head}…`;
};
