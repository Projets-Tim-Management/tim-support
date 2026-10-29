import type { FeatureTerm } from "@/core/lib/types";

/**
 * Une catégorie et toute sa descendance, à n'importe quelle profondeur
 * (protégé contre une boucle dans les parents).
 *
 * Seule définition du « dessous » d'une catégorie : les filtres de l'admin et
 * la page publique /features?category= doivent montrer les mêmes fiches.
 */
export function descendants<K>(children: ReadonlyMap<K, readonly K[]>, root: K): K[] {
  const out: K[] = [];
  const seen = new Set<K>();
  const stack = [root];
  while (stack.length) {
    const cur = stack.pop()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    out.push(cur);
    stack.push(...(children.get(cur) ?? []));
  }
  return out;
}

/**
 * Une fiche n'est rangée que dans sa catégorie la plus précise
 * (« Mobile › Chantier › Info ») : afficher « Chantier » doit pourtant la
 * montrer, comme toutes les fiches de ses sous-catégories. Rend les ids ; vide
 * si le slug est inconnu.
 */
export function categoryAndDescendants(terms: FeatureTerm[], slug: string): Set<number> {
  const root = terms.find((t) => t.slug === slug);
  if (!root) return new Set();
  const children = new Map<number, number[]>();
  for (const t of terms) if (t.parent) children.set(t.parent, [...(children.get(t.parent) ?? []), t.id]);
  return new Set(descendants(children, root.id));
}
