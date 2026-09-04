/**
 * Pourquoi une affaire s'arrête — source de vérité unique.
 *
 * Sans motif, une opportunité perdue ne dit rien : on constate un chiffre qui
 * baisse sans savoir quoi corriger. Avec une liste FERMÉE, les raisons
 * s'additionnent et se comptent — « quatre affaires perdues sur le prix ce
 * trimestre » est une information, « perdu » n'en est pas une.
 *
 * Deux situations différentes, donc deux listes :
 *  - `prospect` : l'affaire n'a jamais été signée (statut « Perdue ») ;
 *  - `client`   : un client qui partait payait (« Résilié », « Archivé »).
 * Un client qui s'en va « faute de budget » et un prospect qui refuse « parce
 * que c'est trop cher » ne racontent pas la même histoire.
 *
 * ⚠️ `value` correspond à une valeur d'enum Postgres : ajouter une entrée ici
 * exige une migration (`npm run db:migrate:create`).
 */

export type LossScope = "prospect" | "client";

export type LossReason = {
  value: string;
  label: string;
  /** Situations où ce motif est proposé. */
  scopes: LossScope[];
};

export const LOSS_REASONS: LossReason[] = [
  // ── Communs aux deux situations ──────────────────────────────────────────
  { value: "prix", label: "Prix trop élevé", scopes: ["prospect", "client"] },
  { value: "fonctionnalites", label: "Manque de fonctionnalités", scopes: ["prospect", "client"] },
  { value: "concurrent", label: "Parti chez un concurrent", scopes: ["prospect", "client"] },
  { value: "budget", label: "Pas de budget", scopes: ["prospect", "client"] },
  { value: "cessation", label: "Cessation d'activité", scopes: ["prospect", "client"] },
  { value: "autre", label: "Autre motif", scopes: ["prospect", "client"] },

  // ── Affaire jamais signée ────────────────────────────────────────────────
  { value: "sans-reponse", label: "Sans réponse / injoignable", scopes: ["prospect"] },
  { value: "pas-le-moment", label: "Ce n'est pas le moment", scopes: ["prospect"] },
  { value: "besoin-different", label: "Besoin différent de notre offre", scopes: ["prospect"] },
  { value: "solution-interne", label: "Solution interne / fait maison", scopes: ["prospect"] },
  { value: "test-non-concluant", label: "Phase de test non concluante", scopes: ["prospect"] },
  /**
   * ⚠️ TEMPORAIRE. Posé sur les affaires perdues reprises du CRM Brevo, qui ne
   * portaient aucun motif : il faut bien en poser un (requireLossReason refuse
   * une fiche close sans motif), et un repli sur « Autre motif » polluerait des
   * statistiques que cette liste fermée sert justement à produire.
   *
   * À SUPPRIMER — entrée, valeur d'enum et code d'import — une fois toutes les
   * fiches qualifiées. À redemander à l'utilisateur à chaque mise en production.
   */
  { value: "a-qualifier", label: "À qualifier — repris de Brevo", scopes: ["prospect"] },

  // ── Client qui s'en va ───────────────────────────────────────────────────
  { value: "peu-utilise", label: "Outil trop peu utilisé", scopes: ["client"] },
  { value: "complexite", label: "Trop complexe pour les équipes", scopes: ["client"] },
  { value: "support", label: "Insatisfaction du support", scopes: ["client"] },
  { value: "reorganisation", label: "Réorganisation interne", scopes: ["client"] },
];

/** Options du champ `select` (Payload) : la liste complète. */
export const LOSS_REASON_OPTIONS = LOSS_REASONS.map(({ label, value }) => ({ label, value }));

export const lossReasonLabel = (value?: string | null): string | undefined =>
  LOSS_REASONS.find((r) => r.value === value)?.label;

/** Motifs proposés pour une situation donnée. */
export const reasonsFor = (scope: LossScope): LossReason[] =>
  LOSS_REASONS.filter((r) => r.scopes.includes(scope));

/**
 * Statuts qui exigent un motif, et la situation à proposer.
 *
 * « Perdue » interroge le prospect ; « Résilié » et « Archivé » interrogent le
 * client qui s'en va. Un statut absent de cette table n'en demande aucun.
 */
export const LOSS_SCOPE_BY_STATUS: Record<string, LossScope> = {
  perdue: "prospect",
  resilie: "client",
  archive: "client",
};

export const needsLossReason = (status?: string | null): boolean =>
  Boolean(status && status in LOSS_SCOPE_BY_STATUS);
