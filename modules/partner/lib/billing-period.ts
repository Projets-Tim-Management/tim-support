/**
 * Périodicité de facturation d'un client.
 *
 * Les licences d'une fiche sont TOUJOURS des quantités par mois : c'est ce
 * qu'on suit mois après mois pour ajuster la facturation. La périodicité dit
 * seulement combien de mois une facture couvre — Pennylane répète alors les
 * lignes autant de fois (sections « Mois 1 », « Mois 2 », « Mois 3 »).
 */

export const BILLING_PERIODS = [
  { value: "mensuelle", label: "Mensuelle", months: 1 },
  { value: "trimestrielle", label: "Trimestrielle", months: 3 },
  { value: "semestrielle", label: "Semestrielle", months: 6 },
  { value: "annuelle", label: "Annuelle", months: 12 },
] as const;

export type BillingPeriod = (typeof BILLING_PERIODS)[number]["value"];

export const BILLING_PERIOD_OPTIONS = BILLING_PERIODS.map(({ value, label }) => ({ value, label }));

/** Mois couverts par une facture pour cette périodicité (mensuelle à défaut). */
export const billingPeriodMonths = (value?: string | null): number =>
  BILLING_PERIODS.find((p) => p.value === value)?.months ?? 1;

/** Libellé lisible d'un nombre de mois par facture : « tous les 3 mois ». */
export const monthsLabel = (months: number): string =>
  months === 1 ? "tous les mois" : months === 12 ? "tous les ans" : `tous les ${months} mois`;

/**
 * Nombre de mois couverts par une facture Pennylane, d'après sa règle de
 * récurrence. `null` si la règle n'est pas mensuelle ou annuelle (hebdo…) :
 * on ne sait pas la ramener au mois.
 */
export function pennylaneMonths(rule?: { rule_type?: string | null; interval?: number | null } | null): number | null {
  if (!rule?.rule_type) return 1;
  const n = Math.max(1, Number(rule.interval) || 1);
  if (rule.rule_type === "monthly") return n;
  if (rule.rule_type === "yearly") return 12 * n;
  return null;
}
