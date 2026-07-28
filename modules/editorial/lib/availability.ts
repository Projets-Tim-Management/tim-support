import type { FeatureStatus } from "@/core/lib/types";

/**
 * Disponibilité d'une feature. Source unique partagée par la collection Features
 * (options du select), le mapping d'affichage (content.ts → FeatureStatus) et la
 * validation de l'import (importFeatureHandler). Les libellés correspondent aux
 * statuts d'affichage hérités de WP (FeatureStatus).
 */
export const AVAILABILITY_OPTIONS: { value: string; label: FeatureStatus }[] = [
  { value: "disponible", label: "Disponible" },
  { value: "beta", label: "Beta" },
  { value: "prochainement", label: "Prochainement" },
];

/** Valeurs valides (validation d'import). */
export const AVAILABILITY_VALUES = new Set(AVAILABILITY_OPTIONS.map((o) => o.value));

/** value (BDD) → libellé d'affichage FeatureStatus. */
export const AVAILABILITY_LABEL: Record<string, FeatureStatus> = Object.fromEntries(
  AVAILABILITY_OPTIONS.map((o) => [o.value, o.label]),
);
