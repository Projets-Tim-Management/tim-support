import { classifyExpenses, type Expense } from "@/modules/analytics/lib/expenses";
import { isPennylaneConfigured, loadPennylaneTransactions, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Les dépenses, chargées une fois pour tous les écrans qui les lisent
 * (Facturation, Acquisition) : les relevés bancaires Pennylane (en cache une
 * heure), rangés par poste selon les règles du code (expenses.ts).
 * Sans Pennylane ou en panne : aucune dépense, et une note qui le dit.
 */
export async function loadExpenses(): Promise<{ expenses: Expense[]; note: string | null }> {
  if (!isPennylaneConfigured()) return { expenses: [], note: null };
  try {
    const tx = await loadPennylaneTransactions();
    const expenses = classifyExpenses(
      tx.map((t) => ({ id: String(t.id), date: t.date, label: t.label ?? "", amount: Number(t.amount), categories: (t.categories ?? []).map((c) => c.label) })),
    );
    return { expenses, note: null };
  } catch (err) {
    return { expenses: [], note: `Dépenses indisponibles : ${pennylaneErrorMessage(err)}` };
  }
}
