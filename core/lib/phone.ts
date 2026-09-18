/**
 * Un numéro de téléphone réduit à ses CHIFFRES NATIONAUX, pour chercher.
 *
 * On tape « 065046 », « 06 50 46 » ou « +33 6 50 46 » et on veut la fiche qui
 * porte « +33 6 50 46 12 34 ». Le `like` de la base ne sait pas ignorer les
 * espaces ni le +33 : on garde donc, à côté de chaque numéro, sa forme
 * « 0650461234 » — écrite par un hook à l'enregistrement, cherchée telle
 * quelle. Même règle pour ce qu'on tape, et les deux se rencontrent.
 */

/** « +33 6 50 46 12 34 » → « 0650461234 » ; « 06.50.46.12.34 » → idem ; « +41 22… » → « 4122… ». */
export const phoneDigits = (raw: unknown): string => {
  const value = String(raw ?? "").trim();
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  // International : « +33 » ou « 0033 » devant, la France redevient « 0… ».
  if (/^\s*(\+|00)/.test(value)) return digits.replace(/^(00)?33/, "0");
  return digits;
};

/**
 * Ce qu'on a tapé est-il un numéro ? Trois chiffres au moins, rien d'autre
 * que des chiffres et des séparateurs. Renvoie les chiffres à chercher, sinon
 * null — « 2026 » cherché dans un nom de société reste une recherche texte.
 */
export const phoneQuery = (q: string): string | null => {
  const compact = q.replace(/[\s.\-()]/g, "");
  if (!/^\+?\d{3,}$/.test(compact) && !/^00\d{3,}$/.test(compact)) return null;
  const digits = phoneDigits(compact);
  return digits.length >= 3 ? digits : null;
};

/**
 * Dans une recherche libre, replie chaque groupe de chiffres en un seul mot :
 * « dupont 06 50 46 » → « dupont 065046 ». Sans ça, « 06 », « 50 » et « 46 »
 * seraient trois mots cherchés séparément — et « 06 » se trouve partout.
 */
export const collapsePhoneGroups = (q: string): string =>
  q.replace(/\+?\d(?:[\d\s.\-]*\d)?/g, (m) => phoneDigits(m) || m);
