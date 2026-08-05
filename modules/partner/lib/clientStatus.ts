/**
 * Statuts d'un client apporté — source de vérité UNIQUE.
 *
 * Le même statut se décline dans quatre endroits (options du champ, rang de tri,
 * colonnes du Kanban, onglets de la liste) : les tenir séparés faisait qu'ajouter
 * un statut demandait quatre modifications, avec le risque d'en oublier une.
 *
 * ⚠️ `value` correspond à une valeur d'enum Postgres : ajouter une entrée ici
 * exige une migration (`npm run db:migrate:create`), sans quoi l'enregistrement
 * échouera. L'ORDRE de cette liste est celui affiché (pipeline commercial).
 */

export type ClientStatus = {
  value: string;
  label: string;
  /** Couleur du texte / de la pastille (tokens de styles/_tokens.scss). */
  color: string;
  /** Fond clair associé. */
  bg: string;
  /**
   * Rang de tri (`statusRank`, stocké et indexé) : « actifs d'abord », puis le
   * pipeline vivant, puis les fins de contrat. Décimal assumé — voir le
   * commentaire de STATUS_RANK dans PartnerClients.ts.
   */
  rank: number;
};

export const CLIENT_STATUSES: ClientStatus[] = [
  { value: "prospect", label: "Prospect", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)", rank: 2 },
  { value: "en-cours", label: "En cours", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)", rank: 1 },
  { value: "en-test", label: "En test", color: "var(--tim-purple)", bg: "var(--tim-purple-bg)", rank: 0.5 },
  { value: "actif", label: "Actif", color: "var(--tim-green)", bg: "var(--tim-green-bg)", rank: 0 },
  { value: "resilie", label: "Résilié", color: "var(--tim-red)", bg: "var(--tim-red-bg)", rank: 3 },
  { value: "archive", label: "Archivé", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)", rank: 4 },
];

export const clientStatusMeta = (value?: string | null): ClientStatus | undefined =>
  CLIENT_STATUSES.find((s) => s.value === value);

/** Options du champ `select` (Payload). */
export const CLIENT_STATUS_OPTIONS = CLIENT_STATUSES.map(({ label, value }) => ({ label, value }));

/** value → rang de tri. */
export const CLIENT_STATUS_RANK: Record<string, number> = Object.fromEntries(
  CLIENT_STATUSES.map((s) => [s.value, s.rank]),
);
