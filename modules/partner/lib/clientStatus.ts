/**
 * Statuts d'une opportunité — source de vérité UNIQUE.
 *
 * Le même statut se décline dans quatre endroits (options du champ, rang de tri,
 * colonnes du Kanban, onglets de la liste) : les tenir séparés faisait qu'ajouter
 * un statut demandait quatre modifications, avec le risque d'en oublier une.
 *
 * Le pipeline reprend les étapes du CRM Brevo (« Prospect »), d'où viennent les
 * leads du site vitrine : un lead importé atterrit dans SA colonne, et non dans
 * un fourre-tout. Deux valeurs historiques ont été RENOMMÉES plutôt que
 * remplacées (`prospect` → `nouvelle`, `en-cours` → `en-qualification`) : les
 * fiches existantes gardent leur place sans réécriture de données.
 *
 * Trois statuts n'ont pas d'équivalent Brevo et restent propres à TIM :
 * « Résilié » et « Archivé » (des faits POSTÉRIEURS à la signature — Brevo
 * s'arrête à « Gagnée ») et la distinction entre les deux.
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
  /**
   * Étape du cycle de vie, pour que le code raisonne par PHASE et non par liste
   * de valeurs en dur (qu'il fallait sinon compléter à chaque nouveau statut) :
   *  - `pipeline` : avant la phase de test — un lead, rien à démarrer ;
   *  - `test`     : phase de test en cours ;
   *  - `client`   : affaire gagnée, contrat en cours (seule phase facturable) ;
   *  - `fin`      : plus rien à attendre (perdue, résilié, archivé).
   */
  phase: "pipeline" | "test" | "client" | "fin";
};

export const CLIENT_STATUSES: ClientStatus[] = [
  // ── Pipeline commercial (étapes Brevo) ───────────────────────────────────
  { value: "nouvelle", label: "Nouvelle", color: "var(--tim-blue)", bg: "var(--tim-blue-bg)", rank: 2, phase: "pipeline" },
  { value: "en-qualification", label: "En qualification", color: "var(--tim-teal)", bg: "var(--tim-teal-bg)", rank: 1, phase: "pipeline" },
  { value: "demo-programmee", label: "Démo programmée", color: "var(--tim-indigo)", bg: "var(--tim-indigo-bg)", rank: 0.9, phase: "pipeline" },
  { value: "attente-engagement", label: "En attente d'engagement", color: "var(--tim-amber)", bg: "var(--tim-amber-bg)", rank: 0.8, phase: "pipeline" },
  { value: "attente-longue", label: "En attente longue", color: "var(--tim-slate)", bg: "var(--tim-slate-bg)", rank: 2.5, phase: "pipeline" },
  // ── Phase de test, puis client ───────────────────────────────────────────
  { value: "en-test", label: "En phase de test", color: "var(--tim-purple)", bg: "var(--tim-purple-bg)", rank: 0.5, phase: "test" },
  { value: "actif", label: "Gagnée", color: "var(--tim-green)", bg: "var(--tim-green-bg)", rank: 0, phase: "client" },
  // ── Fins ─────────────────────────────────────────────────────────────────
  { value: "perdue", label: "Perdue", color: "var(--tim-rose)", bg: "var(--tim-rose-bg)", rank: 5, phase: "fin" },
  { value: "resilie", label: "Résilié", color: "var(--tim-red)", bg: "var(--tim-red-bg)", rank: 3, phase: "fin" },
  { value: "archive", label: "Archivé", color: "var(--tim-gray)", bg: "var(--tim-gray-bg)", rank: 4, phase: "fin" },
];

/** Statut d'une opportunité qui vient de naître (lead entrant, saisie manuelle). */
export const DEFAULT_CLIENT_STATUS = "nouvelle";

export const clientStatusMeta = (value?: string | null): ClientStatus | undefined =>
  CLIENT_STATUSES.find((s) => s.value === value);

/** Phase du cycle de vie d'un statut (défaut : celle du statut initial). */
export const clientPhase = (value?: string | null): ClientStatus["phase"] =>
  clientStatusMeta(value)?.phase ?? "pipeline";

/**
 * Vrai tant que l'opportunité n'est qu'un lead : rien n'a démarré, ni phase de
 * test ni dossier. Utilisé pour masquer les écrans qui n'ont rien à montrer.
 */
export const isPipelineStatus = (value?: string | null): boolean => clientPhase(value) === "pipeline";

/**
 * Statuts « terminés » : l'affaire est perdue ou le contrat est fini. Le Kanban
 * les grise et demande une date de fin (sauf « Perdue », qui n'en a pas).
 */
export const isEndedStatus = (value?: string | null): boolean => clientPhase(value) === "fin";

/**
 * Vrai quand l'affaire a été gagnée — et le reste ensuite (résiliée, archivée).
 *
 * C'est la frontière de tout ce qui n'existe qu'APRÈS la signature : facturation,
 * contrat, abonnement mensuel. « Perdue » en est exclue : une affaire perdue n'a
 * jamais eu de contrat.
 */
export const hasContractPhase = (value?: string | null): boolean =>
  value === "actif" || value === "resilie" || value === "archive";

/** Fins de CONTRAT (résilié / archivé) : elles exigent une date de fin. */
export const needsEndDate = (value?: string | null): boolean =>
  value === "resilie" || value === "archive";

/** Options du champ `select` (Payload). */
export const CLIENT_STATUS_OPTIONS = CLIENT_STATUSES.map(({ label, value }) => ({ label, value }));

/** value → rang de tri. */
export const CLIENT_STATUS_RANK: Record<string, number> = Object.fromEntries(
  CLIENT_STATUSES.map((s) => [s.value, s.rank]),
);
