import { PARIS_TZ } from "@/core/lib/dates";
import { localParts, zonedStart } from "@/modules/ads/lib/zoned";

/**
 * Les petits calculs et formats de l'équipe IA, en UN endroit (relecture du
 * 12/11/2026 : ils étaient recopiés dans une dizaine de fichiers). Purs et sans
 * dépendance : utilisables côté serveur comme dans un composant client.
 */

export const DAY_MS = 86_400_000;

export { round2 as r2, num, money } from "@/core/lib/numbers";
export const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** « 1 234,50 € » — les montants affichés (style monétaire) ; « — » sans valeur. */
export const euro = (n: number | null | undefined, min = 0, max = min) =>
  n == null ? "—" : n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: min, maximumFractionDigits: max });

/** La semaine d'une photo (son lundi, « AAAA-MM-JJ ») : « 9 novembre » ou « 9 nov. ». */
export const weekLabel = (week: string, month: "long" | "short" = "long") => new Date(`${week}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month, timeZone: "UTC" });

/** Une adresse https sans identifiants (source citée, repère du marché), ou null. */
export const safeHttpsUrl = (raw: unknown): string | null => {
  try {
    const u = new URL(String(raw ?? "").trim());
    return u.protocol === "https:" && !u.username && !u.password ? u.toString() : null;
  } catch {
    return null;
  }
};

/** Le jour du mois et la taille du mois, à Paris (le budget et ses moyennes par jour). */
export function parisMonthDays(now: Date): { day: number; daysInMonth: number } {
  const { y, m, d } = localParts(now, PARIS_TZ);
  return { day: d, daysInMonth: new Date(Date.UTC(y, m, 0)).getUTCDate() };
}

/** Minuit à Paris le 1er du mois de `now`, en millisecondes — le même mois que les plafonds des agents. */
export const parisMonthStart = (now: Date): number => zonedStart(now, "month", PARIS_TZ).getTime();

/** Le jour à Paris (« AAAA-MM-JJ ») : entre minuit et 2 h, l'UTC est encore la veille. */
export const parisDay = (now: Date): string => new Intl.DateTimeFormat("en-CA", { timeZone: PARIS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);

/** `n` mois plus tard, le jour ramené à la fin du mois s'il n'existe pas (31 janvier + 1 mois → 28 ou 29 février). Pure. */
export function addMonths(d: Date, n: number): Date {
  const out = new Date(d);
  const day = out.getUTCDate();
  out.setUTCDate(1);
  out.setUTCMonth(out.getUTCMonth() + n);
  out.setUTCDate(Math.min(day, new Date(Date.UTC(out.getUTCFullYear(), out.getUTCMonth() + 1, 0)).getUTCDate()));
  return out;
}

/** Une date de la base en millisecondes ; NaN si elle manque. */
export const timeOf = (v: unknown): number => (v ? Date.parse(String(v)) : NaN);
