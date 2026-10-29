/**
 * Retoucher une capture avant de la convertir : retirer les passages qui ne
 * vont pas (une hésitation, un mauvais clic, une attente).
 *
 * La capture est découpée en petites tranches régulières, une vignette chacune
 * dans la frise de l'éditeur. On en retire une ou plusieurs ; ce qui reste est
 * recollé bout à bout à la conversion. Module pur : l'éditeur, le convertisseur
 * et les tests lisent les mêmes règles.
 */

export type Range = { start: number; end: number };

/** Assez fin pour retirer un clic raté, sans dépasser ~200 vignettes à parcourir. */
export const MIN_SEGMENT = 0.25;
export const MAX_SEGMENTS = 200;

/** Durée d'une tranche de la frise, en secondes. */
export const segmentDuration = (duration: number): number =>
  Math.max(MIN_SEGMENT, Math.ceil((duration / MAX_SEGMENTS) * 100) / 100);

/** Nombre de tranches pour une durée. */
export const segmentCount = (duration: number): number =>
  Math.max(1, Math.ceil(duration / segmentDuration(duration) - 1e-9));

/**
 * Les passages GARDÉS, fusionnés : les tranches voisines non retirées forment un
 * seul passage. Rien de retiré = toute la vidéo.
 */
export function keptRanges(duration: number, removed: ReadonlySet<number>): Range[] {
  const seg = segmentDuration(duration);
  const n = segmentCount(duration);
  const out: Range[] = [];
  for (let i = 0; i < n; i++) {
    if (removed.has(i)) continue;
    const start = i * seg;
    const end = Math.min(duration, (i + 1) * seg);
    const last = out[out.length - 1];
    if (last && Math.abs(last.end - start) < 1e-6) last.end = end;
    else out.push({ start, end });
  }
  return out;
}

export const keptDuration = (ranges: Range[]): number => ranges.reduce((s, r) => s + (r.end - r.start), 0);

/**
 * Les instants de la capture à encoder, `fps` par seconde de ce qui est GARDÉ :
 * la vidéo finale enchaîne les passages sans trou ni saut de cadence.
 */
export function sourceTimes(ranges: Range[], fps: number): number[] {
  const step = 1 / fps;
  const times: number[] = [];
  for (const r of ranges) {
    for (let t = r.start; t < r.end - 1e-6; t += step) times.push(Math.round(t * 1000) / 1000);
  }
  return times;
}

/**
 * Où reprendre la lecture de l'aperçu à l'instant `t` : `t` s'il est gardé,
 * sinon le début du passage gardé suivant, et le tout début en fin de boucle.
 */
export function nextKeptTime(ranges: Range[], t: number): number {
  if (!ranges.length) return 0;
  for (const r of ranges) {
    if (t < r.start) return r.start;
    if (t < r.end) return t;
  }
  return ranges[0].start;
}

/** Retire ou remet les tranches de `from` à `to` (bornes incluses, dans un sens ou dans l'autre). */
export function toggleRange(removed: ReadonlySet<number>, from: number, to: number, remove: boolean): Set<number> {
  const next = new Set(removed);
  const [a, b] = from <= to ? [from, to] : [to, from];
  for (let i = a; i <= b; i++) {
    if (remove) next.add(i);
    else next.delete(i);
  }
  return next;
}
