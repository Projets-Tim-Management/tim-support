/**
 * Les couleurs de TIM MANAGEMENT (la société), pour les documents qu'elle
 * émet — modifiables dans Système → Apparence. Ce ne sont PAS les couleurs de
 * l'interface (styles/_tokens.scss) : un PDF ne lit pas le CSS.
 */
export const BRAND_DEFAULTS = {
  brandPrimary: "#252B59",
  brandSecondary: "#f1f1ff",
  brandRed: "#F05761",
  brandOther: "#f6f9fc",
} as const;

export type BrandColors = { primary: string; secondary: string; red: string; other: string };

/** Un code couleur `#RRGGBB` (le seul format accepté partout). */
export const HEX = /^#[0-9a-fA-F]{6}$/;
const pick = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);

/** Les couleurs de la page Apparence, avec repli sur celles livrées. */
export const brandColorsOf = (appearance: Record<string, unknown> | null | undefined): BrandColors => ({
  primary: pick(appearance?.brandPrimary, BRAND_DEFAULTS.brandPrimary),
  secondary: pick(appearance?.brandSecondary, BRAND_DEFAULTS.brandSecondary),
  red: pick(appearance?.brandRed, BRAND_DEFAULTS.brandRed),
  other: pick(appearance?.brandOther, BRAND_DEFAULTS.brandOther),
});
