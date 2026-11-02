import type { Payload } from "payload";

import { classifyExpenses, type Expense, type ExpenseRule } from "@/modules/analytics/lib/expenses";
import { isPennylaneConfigured, loadPennylaneTransactions, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Les dépenses, chargées une fois pour tous les écrans qui les lisent
 * (Facturation, Acquisition) : les relevés bancaires Pennylane (en cache une
 * heure), rangés par poste — règles de TIM d'abord, celles du code ensuite.
 * Sans Pennylane ou en panne : aucune dépense, et une note qui le dit.
 */
export async function loadExpenses(payload: Payload): Promise<{ expenses: Expense[]; note: string | null }> {
  if (!isPennylaneConfigured()) return { expenses: [], note: null };
  try {
    const [tx, settings] = await Promise.all([
      loadPennylaneTransactions(),
      payload.findGlobal({ slug: "expense-rules", depth: 0, overrideAccess: true }).catch(() => null),
    ]);
    const custom = ((settings as { rules?: ExpenseRule[] | null } | null)?.rules ?? []).filter((r) => r.match?.trim());
    const expenses = classifyExpenses(
      tx.map((t) => ({ id: String(t.id), date: t.date, label: t.label ?? "", amount: Number(t.amount), categories: (t.categories ?? []).map((c) => c.label) })),
      custom,
    );
    return { expenses, note: null };
  } catch (err) {
    return { expenses: [], note: `Dépenses indisponibles : ${pennylaneErrorMessage(err)}` };
  }
}
