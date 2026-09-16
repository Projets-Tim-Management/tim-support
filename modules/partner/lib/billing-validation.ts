import type { ClientCheck, Issue, IssueCode, PennylaneStamp } from "./billing-check";
import { detailSignature, type HistoryEntry } from "./history";
import { monthKey, monthStart } from "./month";

/**
 * La validation mensuelle du rapprochement : « pour la facture du 4 octobre,
 * la fiche et l'abonnement Pennylane disent la même chose — je le signe ».
 *
 * Le rapprochement CONSTATE les écarts à l'instant T ; il ne gardait aucune
 * trace. On ne savait pas, le lendemain, si tel client avait été vérifié pour
 * tel mois, ni ce qui restait à faire. La validation est ce geste, et sa
 * trace vit dans l'historique de la fiche (`validatedAt`, `validatedBy`,
 * `invoiceDate` sur la ligne du mois) — ce qui rend la liste « à valider »
 * lisible depuis la base seule, sans appel Pennylane.
 *
 * LE MOIS VISÉ. Le client paie le mois qu'il est en train de vivre ; une
 * modification part sur la facture suivante. Le mois à valider est donc celui
 * de la PROCHAINE facture, que Pennylane connaît (`next_occurrence` : le 4 pour
 * la plupart, le 15 pour d'autres). Comparer la fiche aux lignes de
 * l'abonnement, c'est comparer avec ce qui sera facturé ce jour-là.
 *
 * LA RÈGLE. Une licence ajoutée ou retirée se modifie le même jour sur la
 * fiche ET sur l'abonnement. Tant que les deux divergent, le mois ne peut pas
 * être validé : c'est le filet contre l'oubli d'un des deux côtés. Pas de cas
 * « ça prend effet le mois prochain » — c'est Pennylane qui gère l'effet.
 *
 * Tout est pur : entrées → état, historique → historique.
 */

/**
 * Les écarts qui BLOQUENT la validation : ceux qui portent sur ce qui sera
 * facturé (quantités, prix, lignes, abonnement, identité du client). Un
 * paiement en retard ou une facture manquante sont des sujets d'encaissement,
 * signalés ailleurs — ils n'empêchent pas de dire que la configuration
 * d'octobre est juste.
 */
export const BLOCKING_CODES: ReadonlySet<IssueCode> = new Set<IssueCode>([
  "siren-mismatch",
  "no-subscription",
  "subscription-stopped",
  "subscription-draft",
  "not-active-but-billed",
  "multiple-subscriptions",
  "qty",
  "price",
  "duplicate-lines",
  "extra-lines",
  "billing-period",
]);

export const blockingIssues = (check: ClientCheck): Issue[] => check.issues.filter((i) => BLOCKING_CODES.has(i.code));

export type MonthState =
  /** Signé pour ce mois, et la fiche n'a pas bougé depuis. */
  | "valide"
  /** Signé, mais la configuration de la fiche a changé après : à re-signer (et l'abonnement doit suivre). */
  | "a-revalider"
  /** Conforme, personne ne l'a encore signé. */
  | "a-valider"
  /** Un écart bloque : à corriger d'un côté ou de l'autre. */
  | "ecart"
  /** Pas d'abonnement vivant, ou client introuvable dans Pennylane : rien à valider. */
  | "indisponible";

export type MonthValidation = {
  /** 1er du mois visé, ISO. */
  month: string;
  /** La facture visée (ISO jour) — `null` si Pennylane ne la donne pas. */
  invoiceDate: string | null;
  state: MonthState;
  validatedAt: string | null;
  validatedBy: number | string | null;
  /** Ce qui bloque, quand `state` est « ecart ». */
  blockers: Issue[];
};

const idOf = (ref: HistoryEntry["validatedBy"]): number | string | null =>
  ref && typeof ref === "object" ? (ref.id ?? null) : (ref ?? null);

/**
 * Le mois visé par la validation : celui de la prochaine facture. Sans
 * prochaine occurrence connue, le mois courant — c'est ce qu'on prépare.
 */
export const targetMonth = (check: Pick<ClientCheck, "pennylane"> | null, now: Date): string =>
  monthStart(check?.pennylane?.nextOccurrence ?? now);

/** La ligne d'historique du mois, s'il y en a une. */
export const entryForMonth = (history: HistoryEntry[], month: string): HistoryEntry | undefined =>
  history.find((e) => e.at && monthKey(e.at) === monthKey(month));

/**
 * Signature de la configuration ACTUELLE de la fiche, telle que le rapport
 * la voit (quantité × prix effectif par profil). C'est ce qu'on compare à la
 * ligne signée pour savoir si la fiche a bougé depuis.
 */
export const checkSignature = (check: Pick<ClientCheck, "rows">): string =>
  detailSignature(check.rows.map((r) => ({ key: r.key, qty: r.supportQty, price: r.supportPrice })));

/**
 * L'état du mois pour une fiche : validé, à revalider, à valider, écart, ou
 * rien à valider.
 */
export function monthValidation(
  history: HistoryEntry[],
  check: ClientCheck | null,
  now: Date,
): MonthValidation {
  const month = targetMonth(check, now);
  const invoiceDate = check?.pennylane?.nextOccurrence ?? null;
  const entry = entryForMonth(history, month);
  const validatedAt = entry?.validatedAt ?? null;
  const validatedBy = idOf(entry?.validatedBy);
  const base = { month, invoiceDate, validatedAt, validatedBy };

  if (!check?.pennylane?.subscriptionId || check.verdict === "sans-abonnement" || check.verdict === "non-rapproche") {
    return { ...base, state: "indisponible", blockers: blockingIssues(check ?? { issues: [] } as never) };
  }

  const blockers = blockingIssues(check);
  if (validatedAt) {
    // Signé — mais la fiche a-t-elle bougé depuis ? On compare ce que dit la
    // fiche aujourd'hui à ce qui a été signé, et on regarde si un écart est
    // apparu (l'abonnement n'a pas suivi).
    const moved = detailSignature(entry?.detail) !== checkSignature(check);
    return { ...base, state: moved || blockers.length ? "a-revalider" : "valide", blockers };
  }
  if (blockers.length) return { ...base, state: "ecart", blockers };
  return { ...base, state: "a-valider", blockers: [] };
}

/**
 * L'historique après une validation : la ligne du mois visé porte la
 * configuration actuelle de la fiche, le tampon Pennylane et la signature.
 *
 * La ligne peut ne pas exister encore (rien n'a changé depuis des mois : le
 * hook n'écrit qu'aux changements) — on la crée alors avec la configuration
 * du jour. Si elle existe, elle est REMPLACÉE par la configuration du jour :
 * on signe ce que la fiche dit maintenant, pas ce qu'elle disait.
 */
export function withValidation(
  history: HistoryEntry[],
  args: {
    month: string;
    invoiceDate: string | null;
    entry: Omit<HistoryEntry, "at">;
    stamp: PennylaneStamp | undefined;
    userId: number | string;
    at: Date;
  },
): HistoryEntry[] {
  const key = monthKey(args.month);
  const line: HistoryEntry = {
    ...args.entry,
    at: monthStart(args.month),
    pennylane: args.stamp ?? entryForMonth(history, args.month)?.pennylane,
    validatedAt: args.at.toISOString(),
    validatedBy: args.userId,
    invoiceDate: args.invoiceDate,
  };
  const others = history.filter((e) => !e.at || monthKey(e.at) !== key);
  return [...others, line].sort((a, b) => Date.parse(a.at ?? "") - Date.parse(b.at ?? ""));
}

/** L'historique après le retrait d'une validation : la ligne reste, comme attendu, sans signature. */
export function withoutValidation(history: HistoryEntry[], month: string): HistoryEntry[] {
  const key = monthKey(month);
  return history.map((e) =>
    e.at && monthKey(e.at) === key ? { ...e, validatedAt: null, validatedBy: null, invoiceDate: null } : e,
  );
}

/**
 * Ce qui reste à valider, DEPUIS LA BASE SEULE (pas d'appel Pennylane) : les
 * fiches gagnées dont aucune validation ne couvre une facture À VENIR. Une
 * validation vaut jusqu'au jour de sa facture ; passé ce jour, la suivante
 * est à préparer. Sert au compteur de l'accueil et au rappel du mois — là où
 * on ne veut pas attendre Pennylane.
 */
export function pendingValidations(
  clients: { id: number | string; clientStatus?: string | null; history?: HistoryEntry[] | null }[],
  now: Date,
): (number | string)[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(now);
  const covered = (h: HistoryEntry[]) =>
    h.some((e) => e.validatedAt && e.invoiceDate && e.invoiceDate.slice(0, 10) >= today);
  return clients
    .filter((c) => c.clientStatus === "actif")
    .filter((c) => !covered(c.history ?? []))
    .map((c) => c.id);
}
