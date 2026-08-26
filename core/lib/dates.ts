/**
 * Repères de date partagés — tout ce qui doit se lire dans le fuseau de PARIS.
 *
 * « Aujourd'hui » n'est pas une affaire de 24 heures glissantes : c'est le
 * calendrier de celui qui lit. Un rappel à 01 h 30 est demain, pas « dans
 * 17 heures ». Chaque écran qui redéfinissait la règle finissait par en avoir
 * une légèrement différente.
 */

export const PARIS_TZ = "Europe/Paris";

/**
 * Jour d'un instant, au format trié `2026-08-25`, en heure de Paris.
 *
 * Comparer des CHAÎNES de jour évite toute arithmétique de fuseau — et donc les
 * deux bascules d'heure d'été de l'année. La locale `fr-CA` est la seule à
 * rendre l'ISO.
 */
export const dayKey = (d: Date | string): string =>
  new Date(d).toLocaleDateString("fr-CA", { timeZone: PARIS_TZ });
