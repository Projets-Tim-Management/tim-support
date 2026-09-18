/**
 * La région d'un code postal français — pour filtrer une carte par région
 * sans rien stocker de plus : le code postal suffit, le département en est
 * les deux premiers chiffres (trois outre-mer ; la Corse partage le « 20 »).
 */
const REGIONS: Record<string, string[]> = {
  "Auvergne-Rhône-Alpes": ["01", "03", "07", "15", "26", "38", "42", "43", "63", "69", "73", "74"],
  "Bourgogne-Franche-Comté": ["21", "25", "39", "58", "70", "71", "89", "90"],
  Bretagne: ["22", "29", "35", "56"],
  "Centre-Val de Loire": ["18", "28", "36", "37", "41", "45"],
  Corse: ["2A", "2B"],
  "Grand Est": ["08", "10", "51", "52", "54", "55", "57", "67", "68", "88"],
  "Hauts-de-France": ["02", "59", "60", "62", "80"],
  "Île-de-France": ["75", "77", "78", "91", "92", "93", "94", "95"],
  Normandie: ["14", "27", "50", "61", "76"],
  "Nouvelle-Aquitaine": ["16", "17", "19", "23", "24", "33", "40", "47", "64", "79", "86", "87"],
  Occitanie: ["09", "11", "12", "30", "31", "32", "34", "46", "48", "65", "66", "81", "82"],
  "Pays de la Loire": ["44", "49", "53", "72", "85"],
  "Provence-Alpes-Côte d'Azur": ["04", "05", "06", "13", "83", "84"],
  Guadeloupe: ["971"],
  Martinique: ["972"],
  Guyane: ["973"],
  "La Réunion": ["974"],
  Mayotte: ["976"],
};

const BY_DEPT = new Map<string, string>();
for (const [region, depts] of Object.entries(REGIONS)) for (const d of depts) BY_DEPT.set(d, region);

/** « 25270 » → « 25 » ; « 20200 » → « 2B » ; « 97400 » → « 974 » ; sinon null. */
export const departmentOf = (postcode?: string | null): string | null => {
  const p = (postcode ?? "").trim();
  if (!/^\d{5}$/.test(p)) return null;
  if (p.startsWith("97") || p.startsWith("98")) return p.slice(0, 3);
  // Corse : 20000–20199 (et 20190) Corse-du-Sud, le reste Haute-Corse.
  if (p.startsWith("20")) return Number(p) < 20200 || p === "20190" ? "2A" : "2B";
  return p.slice(0, 2);
};

export const regionOf = (postcode?: string | null): string | null => {
  const d = departmentOf(postcode);
  return d ? (BY_DEPT.get(d) ?? null) : null;
};
