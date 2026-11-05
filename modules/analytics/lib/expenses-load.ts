import { classifyExpenses, type Expense } from "@/modules/analytics/lib/expenses";
import { isPennylaneConfigured, loadPennylaneSupplierInvoices, loadPennylaneTransactions, pennylaneErrorMessage, type PlSupplierInvoice } from "@/modules/partner/lib/pennylane";

/**
 * Les dépenses, chargées une fois pour tous les écrans qui les lisent
 * (Facturation, Acquisition) : les relevés bancaires Pennylane (en cache une
 * heure), rangés par poste selon les règles du code (expenses.ts), et ramenés
 * en HT pour se comparer au chiffre d'affaires (HT).
 *
 * La banque ne donne que le TTC. Le HT vient du taux de TVA des factures de
 * chaque fournisseur (TVA ÷ TTC sur toutes ses factures) : un fournisseur
 * étranger ou sans TVA reste à 0 %, un fournisseur français à 20 % perd sa TVA.
 * Une sortie sans fournisseur (frais bancaires, impôts, URSSAF, virements) n'a
 * pas de TVA. Sans Pennylane ou en panne : aucune dépense, et une note qui le dit.
 */
export async function loadExpenses(): Promise<{ expenses: Expense[]; note: string | null }> {
  if (!isPennylaneConfigured()) return { expenses: [], note: null };
  try {
    const [tx, invoices] = await Promise.all([loadPennylaneTransactions(), loadPennylaneSupplierInvoices().catch(() => null)]);
    const share = invoices ? vatShareBySupplier(invoices) : null;
    const expenses = classifyExpenses(
      tx.map((t) => ({
        id: String(t.id),
        date: t.date,
        label: t.label ?? "",
        amount: Number(t.amount),
        categories: (t.categories ?? []).map((c) => c.label),
        categoryRefs: (t.categories ?? []).map((c) => ({ id: String(c.id), label: c.label, weight: Number(c.weight ?? 1) || 1 })),
        vatShare: t.supplier && share ? (share.get(String(t.supplier.id)) ?? 0) : 0,
      })),
    );
    // Sans les factures fournisseurs, on ne peut pas retirer la TVA : l'écran le dit, plutôt que de mélanger.
    return { expenses, note: share ? null : "TVA des dépenses indisponible (factures fournisseurs Pennylane illisibles) : les dépenses sont comptées TTC." };
  } catch (err) {
    return { expenses: [], note: `Dépenses indisponibles : ${pennylaneErrorMessage(err)}` };
  }
}

/** Part de TVA dans le TTC, par fournisseur, sur toutes ses factures. */
export function vatShareBySupplier(invoices: PlSupplierInvoice[]): Map<string, number> {
  const sums = new Map<string, { amount: number; tax: number }>();
  for (const i of invoices) {
    if (!i.supplierId || i.amount <= 0) continue;
    const s = sums.get(i.supplierId) ?? { amount: 0, tax: 0 };
    s.amount += i.amount;
    s.tax += i.tax;
    sums.set(i.supplierId, s);
  }
  return new Map([...sums].map(([id, s]) => [id, Math.min(1, Math.max(0, s.tax / s.amount))]));
}
