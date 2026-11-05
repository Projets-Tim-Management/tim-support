"use client";

import { FieldLabel, useField } from "@payloadcms/ui";
import { useMemo } from "react";

import { ROOT, type CategoryParents } from "@/modules/analytics/lib/expense-categories";

type Cat = { id: string; label: string };

/**
 * Une ligne par catégorie de sorties, dans l'ordre de l'arbre, avec un menu
 * « Catégorie parente ». Les catégories sans parente (nouvelles dans
 * Pennylane) sont en tête, signalées. L'enregistrement se fait avec le bouton
 * « Enregistrer » de Payload, comme tout réglage.
 */
export function CategoryParentsInput({ path, categories, defaults }: { path: string; categories: Cat[]; defaults: Record<string, string> }) {
  const { value, setValue } = useField<CategoryParents | null>({ path });
  const known = useMemo(() => new Set(categories.map((c) => c.id)), [categories]);
  // La parente de chaque catégorie : ce qui est enregistré, sinon l'arbre par défaut ; « » : à rattacher.
  const parentOf = (id: string): string => {
    const saved = value?.[id];
    if (saved === ROOT || (saved && known.has(saved) && saved !== id)) return saved;
    return defaults[id] ?? "";
  };

  const byId = new Map(categories.map((c) => [c.id, c]));
  const pathOf = (id: string): string => {
    const seen = new Set<string>();
    const parts: string[] = [];
    for (let cur: string | undefined = id; cur && cur !== ROOT && !seen.has(cur); cur = parentOf(cur) || undefined) {
      seen.add(cur);
      parts.unshift(byId.get(cur)?.label ?? "?");
    }
    return parts.join(" › ");
  };
  // Les descendants d'une catégorie ne peuvent pas devenir sa parente (pas de boucle).
  const isUnder = (id: string, ancestor: string) => {
    const seen = new Set<string>();
    for (let cur = parentOf(id); cur && cur !== ROOT && !seen.has(cur); cur = parentOf(cur)) {
      if (cur === ancestor) return true;
      seen.add(cur);
    }
    return false;
  };

  // L'ordre de l'arbre : chaque catégorie suivie de ses sous-catégories, par ordre alphabétique.
  const sortFr = (a: Cat, b: Cat) => a.label.localeCompare(b.label, "fr");
  const pending = categories.filter((c) => parentOf(c.id) === "").sort(sortFr);
  const subtree = (parent: string, depth: number): { cat: Cat; depth: number }[] =>
    categories
      .filter((x) => parentOf(x.id) === parent)
      .sort(sortFr)
      .flatMap((c) => [{ cat: c, depth }, ...subtree(c.id, depth + 1)]);

  const choose = (id: string, parent: string) => {
    // On enregistre l'arbre entier tel qu'il se lit : l'arbre par défaut devient explicite.
    const next: CategoryParents = {};
    for (const c of categories) {
      const p = c.id === id ? parent : parentOf(c.id);
      if (p) next[c.id] = p;
    }
    setValue(next);
  };

  const options = [...categories].sort((a, b) => pathOf(a.id).localeCompare(pathOf(b.id), "fr"));
  const row = (c: Cat, depth: number, alert = false) => {
    const current = parentOf(c.id);
    return (
      <tr key={c.id} className={alert ? "an-cat-edit__row--alert" : undefined}>
        <td>
          <span className="an-cat-edit__name" style={{ paddingLeft: `${depth * 1.25}rem` }}>
            {depth > 0 && <span aria-hidden>↳ </span>}
            {c.label}
          </span>
          {alert && <span className="an-badge an-badge--warn">À rattacher</span>}
        </td>
        <td>
          <select className="an-cat-edit__select" value={current} onChange={(e) => choose(c.id, e.target.value)} aria-label={`Catégorie parente de ${c.label}`}>
            {current === "" && <option value="">— Choisir —</option>}
            <option value={ROOT}>Catégorie principale (premier niveau)</option>
            {options
              .filter((o) => o.id !== c.id && !isUnder(o.id, c.id))
              .map((o) => (
                <option key={o.id} value={o.id}>
                  {pathOf(o.id)}
                </option>
              ))}
          </select>
        </td>
      </tr>
    );
  };

  return (
    <div className="field-type an-cat-edit">
      <FieldLabel label="Catégorie parente de chaque catégorie Pennylane" path={path} />
      {pending.length > 0 && (
        <p className="an-callout">
          {pending.length} catégorie{pending.length > 1 ? "s" : ""} sans parente : choisissez sa place, puis enregistrez. En attendant, ses dépenses sont comptées dans « À rattacher ».
        </p>
      )}
      <div className="an-scroll">
        <table className="an-table">
          <thead>
            <tr>
              <th>
                <span className="an-th">Catégorie Pennylane</span>
              </th>
              <th>
                <span className="an-th">Rangée sous</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {pending.flatMap((c) => [row(c, 0, true), ...subtree(c.id, 1).map(({ cat, depth }) => row(cat, depth))])}
            {subtree(ROOT, 0).map(({ cat, depth }) => row(cat, depth))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
