"use client";

import { useState, type CSSProperties } from "react";

import { eur } from "@/modules/partner/lib/format";
import type { CategoryRow } from "@/modules/analytics/lib/expense-categories";

/**
 * Le tableau catégorie → sous-catégories × mois, à lire d'un coup d'œil :
 * chaque catégorie est une étiquette à la couleur de sa famille (la même que
 * dans le graphique au-dessus), les familles se détachent en gras, et tout est
 * déplié à l'ouverture ; un clic sur une famille la replie. Les colonnes
 * « Catégorie » et « Total » restent à l'écran quand on fait défiler les mois.
 * Les lignes s'additionnent : chaque catégorie compte tout ce qu'il y a dessous.
 */
export function CategoryTable({
  rows,
  months,
  colors = {},
  maxHeight,
}: {
  rows: CategoryRow[];
  months: { key: string; label: string }[];
  /** Couleur (CSS) de chaque famille, par id de catégorie de premier niveau ; sinon gris. */
  colors?: Record<string, string>;
  maxHeight?: string;
}) {
  const parents = rows.filter((r) => r.hasChildren).map((r) => r.id);
  const [open, setOpen] = useState<Set<string>>(() => new Set(parents));
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]));
  const rootOf = (r: CategoryRow) => {
    let id = r.id;
    for (let p = r.parentId; p; p = parentOf.get(p) ?? null) id = p;
    return id;
  };
  // Une ligne se montre quand toutes ses catégories au-dessus sont dépliées.
  const visible = (r: CategoryRow) => {
    for (let p = r.parentId; p; p = parentOf.get(p) ?? null) if (!open.has(p)) return false;
    return true;
  };
  const toggle = (id: string) =>
    setOpen((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const roots = rows.filter((r) => r.depth === 0);
  const totals = months.map((_, i) => roots.reduce((s, r) => s + r.values[i], 0));
  const cell = (v: number) => (v ? eur.format(v) : <span className="an-muted">—</span>);
  const allOpen = parents.every((id) => open.has(id));

  return (
    <div className="an-table-wrap">
      <div className="an-table-bar">
        <button type="button" className="an-btn" onClick={() => setOpen(allOpen ? new Set() : new Set(parents))}>
          {allOpen ? "Tout replier" : "Tout déplier"}
        </button>
      </div>
      <div className={`an-scroll${maxHeight ? " an-scroll--capped" : ""}`} style={maxHeight ? { maxHeight } : undefined}>
        <table className="an-table an-cat-table">
          <thead>
            <tr>
              <th>
                <span className="an-th">Catégorie</span>
              </th>
              {months.map((m) => (
                <th key={m.key} className="an-num">
                  <span className="an-th">{m.label}</span>
                </th>
              ))}
              <th className="an-num">
                <span className="an-th">Total</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.filter(visible).map((r) => {
              const color = r.muted ? undefined : colors[rootOf(r)];
              const chip = (
                <span className={`an-cat-chip an-cat-chip--d${Math.min(r.depth, 2)}${color ? "" : " an-cat-chip--gray"}`} style={color ? ({ "--chip": color } as CSSProperties) : undefined}>
                  {r.label}
                </span>
              );
              return (
                <tr key={r.id} className={`an-cat-table__row an-cat-table__row--d${Math.min(r.depth, 2)}`}>
                  <td>
                    <span className="an-cat-table__name" style={{ paddingLeft: `${r.depth * 1.25}rem` }}>
                      {r.hasChildren ? (
                        <button type="button" className="an-cat-table__toggle" onClick={() => toggle(r.id)} aria-expanded={open.has(r.id)} aria-label={`${open.has(r.id) ? "Replier" : "Déplier"} ${r.label}`}>
                          <span className="an-cat-table__caret" aria-hidden>
                            {open.has(r.id) ? "▾" : "▸"}
                          </span>
                          {chip}
                        </button>
                      ) : (
                        <>
                          <span className="an-cat-table__caret" aria-hidden />
                          {chip}
                        </>
                      )}
                    </span>
                  </td>
                  {r.values.map((v, i) => (
                    <td key={months[i].key} className="an-num">
                      {cell(v)}
                    </td>
                  ))}
                  <td className="an-num">{cell(r.total)}</td>
                </tr>
              );
            })}
          </tbody>
          <tfoot>
            <tr className="an-total">
              <td>Total</td>
              {totals.map((v, i) => (
                <td key={months[i].key} className="an-num">
                  {cell(v)}
                </td>
              ))}
              <td className="an-num">{cell(totals.reduce((s, v) => s + v, 0))}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
