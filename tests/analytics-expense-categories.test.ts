import { describe, expect, it } from "vitest";

import { categoryPivot, NONE_ID, resolveCategories, ROOT, UNATTACHED_ID, unattachedOf, type LiveCategory } from "@/modules/analytics/lib/expense-categories";
import type { Expense } from "@/modules/analytics/lib/expenses";

const cat = (id: string, label: string, direction: LiveCategory["direction"] = "cash_out"): LiveCategory => ({ id, label, direction });
const live = [cat("1", "Banque"), cat("2", "Frais bancaires"), cat("3", "Tenue de compte"), cat("4", "Marketing & acquisition"), cat("5", "Publicité en ligne"), cat("6", "Nouvelle catégorie"), cat("7", "Virement bancaire", "cash_in")];

const ex = (id: string, month: string, amount: number, cats: [string, string, number?][], kind: Expense["kind"] = "depense"): Expense => ({
  id,
  date: `${month}-10`,
  month,
  label: id,
  amount,
  amountTTC: amount,
  vat: 0,
  poste: "x",
  kind,
  categories: cats.map(([cid, label, weight]) => ({ id: cid, label, weight: weight ?? 1 })),
});

describe("catégories de dépenses Pennylane", () => {
  it("prend l'arbre par défaut, puis le rattachement enregistré ; signale l'inconnue", () => {
    const byLabel = (nodes: ReturnType<typeof resolveCategories>) => Object.fromEntries(nodes.map((n) => [n.label, n.unattached ? "?" : (n.parentId ?? ROOT)]));
    expect(byLabel(resolveCategories(live))).toEqual({
      Banque: ROOT,
      "Frais bancaires": "1",
      "Tenue de compte": "2",
      "Marketing & acquisition": ROOT,
      "Publicité en ligne": "4",
      "Nouvelle catégorie": "?",
      "Virement bancaire": ROOT,
    });
    expect(unattachedOf(resolveCategories(live)).map((n) => n.label)).toEqual(["Nouvelle catégorie"]);
    // Réglée sous Marketing : plus d'alerte. Tenue de compte déplacée sous Banque directement.
    const nodes = resolveCategories(live, { "6": "4", "3": "1" });
    expect(byLabel(nodes)).toMatchObject({ "Nouvelle catégorie": "4", "Tenue de compte": "1" });
    expect(unattachedOf(nodes)).toEqual([]);
  });

  it("casse une boucle et un rattachement vers une catégorie supprimée", () => {
    const nodes = resolveCategories(live, { "1": "2", "6": "999" });
    expect(nodes.find((n) => n.id === "6")?.unattached).toBe(true);
    // Banque sous Frais bancaires, lui-même sous Banque : la boucle est rompue.
    expect(nodes.filter((n) => ["1", "2"].includes(n.id)).some((n) => n.unattached)).toBe(true);
  });

  it("additionne chaque catégorie avec sa descendance, mois par mois", () => {
    const nodes = resolveCategories(live);
    const rows = categoryPivot(
      [
        ex("a", "2026-09", 10, [["3", "Tenue de compte"]]),
        ex("b", "2026-10", 5, [["2", "Frais bancaires"]]),
        ex("c", "2026-10", 100, [["5", "Publicité en ligne"]]),
        ex("d", "2026-10", 40, [["6", "Nouvelle catégorie"]]),
        ex("e", "2026-10", 7, []),
        // Partagée en deux : moitié pub, moitié tenue de compte.
        ex("f", "2026-09", 20, [
          ["5", "Publicité en ligne", 0.5],
          ["3", "Tenue de compte", 0.5],
        ]),
        // Pas une dépense (un transfert) : ignorée.
        ex("g", "2026-10", 999, [["5", "Publicité en ligne"]], "ignore"),
      ],
      nodes,
      ["2026-09", "2026-10"],
    );
    expect(rows.map((r) => [r.label, r.depth, r.values])).toEqual([
      ["Marketing & acquisition", 0, [10, 100]],
      ["Publicité en ligne", 1, [10, 100]],
      ["Banque", 0, [20, 5]],
      ["Frais bancaires", 1, [20, 5]],
      ["Tenue de compte", 2, [20, 0]],
      ["Frais bancaires (sans sous-catégorie)", 2, [0, 5]],
      ["À rattacher", 0, [0, 40]],
      ["Nouvelle catégorie", 1, [0, 40]],
      ["Sans catégorie dans Pennylane", 0, [0, 7]],
    ]);
    expect(rows.find((r) => r.id === UNATTACHED_ID)?.muted).toBe(true);
    expect(rows.find((r) => r.id === NONE_ID)?.total).toBe(7);
  });
});
