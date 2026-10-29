"use client";

import { useConfig, useListQuery } from "@payloadcms/ui";
import { useEffect, useRef, useState } from "react";

import {
  buildFeatureFilters,
  canonical,
  countFor,
  sectionsFor,
  whereFor,
  type Cat,
  type FeatureFilters,
  type Plat,
  type PlatformKey,
} from "@/modules/editorial/lib/feature-filters";

/**
 * Filtres au-dessus de la liste des features (beforeListTable) : Web / Mobile,
 * puis la section (Chantier, Chiffres…), chacun avec son nombre de features.
 *
 * Le filtre est posé dans la condition de la liste (comme les onglets des
 * opportunités) : il vit dans l'URL, survit au rechargement, et se combine avec
 * la recherche. L'onglet actif se RECONNAÎT dans cette condition plutôt que
 * d'être mémorisé à part — sinon l'écran et la liste pourraient se contredire.
 */

const PLATFORMS: { key: PlatformKey | null; label: string }[] = [
  { key: null, label: "Toutes" },
  { key: "web", label: "Web" },
  { key: "mobile", label: "Mobile" },
];

type Feat = { categories?: unknown; platforms?: unknown };
/** `platform: undefined` = un autre filtre est posé : aucun onglet ne le représente. */
type Active = { platform: PlatformKey | null | undefined; section: string | null };

export function FeatureListFilters() {
  const {
    config: {
      routes: { api },
    },
  } = useConfig();
  const { query, refineListData } = useListQuery();
  const [filters, setFilters] = useState<FeatureFilters | null>(null);
  const [features, setFeatures] = useState<Feat[]>([]);
  const rowRef = useRef<HTMLDivElement>(null);
  const where = JSON.stringify(query?.where ?? {});

  // La section choisie reste VISIBLE dans la ligne qui défile, y compris
  // après un rechargement où elle serait tout au bout.
  useEffect(() => {
    const row = rowRef.current;
    const chip = row?.querySelector<HTMLElement>(".ftr-chip.is-active");
    if (row && chip) row.scrollTo({ left: chip.offsetLeft - row.clientWidth / 2 + chip.clientWidth / 2, behavior: "smooth" });
  }, [where, filters]);

  useEffect(() => {
    let cancelled = false;
    const get = (path: string) =>
      fetch(`${api}${path}`, { credentials: "include" }).then((r) => (r.ok ? r.json() : { docs: [] }));
    Promise.all([
      get("/feature-categories?limit=1000&depth=0&select[name]=true&select[parent]=true"),
      get("/platforms?limit=100&depth=0"),
      // Les features dans leur dernier état (brouillons compris, comme la liste),
      // pour compter ce que chaque filtre affichera.
      get("/features?limit=2000&depth=0&draft=true&select[categories]=true&select[platforms]=true"),
    ])
      .then(([c, p, f]) => {
        if (cancelled) return;
        setFilters(buildFeatureFilters((c.docs ?? []) as Cat[], (p.docs ?? []) as Plat[]));
        setFeatures((f.docs ?? []) as Feat[]);
      })
      .catch(() => !cancelled && setFilters(null));
    return () => {
      cancelled = true;
    };
  }, [api]);

  if (!filters) return null;

  // Le choix actif, reconnu dans la condition de la liste (calcul léger : une
  // vingtaine de comparaisons, refait à chaque rendu).
  const activeOf = (f: FeatureFilters): Active => {
    const where = JSON.stringify(canonical(query?.where ?? {}));
    for (const p of PLATFORMS) {
      if (JSON.stringify(canonical(whereFor(f, p.key, null))) === where) return { platform: p.key, section: null };
      for (const s of sectionsFor(f, p.key)) {
        if (JSON.stringify(canonical(whereFor(f, p.key, s.key))) === where) return { platform: p.key, section: s.key };
      }
    }
    // Autre filtre posé à la main : aucun onglet ne prétend le représenter.
    return { platform: undefined, section: null };
  };
  const active = activeOf(filters);

  const apply = (platform: PlatformKey | null, section: string | null) =>
    void refineListData({ where: whereFor(filters, platform, section) as never, page: 1 });

  const sections = active.platform === undefined ? [] : sectionsFor(filters, active.platform);

  // UNE ligne : la plateforme en sélecteur segmenté, puis les sections en
  // pastilles qui défilent horizontalement. Repliées à la ligne, elles prenaient
  // trois lignes d'en-tête dès qu'on dépassait la vingtaine de sections.
  return (
    <div className="ftr-filters">
      <div className="ftr-seg" role="group" aria-label="Filtrer par plateforme">
        {PLATFORMS.map((p) => (
          <button
            key={p.label}
            type="button"
            aria-pressed={active.platform === p.key}
            className={`ftr-seg__btn${active.platform === p.key ? " is-active" : ""}`}
            onClick={() => apply(p.key, null)}
          >
            {p.label}
            <span className="ftr-count">{countFor(filters, features, p.key, null)}</span>
          </button>
        ))}
      </div>

      {sections.length > 0 && (
        <div className="ftr-sections" role="group" aria-label="Filtrer par section" ref={rowRef}>
          <button
            type="button"
            className={`ftr-chip${active.section === null ? " is-active" : ""}`}
            onClick={() => apply(active.platform ?? null, null)}
          >
            Toutes les sections
          </button>
          {sections.map((s) => {
            const n = countFor(filters, features, active.platform ?? null, s.key);
            return (
              <button
                key={s.key}
                type="button"
                className={`ftr-chip${active.section === s.key ? " is-active" : ""}`}
                disabled={n === 0 && active.section !== s.key}
                onClick={() => apply(active.platform ?? null, s.key)}
              >
                {s.label}
                <span className="ftr-count">{n}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
