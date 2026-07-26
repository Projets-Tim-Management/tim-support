"use client";

import { useState, useEffect, useRef, useCallback, useMemo, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { Feature, FeatureACF, FeatureTerm } from "@/core/lib/types";
import { htmlToText } from "@/core/lib/html";

interface Props {
  open:          boolean;
  onClose:       () => void;
  /** Pré-remplit l'input quand la modale est ouverte (ex: depuis la barre home) */
  initialQuery?: string;
}

/** Retire les balises HTML, normalise les espaces ET décode les entities. */
function strip(html: string) {
  return htmlToText(html);
}

/** Retire les diacritiques (é → e, ç → c, etc.) — match insensible aux accents */
function unaccent(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

/** Forme normalisée pour comparaison : sans accents + lowercase */
function normalize(s: string): string {
  return unaccent(s).toLowerCase();
}

/**
 * Mots vides FR — filtrés de la query pour qu'une question type
 * "comment supprimer une licence ?" se résume aux mots porteurs de sens.
 * On garde volontairement les verbes d'action (supprimer, modifier, ajouter,
 * créer, voir, exporter, filtrer…) qui sont des mots-clés métier.
 */
const STOP_WORDS = new Set([
  // Articles & déterminants
  "le", "la", "les", "l",
  "de", "du", "des", "d",
  "a", "au", "aux",
  "un", "une", "cet", "ce", "cette", "ces",
  "mon", "ma", "mes", "ton", "ta", "tes", "son", "sa", "ses",
  "notre", "nos", "votre", "vos", "leur", "leurs",
  // Conjonctions
  "et", "ou", "mais", "ni", "car", "donc", "or",
  // Prépositions
  "en", "dans", "sur", "pour", "par", "avec", "sans", "sous",
  "vers", "chez", "entre", "depuis",
  // Pronoms
  "je", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles",
  "me", "te", "se", "lui", "y",
  "que", "qui", "quoi", "dont",
  // Mots interrogatifs
  "comment", "pourquoi", "quand", "quel", "quelle", "quels", "quelles",
  "combien", "est-ce",
  // Auxiliaires & verbes outils trop génériques
  "est", "es", "sont", "etre", "etais", "etait", "ete", "sera",
  "ai", "as", "ont", "avons", "avez", "avoir", "eu",
  "fait", "faire", "fais", "fasse",
  "puis", "peut", "peux", "peuvent",
  // Modalité & négation
  "ne", "pas", "plus", "moins", "tres", "trop", "peu",
  // Divers
  "si", "comme", "alors", "ainsi", "deja",
]);

/**
 * Découpe la query en tokens significatifs.
 * - sans accents, lowercase
 * - ponctuation retirée (?, !, ,, ., ', etc.)
 * - sans stop words, longueur minimale 2
 */
function tokenize(q: string): string[] {
  return normalize(q.trim())
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 1 && !STOP_WORDS.has(t));
}

/** Extrait les mots-clés du champ ACF — gère textarea (séparateurs , ; \n) ou repeater */
function extractKeywords(acf: FeatureACF | undefined): string[] {
  const raw = acf?.keywords;
  if (!raw) return [];
  if (Array.isArray(raw)) {
    return raw
      .map((item) => (typeof item === "string" ? item : ""))
      .filter(Boolean);
  }
  return raw.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Surligne TOUS les tokens (multi-mot) dans le texte, insensible aux accents.
 * Ex: query "reduire panneau" surligne "Réduire" ET "panneau" séparément.
 */
function Highlight({ text, query }: { text: string; query: string }) {
  const tokens = tokenize(query);
  if (tokens.length === 0) return <>{text}</>;

  const norm = normalize(text);
  // Hypothèse OK pour le français : normalize() préserve la longueur 1:1
  // (accents décomposés puis combining marks supprimés).
  const ranges: [number, number][] = [];
  for (const t of tokens) {
    let pos = 0;
    while ((pos = norm.indexOf(t, pos)) !== -1) {
      ranges.push([pos, pos + t.length]);
      pos += t.length;
    }
  }
  if (ranges.length === 0) return <>{text}</>;

  // Fusion des plages chevauchantes
  ranges.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [s, e] of ranges) {
    const last = merged[merged.length - 1];
    if (last && s <= last[1]) last[1] = Math.max(last[1], e);
    else merged.push([s, e]);
  }

  const out: ReactNode[] = [];
  let cursor = 0;
  merged.forEach(([s, e], i) => {
    if (s > cursor) out.push(text.slice(cursor, s));
    out.push(
      <mark key={i} className="bg-primary/15 text-primary font-semibold rounded-sm px-0.5 not-italic">
        {text.slice(s, e)}
      </mark>
    );
    cursor = e;
  });
  if (cursor < text.length) out.push(text.slice(cursor));
  return <>{out}</>;
}

export default function SearchModal({ open, onClose, initialQuery }: Props) {
  const [query,       setQuery]       = useState("");
  const [allFeatures, setAllFeatures] = useState<Feature[]>([]);
  const [categories,  setCategories]  = useState<FeatureTerm[]>([]);
  const [loaded,      setLoaded]      = useState(false);
  const [active,      setActive]      = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router   = useRouter();

  // Chargement unique au mount : toutes les features + catégories racines
  useEffect(() => {
    async function load() {
      try {
        const [featRes, catRes] = await Promise.all([
          fetch("/api/features"),
          fetch("/api/feature-categories"),
        ]);
        const feats: Feature[]     = await featRes.json();
        const cats:  FeatureTerm[] = await catRes.json();
        setAllFeatures(Array.isArray(feats) ? feats : []);
        setCategories(Array.isArray(cats) ? cats.filter((c) => !c.parent || c.parent === 0) : []);
      } catch {
        /* silencieux */
      } finally {
        setLoaded(true);
      }
    }
    load();
  }, []);

  // Reset + focus à l'ouverture (pré-rempli si initialQuery est fourni)
  useEffect(() => {
    if (open) {
      setQuery(initialQuery ?? "");
      setActive(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, initialQuery]);

  // Recherche avec score — filtre sur les features déjà chargées (instantané)
  const results = useMemo<Feature[]>(() => {
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    return allFeatures
      .map((f) => {
        const title     = normalize(f.acf?.title_feature || f.title);
        const desc      = f.acf?.short_description ? normalize(strip(f.acf.short_description)) : "";
        const cats      = f.categories.map((c) => normalize(c.name)).join(" ");
        const plats     = f.platforms.map((p) => normalize(p.name)).join(" ");
        const docTitles = (f.acf?.doc ?? []).map((s) => normalize(s.title_doc ?? "")).join(" ");
        const h2        = (f.search_h2 ?? []).map(normalize).join(" ");
        const h3        = (f.search_h3 ?? []).map(normalize).join(" ");
        const kw        = extractKeywords(f.acf).map(normalize).join(" ");

        // OR pondéré : chaque token contribue indépendamment, on classe par
        // score décroissant. Une question type "comment supprimer une licence"
        // → tokens ["supprimer", "licence"] → les features matchant les DEUX
        // remontent en premier, celles ne matchant qu'un seul ensuite.
        let score = 0;
        let matchedTokens = 0;
        for (const t of tokens) {
          let tokenScore = 0;
          if (title === t)              tokenScore += 20;
          else if (title.startsWith(t)) tokenScore += 12;
          else if (title.includes(t))   tokenScore += 7;
          if (h2.includes(t))           tokenScore += 5;
          if (docTitles.includes(t))    tokenScore += 4;
          if (kw.includes(t))           tokenScore += 4;
          if (desc.includes(t))         tokenScore += 3;
          if (h3.includes(t))           tokenScore += 2;
          if (cats.includes(t))         tokenScore += 2;
          if (plats.includes(t))        tokenScore += 1;

          if (tokenScore > 0) matchedTokens++;
          score += tokenScore;
        }

        // Bonus de couverture : +5 par token additionnel matché, pour pousser
        // les features qui matchent plusieurs mots de la question vers le haut.
        if (matchedTokens > 1) score += (matchedTokens - 1) * 5;

        return { f, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.f);
  }, [query, allFeatures]);

  // Suggestions quand pas de query : 5 features récentes
  const suggestions = useMemo(
    () => allFeatures.slice(0, 5),
    [allFeatures]
  );

  const displayList = query.trim() ? results : suggestions;

  const navigate = useCallback((path: string) => {
    onClose();
    router.push(path);
  }, [onClose, router]);

  // Navigation clavier
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape")    { onClose(); return; }
      if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, displayList.length - 1)); }
      if (e.key === "ArrowUp")   { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
      if (e.key === "Enter" && displayList[active]) navigate(`/features/${displayList[active].slug}`);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, displayList, active, navigate, onClose]);

  if (!open) return null;

  const q = query.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] px-4">

      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div className="relative w-full max-w-xl bg-white rounded-lg shadow-2xl overflow-hidden border border-border">

        {/* Input */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-border">
          <svg className="w-5 h-5 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActive(0); }}
            placeholder="Rechercher une fonctionnalité ou poser une question…"
            className="flex-1 text-sm text-foreground placeholder:text-muted outline-none bg-transparent"
          />
          {!loaded && (
            <svg className="w-4 h-4 text-muted animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          )}
          {q && (
            <button onClick={() => setQuery("")} className="text-muted hover:text-foreground transition-colors">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
          <button onClick={onClose} className="text-xs text-muted border border-border px-1.5 py-0.5 rounded hover:bg-surface transition shrink-0">
            Esc
          </button>
        </div>

        {/* Catégories rapides */}
        {!q && categories.length > 0 && (
          <div className="px-4 pt-3 pb-1">
            <p className="text-xs font-semibold text-muted uppercase tracking-wider mb-2">Parcourir</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => navigate(`/features?category=${cat.slug}`)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-sm border border-border bg-surface text-foreground hover:bg-[#f0f0f0] transition-all"
                >
                  {cat.slug === "web" ? "🖥️" : cat.slug === "mobile" ? "📱" : "📁"}
                  {cat.name}
                </button>
              ))}
              <button
                onClick={() => navigate("/features")}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-[5px] text-sm border border-border text-muted hover:bg-surface transition-all"
              >
                Toutes →
              </button>
            </div>
          </div>
        )}

        {/* Liste résultats / suggestions */}
        {displayList.length > 0 && (
          <div>
            <p className="px-4 pt-3 pb-1 text-xs font-semibold text-muted uppercase tracking-wider">
              {q ? `${results.length} résultat${results.length > 1 ? "s" : ""}` : "Suggestions"}
            </p>
            <ul className="pb-2 max-h-72 overflow-y-auto">
              {displayList.map((feature, i) => {
                const title   = feature.acf?.title_feature || feature.title;
                const excerpt = feature.acf?.short_description
                  ? strip(feature.acf.short_description).slice(0, 80)
                  : null;
                // 1ʳᵉ section qui matche la query, par ordre de priorité :
                // search_h2 (H2 HTML) > title_doc (titre de section ACF) > search_h3.
                // On considère qu'un heading "matche" s'il contient au moins un des
                // tokens (insensible à la casse et aux accents).
                const tokens = tokenize(q);
                const headingMatches = (h: string) => {
                  const n = normalize(h);
                  return tokens.some((t) => n.includes(t));
                };
                const docSectionTitle = tokens.length > 0
                  ? (feature.acf?.doc ?? [])
                      .map((s) => s.title_doc)
                      .find((t): t is string => typeof t === "string" && headingMatches(t))
                  : undefined;
                const matchedHeading = tokens.length > 0
                  ? (feature.search_h2 ?? []).find(headingMatches)
                    ?? docSectionTitle
                    ?? (feature.search_h3 ?? []).find(headingMatches)
                  : undefined;
                return (
                  <li key={feature.id}>
                    <button
                      onMouseEnter={() => setActive(i)}
                      onClick={() => navigate(`/features/${feature.slug}`)}
                      className={`w-full text-left flex items-start gap-3 px-4 py-2.5 transition-colors ${
                        active === i ? "bg-surface" : "hover:bg-surface"
                      }`}
                    >
                      <svg className="w-4 h-4 mt-0.5 text-muted shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">
                          <Highlight text={title} query={q} />
                        </p>
                        {excerpt && (
                          <p className="text-xs text-muted truncate mt-0.5">
                            <Highlight text={excerpt} query={q} />
                          </p>
                        )}
                        {matchedHeading && (
                          <p className="text-xs text-muted truncate mt-0.5 flex items-center gap-1">
                            <span aria-hidden className="text-primary/70 font-mono shrink-0">§</span>
                            <span className="truncate">
                              <Highlight text={matchedHeading} query={q} />
                            </span>
                          </p>
                        )}
                        {feature.categories.length > 0 && (
                          <div className="flex gap-1 mt-1">
                            {feature.categories.slice(0, 2).map((c) => (
                              <span key={c.id} className="text-xs px-1.5 py-0.5 rounded bg-surface text-muted border border-border">
                                {c.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                      <svg className="w-3.5 h-3.5 text-muted shrink-0 mt-1" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {/* Empty state — propose de contacter le support quand on ne trouve rien */}
        {q && loaded && results.length === 0 && (
          <div className="px-4 py-8 text-center space-y-3">
            <p className="text-2xl">🔍</p>
            <div>
              <p className="text-sm font-medium text-foreground">Aucun résultat pour « {query} »</p>
              <p className="text-xs text-muted mt-1">Essayez avec d&apos;autres mots-clés ou contactez-nous.</p>
            </div>
            <button
              type="button"
              onClick={() => navigate(`/contact?type=assistance&subject=${encodeURIComponent(query)}`)}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-primary text-white text-xs font-semibold hover:bg-primary-dark transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
              </svg>
              Poser ma question au support
            </button>
          </div>
        )}

        {/* Footer */}
        <div className="px-4 py-2.5 border-t border-border flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-border bg-surface font-mono text-[10px]">↑↓</kbd>
            Naviguer
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-border bg-surface font-mono text-[10px]">↵</kbd>
            Ouvrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 rounded border border-border bg-surface font-mono text-[10px]">Esc</kbd>
            Fermer
          </span>
          {loaded && (
            <span className="ml-auto text-[10px] tabular-nums">
              {allFeatures.length} fonctionnalité{allFeatures.length > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
