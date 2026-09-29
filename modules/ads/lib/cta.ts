/**
 * Les boutons d'action qu'une publicité TIM a le droit d'afficher (décision du
 * 29/09/2026). Rien d'autre sans accord : la liste est fermée, et c'est elle qui
 * alimente le brief, la génération et le fichier de textes téléchargé.
 *
 * La correspondance avec les types d'appel à l'action de la Marketing API
 * viendra avec la publication (phase 3b), vérifiée contre la documentation.
 */
export const CTAS = [
  { value: "en-savoir-plus", label: "En savoir plus" },
  { value: "s-inscrire", label: "S'inscrire" },
  { value: "reserver", label: "Réserver" },
] as const;

export type Cta = (typeof CTAS)[number]["value"];

export const CTA_OPTIONS = CTAS.map((c) => ({ label: c.label, value: c.value }));

export const ctaLabel = (v?: string | null): string | undefined => CTAS.find((c) => c.value === v)?.label;
