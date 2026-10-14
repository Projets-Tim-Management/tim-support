import { BRAND_DEFAULTS, HEX, type BrandColors } from "@/core/lib/brand";

/**
 * La charte des publicités (Publicité › Paramètres › Kit de marque) : logos,
 * couleurs, typographie, formes, mouvement. Ici, les listes de choix, le
 * contraste et la charte RÉSOLUE — ce que lisent les rendus, avec un repli
 * sur les couleurs de Système › Apparence quand le kit ne dit rien.
 *
 * Les couleurs du contrat restent dans Apparence ; celles des pubs vivent ici,
 * préremplies avec elles.
 */

/** Polices libres (Google Fonts, licence OFL : usage publicitaire permis), éprouvées pour la pub. */
export const AD_FONTS = [
  { label: "Montserrat — géométrique, franche", value: "montserrat", family: "Montserrat" },
  { label: "Inter — neutre, très lisible", value: "inter", family: "Inter" },
  { label: "Poppins — ronde, chaleureuse", value: "poppins", family: "Poppins" },
  { label: "Archivo — robuste, industrielle", value: "archivo", family: "Archivo" },
  { label: "Archivo Black — titres massifs", value: "archivo-black", family: "Archivo Black" },
  { label: "Bebas Neue — titres hauts et serrés (majuscules)", value: "bebas-neue", family: "Bebas Neue" },
  { label: "Space Grotesk — technique, moderne", value: "space-grotesk", family: "Space Grotesk" },
  { label: "DM Sans — douce, contemporaine", value: "dm-sans", family: "DM Sans" },
  { label: "Manrope — nette, produit", value: "manrope", family: "Manrope" },
  { label: "Lato — celle du contrat", value: "lato", family: "Lato" },
] as const;
export type AdFont = (typeof AD_FONTS)[number]["value"];
export const fontFamily = (v: unknown): string => AD_FONTS.find((f) => f.value === v)?.family ?? "Lato";

export const TITLE_CASES = [
  { label: "Normale", value: "normale" },
  { label: "MAJUSCULES", value: "majuscules" },
] as const;

export const CORNERS = [
  { label: "Carrés", value: "carres" },
  { label: "Arrondis", value: "arrondis" },
  { label: "Pilule (très arrondis)", value: "pilule" },
] as const;

export const PHONE_FRAMES = [
  { label: "Dans une maquette de téléphone", value: "maquette" },
  { label: "L'écran seul, bord à bord", value: "ecran-seul" },
  { label: "Incliné et flottant", value: "incline" },
] as const;

export const GRAPHICS = [
  { label: "Les pastilles du logo", value: "pastilles" },
  { label: "Soulignements", value: "soulignements" },
  { label: "Bandeaux de couleur", value: "bandeaux" },
] as const;

export const PACES = [
  { label: "Posé (plans de 3 à 4 s)", value: "pose" },
  { label: "Dynamique (plans de 1,5 à 2,5 s)", value: "dynamique" },
  { label: "Très rapide (plans de moins d'1 s)", value: "rapide" },
] as const;

export const TRANSITIONS = [
  { label: "Coupe sèche", value: "coupe" },
  { label: "Glissé", value: "glisse" },
  { label: "Zoom", value: "zoom" },
] as const;

/** Comment le logo arrive dans une vidéo, quand il est déposé en SVG à calques (Kit de marque › Logos). */
export const LOGO_ANIMATIONS = [
  { label: "Construction : élément par élément", value: "construction" },
  { label: "Fondu", value: "fondu" },
  { label: "Aucune (logo posé)", value: "aucune" },
] as const;

/** Pour un style : reprendre la police (ou la casse) du Kit de marque plutôt que d'en imposer une. */
export const FROM_KIT = { label: "Celle du Kit de marque", value: "kit" } as const;

export const SUBTITLE_STYLES = [
  { label: "En bandeau", value: "bandeau" },
  { label: "Mot à mot surligné", value: "mot-a-mot" },
  { label: "Aucun", value: "aucun" },
] as const;

/** Comment la pub s'ouvre : les deux premières secondes, celles qui arrêtent le pouce. */
export const OPENINGS = [
  { label: "Titre qui s'écrit mot à mot", value: "titre-mot-a-mot" },
  { label: "Le problème, en grand sur un aplat", value: "aplat-probleme" },
  { label: "Titre posé, avec une phrase d'appui", value: "titre-pose" },
] as const;

export const BACKGROUNDS = [
  { label: "Fond sombre", value: "sombre" },
  { label: "Fond clair", value: "clair" },
  { label: "Aplats de couleur (accent et sombre)", value: "aplats" },
] as const;

/** Comment une preuve chiffrée (un fait sourcé) apparaît. */
export const PROOF_STYLES = [
  { label: "Une ligne discrète", value: "ligne" },
  { label: "Le chiffre en géant", value: "chiffre-geant" },
  { label: "Le chiffre et sa source", value: "chiffre-source" },
] as const;

export const INSPIRATION_VERDICTS = [
  { label: "J'aime", value: "aimer" },
  { label: "À éviter", value: "eviter" },
] as const;

/** La palette des pubs, préremplie avec les couleurs d'Apparence. */
export const PALETTE_DEFAULTS = {
  primary: BRAND_DEFAULTS.brandPrimary,
  accent: BRAND_DEFAULTS.brandRed,
  darkBg: BRAND_DEFAULTS.brandPrimary,
  lightBg: BRAND_DEFAULTS.brandOther,
  textOnDark: "#FFFFFF",
  textOnLight: BRAND_DEFAULTS.brandPrimary,
} as const;
export type Palette = { [K in keyof typeof PALETTE_DEFAULTS]: string };

const pick = (v: unknown, fallback: string) => (typeof v === "string" && HEX.test(v) ? v : fallback);

/** Luminance relative WCAG d'un `#RRGGBB`. Pure. */
export function luminance(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** Le rapport de contraste WCAG entre deux couleurs (de 1 à 21), arrondi au dixième. Pure. */
export function contrastRatio(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) return 0;
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return Math.round(((hi + 0.05) / (lo + 0.05)) * 10) / 10;
}

/**
 * Lisible ? Un titre de pub est gros : 3:1 suffit (WCAG, grand texte) ; un
 * sous-titre ou une mention se lit petit : 4,5:1. Pure.
 */
export const contrastVerdict = (ratio: number): "ok" | "titres" | "illisible" => (ratio >= 4.5 ? "ok" : ratio >= 3 ? "titres" : "illisible");

/** Les couples de couleurs qui se retrouveront l'un sur l'autre dans une pub. Pure. */
export function paletteChecks(p: Palette): { label: string; fg: string; bg: string; ratio: number; verdict: ReturnType<typeof contrastVerdict> }[] {
  const pairs: [string, string, string][] = [
    ["Texte sur fond sombre", p.textOnDark, p.darkBg],
    ["Texte sur fond clair", p.textOnLight, p.lightBg],
    ["Bouton : texte clair sur l'accent", p.textOnDark, p.accent],
    ["Principale sur fond clair", p.primary, p.lightBg],
  ];
  return pairs.map(([label, fg, bg]) => {
    const ratio = contrastRatio(fg, bg);
    return { label, fg, bg, ratio, verdict: contrastVerdict(ratio) };
  });
}

type Kit = Record<string, unknown> & { palette?: Partial<Record<keyof Palette, unknown>> | null };

/** La palette du kit, chaque couleur absente ou invalide remplacée par celle d'Apparence. Pure. */
export function paletteOf(kit: Kit | null | undefined, appearance?: Record<string, unknown> | null): Palette {
  const a = {
    primary: pick(appearance?.brandPrimary, PALETTE_DEFAULTS.primary),
    accent: pick(appearance?.brandRed, PALETTE_DEFAULTS.accent),
    other: pick(appearance?.brandOther, PALETTE_DEFAULTS.lightBg),
  };
  const k = kit?.palette ?? {};
  return {
    primary: pick(k.primary, a.primary),
    accent: pick(k.accent, a.accent),
    darkBg: pick(k.darkBg, a.primary),
    lightBg: pick(k.lightBg, a.other),
    textOnDark: pick(k.textOnDark, PALETTE_DEFAULTS.textOnDark),
    textOnLight: pick(k.textOnLight, a.primary),
  };
}

/**
 * Les couleurs telles que les gabarits statiques les attendent (le format
 * d'Apparence) : la palette des pubs prend le relais d'Apparence. Pure.
 */
export const templateColors = (p: Palette): BrandColors => ({ primary: p.darkBg, secondary: p.lightBg, red: p.accent, other: p.lightBg });
