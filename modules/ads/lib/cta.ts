/**
 * Les boutons d'action qu'une publicité TIM a le droit d'afficher (décision du
 * 29/09/2026). Rien d'autre sans accord : la liste est fermée, et c'est elle qui
 * alimente le brief, la génération et le fichier de textes téléchargé.
 *
 * `meta` : le type d'appel à l'action de la Marketing API, envoyé à la
 * publication (phase 3b).
 */
export const CTAS = [
  { value: "en-savoir-plus", label: "En savoir plus", meta: "LEARN_MORE" },
  { value: "s-inscrire", label: "S'inscrire", meta: "SIGN_UP" },
  { value: "reserver", label: "Réserver", meta: "BOOK_NOW" },
] as const;

export type Cta = (typeof CTAS)[number]["value"];

export const CTA_OPTIONS = CTAS.map((c) => ({ label: c.label, value: c.value }));

export const ctaLabel = (v?: string | null): string | undefined => CTAS.find((c) => c.value === v)?.label;

/** Le type d'appel à l'action chez Meta (« En savoir plus » par défaut). */
export const ctaMeta = (v?: string | null): string => CTAS.find((c) => c.value === v)?.meta ?? "LEARN_MORE";
