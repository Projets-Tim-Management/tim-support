import { CategoryParentsInput } from "@/modules/analytics/admin/CategoryParentsInput";
import { resolveCategories, ROOT, type LiveCategory } from "@/modules/analytics/lib/expense-categories";
import { isPennylaneConfigured, loadPennylaneCategories, pennylaneErrorMessage } from "@/modules/partner/lib/pennylane";

/**
 * Le champ « Rattachement » du global `expense-categories` : les catégories de
 * sorties lues en direct sur Pennylane, chacune avec sa parente. Server
 * component : il lit Pennylane, puis passe la main au champ éditable.
 */
export async function CategoryParentsField({ path }: { path?: string }) {
  if (!isPennylaneConfigured()) return <p className="an-note">Pennylane n&apos;est pas connecté : les catégories ne peuvent pas être lues.</p>;
  let live: LiveCategory[];
  try {
    live = (await loadPennylaneCategories({ refresh: true })).filter((c) => c.direction !== "cash_in").map((c) => ({ id: String(c.id), label: c.label, direction: c.direction }));
  } catch (err) {
    return <p className="an-note">{pennylaneErrorMessage(err)}</p>;
  }
  // Ce que donne l'arbre par défaut, sans rien d'enregistré : le point de départ de chaque ligne.
  const defaults = Object.fromEntries(resolveCategories(live).map((n) => [n.id, n.unattached ? "" : (n.parentId ?? ROOT)]));
  return <CategoryParentsInput path={path ?? "parents"} categories={live.map(({ id, label }) => ({ id, label }))} defaults={defaults} />;
}
