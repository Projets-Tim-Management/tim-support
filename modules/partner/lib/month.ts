/**
 * Le mois, en UTC, comme unité de l'historique de facturation.
 *
 * Trois endroits raisonnent au mois — le hook qui écrit l'historique, l'écran
 * qui le lit, le rapprochement Pennylane — et chacun avait recopié le même
 * calcul. Une seule définition : un mois se désigne par sa clé « AAAA-M » et
 * commence au 1er, minuit UTC (le banc de test et Vercel tournent en UTC).
 */

const toDate = (v: string | Date): Date => (v instanceof Date ? v : new Date(v));

/** Clé de mois stable, ex. « 2026-9 » pour octobre 2026 (mois 0-indexé, comme `Date`). */
export const monthKey = (v: string | Date): string => {
  const d = toDate(v);
  return `${d.getUTCFullYear()}-${d.getUTCMonth()}`;
};

/** Le 1er du mois de cette date, minuit UTC, en ISO. */
export const monthStart = (v: string | Date): string => {
  const d = toDate(v);
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
};
