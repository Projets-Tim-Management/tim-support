/**
 * Libellés FR + couleurs des champs « select » des tickets (statut, priorité,
 * type, service). Source unique partagée par les badges d'édition
 * (ColoredSelectField), les cellules de liste (ColoredCell) et l'en-tête du fil.
 */

export const TICKET_LABELS: Record<string, Record<string, string>> = {
  status: {
    new: "Nouveau",
    acknowledged: "Pris en compte",
    in_progress: "En cours",
    on_hold: "En attente",
    resolved: "Résolu",
  },
  priority: {
    urgent: "Urgente",
    high: "Haute",
    normal: "Normale",
    low: "Basse",
  },
  type: {
    assistance: "Assistance",
    suggestion: "Suggestion",
    autre: "Autre",
  },
  service: {
    technique: "Technique",
    facturation: "Facturation",
    support: "Support",
    commercial: "Commercial",
    autre: "Autre",
  },
};

// [couleur texte, couleur fond] par champ puis par valeur.
export const TICKET_COLORS: Record<string, Record<string, [string, string]>> = {
  status: {
    new: ["#1e6fd9", "#e7f0fd"],
    acknowledged: ["#6b46c1", "#efe9fb"],
    in_progress: ["#b45309", "#fdf0dd"],
    on_hold: ["#5b616e", "#eceef1"],
    resolved: ["#15803d", "#e3f5e9"],
  },
  priority: {
    urgent: ["#c0261b", "#fde8e6"],
    high: ["#b45309", "#fdf0dd"],
    normal: ["#5b616e", "#eceef1"],
    low: ["#6b7280", "#f3f4f6"],
  },
  type: {
    assistance: ["#1e6fd9", "#e7f0fd"],
    suggestion: ["#0f766e", "#dcf5f1"],
    autre: ["#5b616e", "#eceef1"],
  },
  service: {
    technique: ["#4338ca", "#e7e9fb"],
    facturation: ["#b45309", "#fdf0dd"],
    support: ["#be185d", "#fde7f0"],
    commercial: ["#15803d", "#e3f5e9"],
    autre: ["#5b616e", "#eceef1"],
  },
};

/** Renvoie { label, fg, bg } pour un champ + valeur donnés. */
export function ticketMeta(field: string, value: string): { label: string; fg: string; bg: string } {
  const label = TICKET_LABELS[field]?.[value] ?? value;
  const [fg, bg] = TICKET_COLORS[field]?.[value] ?? ["var(--tim-foreground)", "var(--tim-surface)"];
  return { label, fg, bg };
}

/** Valeurs valides d'un champ select de ticket (dérivées des libellés). */
export const ticketValues = (field: string): string[] => Object.keys(TICKET_LABELS[field] ?? {});

/** Média (pièce jointe) tel que renvoyé peuplé par l'API Payload. */
export type Media = { id: number; url?: string; alt?: string; filename?: string };
