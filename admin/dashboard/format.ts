/** Helpers de formatage du dashboard (partagés serveur + client). */

/** 1 284 ; 12,9 k ; 3,4 M — compact au-delà de 10 000. */
export function compact(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (Math.abs(n) >= 10_000) {
    return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(n);
  }
  return new Intl.NumberFormat("fr-FR").format(n);
}

/**
 * Nombre entier, séparateur de milliers, JAMAIS abrégé : 12 000 et non « 12 k ».
 * Utilisé pour les points d'un partenaire — un solde est une valeur qu'on lit
 * précisément, l'abréviation y perd de l'information et de l'effet.
 */
export function plain(n: number): string {
  return Number.isFinite(n) ? new Intl.NumberFormat("fr-FR").format(Math.round(n)) : "—";
}

/** Euros sans décimales : 12 480 €. */
export function euros(n: number): string {
  return new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(Math.round(n)) + " €";
}

/** Poids de fichier : 3,2 Mo. */
export function bytes(n: number): string {
  if (!n) return "0 o";
  const units = ["o", "Ko", "Mo", "Go", "To"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  const v = n / 1024 ** i;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(v)} ${units[i]}`;
}

/** Délai lisible depuis des heures : 3 h ; 2,1 j. */
export function duration(hours: number | null): string {
  if (hours == null) return "—";
  if (hours < 48) return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 }).format(hours)} h`;
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(hours / 24)} j`;
}

/** Delta signé : +3 / −2 / — (0). */
export function signed(n: number): string {
  if (n === 0) return "—";
  const sign = n > 0 ? "+" : "−";
  return `${sign}${new Intl.NumberFormat("fr-FR").format(Math.abs(n))}`;
}
