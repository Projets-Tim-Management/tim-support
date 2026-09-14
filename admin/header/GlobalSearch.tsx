"use client";

import { useRouter } from "next/navigation";
import { type KeyboardEvent as ReactKeyboardEvent, useEffect, useMemo, useRef, useState } from "react";

/**
 * Recherche globale de la barre du haut : un champ, on tape, on arrive.
 *
 * Champ vide → les pages du logiciel (menu rapide). Avec un terme → pages qui
 * correspondent, puis les fiches (opportunités, partenaires, tickets…). Les
 * résultats viennent de /api/admin/search, qui applique les droits du compte.
 * ⌘K / Ctrl+K met le curseur dans le champ, ↑↓ parcourent, Entrée ouvre.
 */

interface PageHit {
  label: string;
  href: string;
  group?: string;
}
interface RecordHit {
  collection: string;
  collectionLabel: string;
  id: number | string;
  label: string;
  sub?: string;
  href: string;
}
interface Results {
  pages: PageHit[];
  records: RecordHit[];
}

/** Une ligne cliquable, quelle que soit sa famille — pour la navigation clavier. */
interface Row {
  key: string;
  href: string;
  title: string;
  meta?: string;
  kind: "page" | "record";
}

/** Délai après la dernière frappe avant d'interroger le serveur. */
const DEBOUNCE_MS = 180;

const isMac = () => typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

export default function GlobalSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const [loading, setLoading] = useState(false);
  const [cursor, setCursor] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /**
   * Les pages ne changent pas pendant la session : on garde la réponse du
   * champ vide pour ne pas la redemander à chaque ouverture du popover.
   */
  const pagesCache = useRef<Results | null>(null);
  const [mac, setMac] = useState(false);

  useEffect(() => setMac(isMac()), []);

  // ⌘K / Ctrl+K depuis n'importe où dans l'admin.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
        setOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // Requête débouncée, et la précédente est ANNULÉE (pas seulement ignorée) :
  // taper vite ne laisse pas dix recherches tourner côté serveur.
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (!q && pagesCache.current) {
      setResults(pagesCache.current);
      setCursor(0);
      setLoading(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
          signal: ctrl.signal,
        });
        if (!res.ok) throw new Error(String(res.status));
        const json = (await res.json()) as Results;
        if (!q) pagesCache.current = json;
        setResults(json);
        setCursor(0);
        setLoading(false);
      } catch (err) {
        if ((err as { name?: string })?.name === "AbortError") return;
        setResults({ pages: [], records: [] });
        setLoading(false);
      }
    }, q ? DEBOUNCE_MS : 0);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [query, open]);

  // Clic dehors / Échap ferment.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const rows = useMemo<Row[]>(() => {
    if (!results) return [];
    return [
      ...results.pages.map<Row>((p) => ({
        key: `p:${p.href}`,
        href: p.href,
        title: p.label,
        meta: p.group,
        kind: "page",
      })),
      ...results.records.map<Row>((r) => ({
        key: `r:${r.collection}:${r.id}`,
        href: r.href,
        title: r.label,
        meta: r.sub ? `${r.collectionLabel} · ${r.sub}` : r.collectionLabel,
        kind: "record",
      })),
    ];
  }, [results]);

  const go = (href: string) => {
    setOpen(false);
    setQuery("");
    inputRef.current?.blur();
    router.push(href);
  };

  const onKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open) {
      if (e.key === "ArrowDown") setOpen(true);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, rows.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter" && rows[cursor]) {
      e.preventDefault();
      go(rows[cursor].href);
    }
  };

  // Garde la ligne active visible quand on descend au clavier.
  useEffect(() => {
    rootRef.current
      ?.querySelector<HTMLElement>(`[data-row="${cursor}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [cursor]);

  const q = query.trim();
  // `rows` est construit pages puis fiches : l'index d'une fiche = son rang
  // + le nombre de pages, pas besoin de rechercher chaque ligne.
  const pageCount = results?.pages.length ?? 0;
  const pageRows = rows.slice(0, pageCount);
  const recordRows = rows.slice(pageCount);
  const empty = !loading && results !== null && rows.length === 0;

  const renderRow = (row: Row, i: number) => {
    return (
      <button
        key={row.key}
        type="button"
        role="option"
        aria-selected={i === cursor}
        data-row={i}
        className={`tim-gsearch__item${i === cursor ? " is-active" : ""}`}
        onMouseEnter={() => setCursor(i)}
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => go(row.href)}
      >
        <span className="tim-gsearch__item-icon" aria-hidden>
          {row.kind === "page" ? (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="1.8" />
              <path d="M3 9h18" stroke="currentColor" strokeWidth="1.8" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 3h8l4 4v14H6z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
              <path d="M9 12h6M9 16h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          )}
        </span>
        <span className="tim-gsearch__item-text">
          <span className="tim-gsearch__item-title">{row.title}</span>
          {row.meta && <span className="tim-gsearch__item-meta">{row.meta}</span>}
        </span>
      </button>
    );
  };

  return (
    <div className={`tim-gsearch${open ? " is-open" : ""}`} ref={rootRef}>
      <div className="tim-gsearch__field">
        <svg className="tim-gsearch__icon" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M21 21l-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <input
          ref={inputRef}
          type="text"
          className="tim-gsearch__input"
          placeholder="Rechercher une page, une fiche…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          role="combobox"
          aria-expanded={open}
          aria-controls="tim-gsearch-list"
          aria-autocomplete="list"
          aria-label="Rechercher dans le logiciel"
        />
        {query ? (
          <button
            type="button"
            className="tim-gsearch__clear"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            aria-label="Effacer"
          >
            ×
          </button>
        ) : (
          <kbd className="tim-gsearch__kbd" aria-hidden>
            {mac ? "⌘K" : "Ctrl K"}
          </kbd>
        )}
      </div>

      {open && (
        <div className="tim-gsearch__pop" id="tim-gsearch-list" role="listbox">
          {pageRows.length > 0 && (
            <div className="tim-gsearch__section">
              <div className="tim-gsearch__section-title">Pages</div>
              {pageRows.map((r, i) => renderRow(r, i))}
            </div>
          )}
          {recordRows.length > 0 && (
            <div className="tim-gsearch__section">
              <div className="tim-gsearch__section-title">Fiches</div>
              {recordRows.map((r, i) => renderRow(r, pageCount + i))}
            </div>
          )}
          {loading && rows.length === 0 && <div className="tim-gsearch__hint">Recherche…</div>}
          {empty && (
            <div className="tim-gsearch__hint">
              {q ? <>Rien pour « {q} »</> : "Aucune page disponible"}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
