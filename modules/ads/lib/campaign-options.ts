/**
 * Les listes fermées d'une campagne, lues par la collection ET par la fenêtre
 * « Nouvelle campagne » : sans dépendance serveur, utilisables côté client.
 */

export const OBJECTIVES = [
  { label: "Leads", value: "leads" },
  { label: "Trafic", value: "trafic" },
  { label: "Notoriété", value: "notoriete" },
  { label: "Autre", value: "autre" },
] as const;
