/**
 * Ce qu'une créa peut faire varier — et donc ce qu'on pourra comparer
 * (décision du 29/09/2026).
 *
 * Une variante = UNE dimension étiquetée et mesurable. Le ton en est la
 * première : vouvoiement par défaut, tutoiement seulement en variante étiquetée
 * « test de ton », validée comme toute créa et comptée à part. Les autres
 * dimensions suivent la même logique : un angle, une accroche, un format, un
 * visuel, un bouton d'action. Une créa qui change deux choses à la fois ne dit
 * rien de chacune — d'où l'étiquette explicite, plutôt qu'une comparaison
 * reconstituée après coup.
 *
 * Liste FERMÉE (des `select`, donc des enums) : chaque dimension ajoutée coûte
 * une migration, et c'est voulu — une dimension qu'on ne sait pas mesurer n'a
 * rien à faire dans les résultats.
 */

export const TONES = [
  { label: "Vouvoiement", value: "vous" },
  { label: "Tutoiement", value: "tu" },
] as const;

export type Tone = (typeof TONES)[number]["value"];

export const DEFAULT_TONE: Tone = "vous";

export const TEST_DIMENSIONS = [
  { label: "Ton", value: "ton" },
  { label: "Angle", value: "angle" },
  { label: "Accroche", value: "accroche" },
  { label: "Format", value: "format" },
  { label: "Visuel", value: "visuel" },
  { label: "Bouton d'action", value: "cta" },
] as const;

export type TestDimension = (typeof TEST_DIMENSIONS)[number]["value"];

/** L'étiquette lisible d'un test : « test de ton », « test d'angle »… */
export const testLabel = (d: TestDimension): string =>
  ({
    ton: "test de ton",
    angle: "test d'angle",
    accroche: "test d'accroche",
    format: "test de format",
    visuel: "test de visuel",
    cta: "test de bouton d'action",
  })[d];

export const toneLabel = (t?: string | null): string => TONES.find((x) => x.value === t)?.label ?? "—";
