import { NAF_DIVISIONS, NAF_SUBCLASSES } from "@/modules/partner/lib/naf-data";

/**
 * Le métier d'un client : son code NAF rév. 2 (« 43.22A »), tel que l'INSEE
 * le tient pour l'unité légale — ou l'établissement quand on part d'un SIRET.
 *
 * Seule la NAF rév. 2 est reconnue : c'est la nomenclature que l'INSEE renvoie
 * aujourd'hui. Un code d'une autre nomenclature (NAF 2025 à partir de 2027) est
 * ignoré à la recherche plutôt que stocké avec un libellé faux.
 */

export const NAF_SOURCES = [
  { value: "insee", label: "INSEE" },
  { value: "manuel", label: "Saisi à la main" },
] as const;

export type NafSource = (typeof NAF_SOURCES)[number]["value"];

/**
 * Remet une saisie à la forme INSEE : « 4322a », « 43 22 A », « 43.22A » →
 * « 43.22A ». `null` si la saisie n'a pas la forme d'un code NAF ; la forme ne
 * dit pas que le code existe (voir isNafCode).
 */
export function normalizeNaf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const m = raw.toUpperCase().replace(/[\s.]/g, "").match(/^(\d{2})(\d{2})([A-Z])$/);
  return m ? `${m[1]}.${m[2]}${m[3]}` : null;
}

/** Le code existe dans la NAF rév. 2 (après normalisation). */
export const isNafCode = (raw: unknown): boolean => {
  const code = normalizeNaf(raw);
  return code !== null && code in NAF_SUBCLASSES;
};

/** Libellé de la sous-classe, ou `null` pour un code inconnu. */
export const nafLabel = (raw: unknown): string | null => {
  const code = normalizeNaf(raw);
  return code ? (NAF_SUBCLASSES[code] ?? null) : null;
};

/**
 * La division (2 chiffres) : la maille à laquelle le stratège publicitaire
 * voit les métiers des clients signés — assez large pour regrouper, assez
 * fine pour distinguer un plombier d'un terrassier.
 */
export function nafDivision(raw: unknown): { code: string; label: string } | null {
  const code = normalizeNaf(raw);
  if (!code || !(code in NAF_SUBCLASSES)) return null;
  const div = code.slice(0, 2);
  const label = NAF_DIVISIONS[div];
  return label ? { code: div, label } : null;
}
