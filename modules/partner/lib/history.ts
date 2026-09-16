import type { PennylaneStamp } from "./billing-check";
import { hasContractPhase } from "./clientStatus";
import { round2 } from "./format";
import { monthKey, monthStart } from "./month";
import { computeClientCA, effectiveUnitPrice, licenceLinesOf } from "./pricing";

/**
 * L'historique mensuel d'une fiche : ce qui a été FACTURÉ, mois après mois.
 *
 * Tant qu'une affaire n'est pas gagnée, les licences saisies sont un devis en
 * préparation — un brouillon qu'on suit, pas de la facturation. Rien n'entre
 * dans l'historique. Il commence quand l'affaire est gagnée ET qu'on connaît
 * la date de démarrage de la facturation (l'abonnement Pennylane, sinon le
 * contrat) : la première ligne est datée de ce mois-là, jamais avant.
 *
 * Un client résilié garde son historique : c'est ce qui a été facturé, ça ne
 * s'efface pas ; simplement, on n'y ajoute plus rien.
 */

export type HistoryEntry = {
  at?: string;
  totalLicences?: number;
  caHT?: number;
  commission?: number;
  commissionRate?: number;
  detail?: unknown;
  pennylane?: PennylaneStamp;
  /**
   * Validation du mois : quelqu'un a constaté que la fiche et l'abonnement
   * Pennylane disent la même chose pour la facture de ce mois. Absent tant
   * que personne ne l'a signé — la ligne n'est alors qu'un ATTENDU.
   */
  validatedAt?: string | null;
  validatedBy?: number | string | { id?: number | string } | null;
  /** La date de la facture visée par cette validation (ISO jour). */
  invoiceDate?: string | null;
};

/**
 * Ce qu'une ligne d'historique raconte d'une configuration de licences :
 * totaux, commission, et le détail par profil au prix effectif (remise
 * déduite) — c'est lui que la signature compare.
 *
 * Partagé par le hook d'enregistrement de la fiche et par la validation
 * mensuelle : une seule façon de calculer, donc la même ligne quel que soit
 * le chemin qui l'écrit.
 */
export function buildHistoryEntry(
  licences: Record<string, number | null | undefined> | null | undefined,
  commissionRate: number,
): Omit<HistoryEntry, "at"> & { suggestedDiscountPct: number } {
  const lines = licenceLinesOf(licences);
  const { totalLicences, caHT, suggestedDiscountPct } = computeClientCA(lines);
  const detail = lines.map((l) => ({
    key: l.key,
    label: l.label,
    qty: l.qty,
    price: effectiveUnitPrice(l),
    listPrice: l.price,
    discountPct: l.discountPct || undefined,
    discountAmount: l.discountAmount || undefined,
    subtotal: round2(l.qty * effectiveUnitPrice(l)),
  }));
  return {
    totalLicences,
    caHT,
    commissionRate,
    commission: round2((caHT * commissionRate) / 100),
    detail,
    suggestedDiscountPct,
  };
}

export type HistoryPolicy = "write" | "keep" | "none";

/** Gagné : on écrit. Résilié / archivé : on garde. Pipeline, test, perdu : rien. */
export function historyPolicy(clientStatus?: string | null): HistoryPolicy {
  if (clientStatus === "actif") return "write";
  if (hasContractPhase(clientStatus)) return "keep";
  return "none";
}

/** Une seule ligne par mois (la dernière gagne), datée du 1er, triée. */
function normalizeHistory(entries: HistoryEntry[]): HistoryEntry[] {
  const byMonth = new Map<string, HistoryEntry>();
  for (const e of entries) {
    if (!e.at) continue;
    byMonth.set(monthKey(e.at), { ...e, at: monthStart(e.at) });
  }
  return [...byMonth.values()].sort((a, b) => Date.parse(a.at!) - Date.parse(b.at!));
}

/**
 * Recale l'historique sur le début de facturation : les mois d'avant sortent,
 * et si la fiche n'a plus rien après, son dernier état connu est reporté sur
 * le mois de démarrage — on ne perd pas ce qu'on savait, on le date juste.
 */
export function rebaseHistory(entries: HistoryEntry[], billingStart: string): HistoryEntry[] {
  const startKey = monthKey(billingStart);
  const startMs = Date.parse(monthStart(billingStart));
  const clean = normalizeHistory(entries);
  const kept = clean.filter((e) => Date.parse(e.at!) >= startMs);
  const dropped = clean.filter((e) => Date.parse(e.at!) < startMs);
  if (kept.length === 0 && dropped.length > 0) {
    const last = dropped[dropped.length - 1];
    return [{ ...last, at: monthStart(billingStart) }];
  }
  // Une ligne au mois de démarrage manque alors qu'un état antérieur existait :
  // on le reporte, sinon le premier mois facturé n'aurait pas de ligne.
  if (dropped.length > 0 && !kept.some((e) => monthKey(e.at!) === startKey)) {
    const last = dropped[dropped.length - 1];
    return normalizeHistory([{ ...last, at: monthStart(billingStart) }, ...kept]);
  }
  return kept;
}

/** Signature stable d'un détail (qté × prix par profil) : la même config ne crée pas de ligne. */
export const detailSignature = (detail: unknown): string =>
  (Array.isArray(detail) ? (detail as { key?: string; qty?: number; price?: number }[]) : [])
    .map((d) => `${d.key}:${d.qty}x${d.price}`)
    .join("|");

export type NextHistoryInput = {
  clientStatus?: string | null;
  /** Date de démarrage de la facturation (Pennylane, sinon contrat) ; null = inconnue. */
  billingStart: string | null;
  now: Date;
  /** La ligne à écrire si la config a changé (sans `at` : le module la date). */
  entry: Omit<HistoryEntry, "at">;
  /** Tampon Pennylane frais, s'il y en a un ; sinon on garde le dernier connu. */
  stamp?: PennylaneStamp;
  /** Vrai si le tampon vient d'une lecture fraîche (met à jour la dernière ligne même sans changement). */
  freshStamp: boolean;
};

/**
 * L'historique après cet enregistrement.
 *
 * Gagné avec une date de démarrage : la ligne va sur le mois courant — ou sur
 * le mois de démarrage s'il est à venir (on enregistre en septembre ce qui
 * sera facturé dès octobre). Le mois en cours se met à jour ; un nouveau mois
 * ou une config changée ajoute une ligne ; sinon rien, hormis le tampon.
 */
export function nextHistory(prev: HistoryEntry[], input: NextHistoryInput): HistoryEntry[] {
  const policy = historyPolicy(input.clientStatus);
  if (policy === "none") return [];
  if (policy === "keep" || !input.billingStart) return normalizeHistory(prev);

  const history = rebaseHistory(prev, input.billingStart);
  const startMs = Date.parse(input.billingStart);
  const target = startMs > input.now.getTime() ? monthStart(input.billingStart) : monthStart(input.now);
  const targetKey = monthKey(target);

  const last = history[history.length - 1];
  const stamp = input.stamp ?? last?.pennylane;
  const changed =
    !last ||
    detailSignature(last.detail) !== detailSignature(input.entry.detail) ||
    Number(last.commissionRate ?? -1) !== Number(input.entry.commissionRate ?? 0);

  if (changed) {
    const line: HistoryEntry = { ...input.entry, at: target, pennylane: stamp };
    if (last && monthKey(last.at!) === targetKey) history[history.length - 1] = line;
    else history.push(line);
  } else if (last && input.freshStamp) {
    history[history.length - 1] = { ...last, pennylane: stamp };
  }
  return normalizeHistory(history);
}
