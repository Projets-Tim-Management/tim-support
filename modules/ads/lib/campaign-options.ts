/**
 * Les listes fermées d'une campagne, lues par la collection ET par la fenêtre
 * « Nouvelle campagne » : sans dépendance serveur, utilisables côté client.
 */

/** Une page d'arrivée : une adresse complète en https://. */
export const LANDING_URL = /^https:\/\/[^\s/]+\.[^\s]+$/i;

export const OBJECTIVES = [
  { label: "Leads", value: "leads" },
  { label: "Trafic", value: "trafic" },
  { label: "Notoriété", value: "notoriete" },
  { label: "Autre", value: "autre" },
] as const;
