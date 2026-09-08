/**
 * Le TYPE (ce que c'est) et la PRIORITÉ (dans quel ordre) d'un développement,
 * plus la palette partagée par les statuts et les labels.
 *
 * Trois axes séparés, jamais mélangés (décision D2 du plan) :
 *   type × statut (collection `dev-statuses`) × priorité.
 * « Urgent » est donc une priorité : déclarer une demande urgente ne doit pas
 * effacer l'information de son avancement.
 *
 * Type et priorité restent du CODE, contrairement aux statuts : ce sont des
 * axes d'analyse stables (on ne réinvente pas « bug » ni « urgente »), et les
 * garder en enum permet de les traduire d'un ticket sans table de correspondance
 * en base. Ce qui se règle au fil de l'eau — les colonnes du Kanban — est en base.
 *
 * Couleurs en tokens uniquement (styles/_tokens.scss) — jamais de code couleur
 * en dur, contrairement à `ticket-meta.ts` qui date d'avant les tokens.
 */

export type DevOption = {
  value: string;
  label: string;
  color: string;
  bg: string;
  hint?: string;
};

/**
 * Ce dont il s'agit. Six familles qui couvrent tout ce qui atterrit sur le
 * tableau : ce qui n'existe pas encore, ce qui existe mal, ce qui est cassé,
 * ce qui brûle, ce qui ne se voit pas, et ce qu'on ne sait pas encore.
 */
export const DEV_TYPES: DevOption[] = [
  {
    value: "feature",
    label: "Nouvelle fonctionnalité",
    color: "var(--tim-blue)",
    bg: "var(--tim-blue-bg)",
    hint: "N'existe pas aujourd'hui.",
  },
  {
    value: "evolution",
    label: "Évolution",
    color: "var(--tim-teal)",
    bg: "var(--tim-teal-bg)",
    hint: "Existe, mais doit changer.",
  },
  {
    value: "bug",
    label: "Bug",
    color: "var(--tim-rose)",
    bg: "var(--tim-rose-bg)",
    hint: "Ne fait pas ce qui est prévu.",
  },
  {
    value: "depannage",
    label: "Dépannage",
    color: "var(--tim-red)",
    bg: "var(--tim-red-bg)",
    hint: "Incident chez un client : on rétablit d'abord, on corrige le fond ensuite.",
  },
  {
    value: "technique",
    label: "Technique",
    color: "var(--tim-slate)",
    bg: "var(--tim-slate-bg)",
    hint: "Dette, infrastructure, outillage. Invisible du client, pas du produit.",
  },
  {
    value: "etude",
    label: "Étude",
    color: "var(--tim-purple)",
    bg: "var(--tim-purple-bg)",
    hint: "On explore avant de décider s'il y a quelque chose à faire.",
  },
];

/** Mêmes valeurs et mêmes couleurs que la priorité des tickets — une demande ne change pas d'échelle en devenant un dev. */
export const DEV_PRIORITIES: DevOption[] = [
  { value: "urgente", label: "Urgente", color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
  { value: "haute", label: "Haute", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)" },
  { value: "normale", label: "Normale", color: "var(--tim-slate)", bg: "var(--tim-slate-bg)" },
  { value: "basse", label: "Basse", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" },
];

export const DEFAULT_DEV_TYPE = "feature";
export const DEFAULT_DEV_PRIORITY = "normale";

const toOptions = (list: DevOption[]) => list.map(({ label, value }) => ({ label, value }));

export const DEV_TYPE_OPTIONS = toOptions(DEV_TYPES);
export const DEV_PRIORITY_OPTIONS = toOptions(DEV_PRIORITIES);

const BY_FIELD: Record<string, DevOption[]> = {
  type: DEV_TYPES,
  priority: DEV_PRIORITIES,
};

/**
 * { label, fg, bg } pour un champ + une valeur — partagé par le champ d'édition
 * (DevSelectField), la cellule de liste (DevCell) et les cartes du Kanban, pour
 * qu'un type ait exactement la même pastille partout où il s'affiche.
 *
 * Ne couvre PAS le statut : celui-ci porte désormais sa propre couleur en base
 * (voir `paletteColor`).
 */
export function devMeta(field: string, value: string): { label: string; fg: string; bg: string; hint?: string } {
  const found = BY_FIELD[field]?.find((o) => o.value === value);
  // Repli : une valeur inconnue reste lisible plutôt que d'afficher une
  // pastille vide.
  if (!found) return { label: value, fg: "var(--tim-foreground)", bg: "var(--tim-surface)" };
  return { label: found.label, fg: found.color, bg: found.bg, hint: found.hint };
}

/**
 * Palette de l'admin, proposée aux STATUTS.
 *
 * Un statut est du contenu créé en back-office : sa couleur ne peut pas être
 * choisie au code, mais elle ne doit pas non plus être libre — une pastille
 * fuchsia au milieu de la palette TIM se remarquerait pour de mauvaises raisons.
 */
export const PALETTE: DevOption[] = [
  { value: "slate", label: "Ardoise", color: "var(--tim-slate)", bg: "var(--tim-slate-bg)" },
  { value: "blue", label: "Bleu", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)" },
  { value: "teal", label: "Turquoise", color: "var(--tim-teal)", bg: "var(--tim-teal-bg)" },
  { value: "indigo", label: "Indigo", color: "var(--tim-indigo)", bg: "var(--tim-indigo-bg)" },
  { value: "purple", label: "Violet", color: "var(--tim-purple)", bg: "var(--tim-purple-bg)" },
  { value: "green", label: "Vert", color: "var(--tim-green)", bg: "var(--tim-green-bg)" },
  { value: "amber", label: "Ambre", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)" },
  { value: "rose", label: "Rose", color: "var(--tim-rose)", bg: "var(--tim-rose-bg)" },
  { value: "red", label: "Rouge", color: "var(--tim-red)", bg: "var(--tim-red-bg)" },
  { value: "gray", label: "Gris", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)" },
];

export const DEFAULT_PALETTE_COLOR = "slate";

export const PALETTE_OPTIONS = PALETTE.map(({ label, value }) => ({ label, value }));

/** Couleurs d'une entrée de palette (repli sur l'ardoise si la valeur est inconnue). */
export const paletteColor = (value?: string | null): { fg: string; bg: string } => {
  const found = PALETTE.find((c) => c.value === value) ?? PALETTE[0];
  return { fg: found.color, bg: found.bg };
};
