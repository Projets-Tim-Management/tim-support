/**
 * LES LISTES DE LA FEUILLE DE ROUTE, en UN endroit (relecture du 15/11/2026 : les équipes, les horizons et « qui »
 * étaient recopiés dans les collections, les routes, le moteur et la page). Sans dépendance : lisibles par un
 * composant client comme par le serveur. L'ordre des valeurs est celui des listes en base : ne pas le changer.
 */

export const ROADMAP_TEAMS = [
  { value: "sea", label: "SEA (publicité payante)", short: "SEA" },
  { value: "seo", label: "SEO/GEO (visibilité gratuite)", short: "SEO/GEO" },
  { value: "com", label: "Commercial & revenu", short: "Commercial" },
  { value: "tous", label: "Toute l'entreprise", short: "Entreprise" },
] as const;
export type RoadmapTeam = (typeof ROADMAP_TEAMS)[number]["value"];
export const TEAM_SHORT = Object.fromEntries(ROADMAP_TEAMS.map((t) => [t.value, t.short])) as Record<RoadmapTeam, string>;
export const isRoadmapTeam = (v: unknown): v is RoadmapTeam => ROADMAP_TEAMS.some((t) => t.value === v);
/** Les options d'un champ « équipe » (collections). */
export const TEAM_OPTIONS = ROADMAP_TEAMS.map(({ value, label }) => ({ value, label }));

export const HORIZONS = [
  { value: "court", label: "Court terme (3 mois)", months: 3 },
  { value: "moyen", label: "Moyen terme (6 mois)", months: 6 },
  { value: "long", label: "Long terme (12 mois)", months: 12 },
] as const;
export type Horizon = (typeof HORIZONS)[number]["value"];
export const HORIZON_MONTHS = Object.fromEntries(HORIZONS.map((h) => [h.value, h.months])) as Record<Horizon, number>;

export const ACTION_WHO = [
  { label: "Direction", value: "direction" },
  { label: "Développement", value: "dev" },
  { label: "Commerciaux", value: "commerciaux" },
  { label: "Marketing", value: "marketing" },
  { label: "Support", value: "support" },
  { label: "Prestataire", value: "prestataire" },
  { label: "Autre", value: "autre" },
] as const;
export const WHO_LABEL: Record<string, string> = Object.fromEntries(ACTION_WHO.map((w) => [w.value, w.label]));

/** Une date « AAAA-MM-JJ » d'un formulaire, posée à midi UTC (le même jour partout en France) ; sinon null. */
export const dayToIso = (v: unknown): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) ? `${v}T12:00:00.000Z` : null);
