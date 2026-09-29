/**
 * Les listes fermées d'une créa — une seule définition, lue par la collection
 * (options des `select`) et par la carte de validation (libellés). Sans dépendance
 * serveur : utilisable côté client.
 */

export const CREATIVE_STATUSES = [
  { label: "Brouillon", value: "brouillon" },
  { label: "À valider", value: "a-valider" },
  { label: "Validée", value: "validee" },
  { label: "Refusée", value: "refusee" },
  // Phase 3b : quand c'est le support qui publie chez Meta.
  { label: "En ligne", value: "en-ligne" },
  { label: "Retirée", value: "retiree" },
] as const;

export const TEXT_KINDS = [
  { label: "Texte principal", value: "principal" },
  { label: "Titre", value: "titre" },
  { label: "Description", value: "description" },
] as const;

export const CREATIVE_FORMATS = [
  { label: "1:1", value: "1x1" },
  { label: "4:5", value: "4x5" },
  { label: "9:16", value: "9x16" },
] as const;

export const REFUSAL_REASONS = [
  { label: "Hors marque (ton, style)", value: "hors-marque" },
  { label: "Faux ou invérifiable", value: "faux" },
  { label: "Mal écrit", value: "mal-ecrit" },
  { label: "Visuel à reprendre", value: "visuel" },
  { label: "Doublon", value: "doublon" },
  { label: "Autre", value: "autre" },
] as const;

export const labelOf = (list: readonly { label: string; value: string }[], value?: string | null): string =>
  list.find((x) => x.value === value)?.label ?? value ?? "—";
