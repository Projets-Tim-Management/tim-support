"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { eur } from "@/modules/partner/lib/format";

/**
 * Tableau d'analyse : tri au clic sur l'en-tête, recherche, export CSV.
 *
 * Générique et sans fonction en props (les server components ne peuvent pas
 * en passer) : chaque colonne déclare un FORMAT (€, entier, date, badge…), le
 * composant sait le rendre et l'exporter. Une ligne peut mener à une fiche
 * (`href`), un badge se colore par sa valeur (`tone`).
 */

export type Format = "text" | "eur" | "int" | "date" | "pct" | "badge";

export type Column = {
  key: string;
  label: string;
  format?: Format;
  align?: "left" | "right";
  /** Pour `badge` : la classe de couleur par valeur (ex. { ok: "ok", ecart: "warn" }). */
  tones?: Record<string, "ok" | "warn" | "bad" | "muted">;
  /** Pour `badge` : le libellé par valeur. */
  labels?: Record<string, string>;
};

export type Row = Record<string, string | number | null | undefined> & { href?: string };

type Props = {
  columns: Column[];
  rows: Row[];
  /** Colonne de tri initiale et sens. */
  sort?: { key: string; dir: "asc" | "desc" };
  /** Nom du fichier CSV (sans extension). Pas d'export si absent. */
  csv?: string;
  /** Colonnes fouillées par la recherche ; pas de champ de recherche si vide. */
  searchKeys?: string[];
  emptyText?: string;
  /** Ligne de total : formatée comme les colonnes, texte libre dans la première. */
  total?: Row;
};

/** Les formats qui se lisent à droite, comme des nombres. */
const NUMERIC: ReadonlySet<Format> = new Set<Format>(["eur", "int", "pct"]);
const isNumeric = (col: Column) => col.align === "right" || (col.format != null && NUMERIC.has(col.format));

const fmtDate = (v: string) => new Date(v).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" });

function render(value: Row[string], col: Column) {
  if (value == null || value === "") return <span className="an-muted">—</span>;
  switch (col.format) {
    case "eur":
      return eur.format(Number(value));
    case "int":
      return Number(value).toLocaleString("fr-FR");
    case "pct":
      return `${Number(value).toLocaleString("fr-FR")} %`;
    case "date":
      return fmtDate(String(value));
    case "badge": {
      const key = String(value);
      return <span className={`an-badge an-badge--${col.tones?.[key] ?? "muted"}`}>{col.labels?.[key] ?? key}</span>;
    }
    default:
      return String(value);
  }
}

/** Valeur brute pour le CSV : nombres en virgule française, dates au jour, badges par libellé. */
function csvCell(value: Row[string], col: Column): string {
  if (value == null) return "";
  if (col.format === "eur" || col.format === "int" || col.format === "pct") return String(value).replace(".", ",");
  if (col.format === "date") return fmtDate(String(value));
  if (col.format === "badge") return col.labels?.[String(value)] ?? String(value);
  return String(value);
}

function toCsv(columns: Column[], rows: Row[]): string {
  const esc = (s: string) => (/[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  const head = columns.map((c) => esc(c.label)).join(";");
  const body = rows.map((r) => columns.map((c) => esc(csvCell(r[c.key], c))).join(";"));
  // BOM : sans lui, Excel ouvre le fichier en Latin-1 et casse les accents.
  return "\uFEFF" + [head, ...body].join("\n");
}

export function DataTable({ columns, rows, sort, csv, searchKeys = [], emptyText = "Rien à afficher.", total }: Props) {
  const [sortKey, setSortKey] = useState(sort?.key ?? columns[0]?.key);
  const [dir, setDir] = useState<"asc" | "desc">(sort?.dir ?? "asc");
  const [q, setQ] = useState("");

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const filtered = needle
      ? rows.filter((r) => searchKeys.some((k) => String(r[k] ?? "").toLowerCase().includes(needle)))
      : rows;
    const col = columns.find((c) => c.key === sortKey);
    const numeric = col?.format != null && NUMERIC.has(col.format);
    return [...filtered].sort((a, b) => {
      const va = a[sortKey];
      const vb = b[sortKey];
      if (va == null && vb == null) return 0;
      if (va == null) return 1;
      if (vb == null) return -1;
      const cmp = numeric ? Number(va) - Number(vb) : String(va).localeCompare(String(vb), "fr", { numeric: true });
      return dir === "asc" ? cmp : -cmp;
    });
  }, [rows, q, searchKeys, sortKey, dir, columns]);

  const onSort = (key: string) => {
    if (key === sortKey) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      const col = columns.find((c) => c.key === key);
      // Un montant se lit d'abord du plus grand ; un nom, dans l'ordre.
      setDir(col?.format != null && NUMERIC.has(col.format) ? "desc" : "asc");
    }
  };

  const download = () => {
    const blob = new Blob([toCsv(columns, shown)], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${csv}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="an-table-wrap">
      {(searchKeys.length > 0 || csv) && (
        <div className="an-table-bar">
          {searchKeys.length > 0 && (
            <input
              type="search"
              className="an-search"
              placeholder="Rechercher…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              aria-label="Rechercher dans le tableau"
            />
          )}
          <span className="an-table-bar__count">
            {shown.length} ligne{shown.length > 1 ? "s" : ""}
          </span>
          {csv && (
            <button type="button" className="an-btn" onClick={download} disabled={shown.length === 0}>
              Exporter CSV
            </button>
          )}
        </div>
      )}
      <div className="an-scroll">
        <table className="an-table">
          <thead>
            <tr>
              {columns.map((c) => {
                const on = c.key === sortKey;
                const right = isNumeric(c);
                return (
                  <th key={c.key} className={right ? "an-num" : ""} aria-sort={on ? (dir === "asc" ? "ascending" : "descending") : "none"}>
                    <button type="button" className={`an-th${on ? " an-th--on" : ""}`} onClick={() => onSort(c.key)}>
                      {c.label}
                      <span className="an-th__arrow" aria-hidden>
                        {on ? (dir === "asc" ? "↑" : "↓") : "↕"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="an-empty-cell">
                  {emptyText}
                </td>
              </tr>
            ) : (
              shown.map((r, i) => (
                <tr key={String(r.id ?? i)} className="an-row" style={{ animationDelay: `${Math.min(i, 20) * 25}ms` }}>
                  {columns.map((c, ci) => {
                    const right = isNumeric(c);
                    const cell = render(r[c.key], c);
                    return (
                      <td key={c.key} className={right ? "an-num" : ""}>
                        {ci === 0 && r.href ? (
                          <Link href={r.href} prefetch={false} className="an-link">
                            {cell}
                          </Link>
                        ) : (
                          cell
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
          {total && shown.length > 0 && (
            <tfoot>
              <tr className="an-total">
                {columns.map((c, ci) => {
                  const right = isNumeric(c);
                  return (
                    <td key={c.key} className={right ? "an-num" : ""}>
                      {ci === 0 ? String(total[c.key] ?? "Total") : total[c.key] == null ? "" : render(total[c.key], c)}
                    </td>
                  );
                })}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  );
}
