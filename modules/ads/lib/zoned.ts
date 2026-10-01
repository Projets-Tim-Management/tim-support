/**
 * Minuits dans un fuseau donné — pour les plafonds du support (Paris) comme
 * pour la semaine de Meta, qui suit le fuseau du compte publicitaire.
 *
 * Un « jour » qui basculerait à 2 h du matin en été ne serait pas celui qu'on
 * croit : on calcule toujours le minuit LOCAL, converti en instant UTC.
 */

/** Décalage du fuseau par rapport à UTC, en minutes, à un instant donné. */
function offsetMinutes(at: Date, timeZone: string): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(name ?? "");
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : 0;
}

/** Année, mois (1-12), jour et jour de semaine (0 = dimanche) de `at`, dans le fuseau. */
export function localParts(at: Date, timeZone: string): { y: number; m: number; d: number; weekday: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(at).split("-").map(Number);
  return { y, m, d, weekday: new Date(Date.UTC(y, m - 1, d)).getUTCDay() };
}

/**
 * Minuit local du jour civil (y, m, d) — les débordements (d = 0, d = 32) sont
 * normalisés — en instant UTC.
 *
 * En deux passes : le décalage lu à 0 h UTC n'est pas forcément celui de minuit
 * local. À Sydney, le dimanche du passage à l'heure d'hiver, 0 h UTC tombe
 * APRÈS la bascule (UTC+10) alors que minuit local est encore en heure d'été
 * (UTC+11) : une seule passe décalait la semaine de Meta d'une heure.
 */
export function localMidnight(y: number, m: number, d: number, timeZone: string): Date {
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  const first = guess - offsetMinutes(new Date(guess), timeZone) * 60_000;
  return new Date(guess - offsetMinutes(new Date(first), timeZone) * 60_000);
}

/** Minuit local du jour, du 1er du mois, ou du DIMANCHE de la semaine (semaine de Meta) qui contient `now`. */
export function zonedStart(now: Date, of: "day" | "month" | "week", timeZone: string): Date {
  const { y, m, d, weekday } = localParts(now, timeZone);
  if (of === "month") return localMidnight(y, m, 1, timeZone);
  if (of === "week") return localMidnight(y, m, d - weekday, timeZone);
  return localMidnight(y, m, d, timeZone);
}
