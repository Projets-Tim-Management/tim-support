"use client";

import { useListQuery } from "@payloadcms/ui";
import { useEffect, useRef } from "react";

import { PRODUCTION_KEY, TEST_RUN_WHERE } from "@/modules/marketing/lib/journey";

/**
 * Onglets au-dessus de la liste des parcours (beforeListTable) : « Phase de
 * test » et « Mise en production » sont deux parcours successifs d'un même
 * client — les mélanger faisait apparaître chaque client deux fois, avec des
 * colonnes (dates du test) qui ne valent que pour l'un des deux.
 *
 * « Phase de test » est l'onglet par défaut : sans filtre de parcours dans
 * l'adresse, la liste s'y place d'elle-même.
 */
const TABS = [
  { key: "test", label: "Phase de test", where: TEST_RUN_WHERE },
  { key: "production", label: "Mise en production", where: { journeyKey: { equals: PRODUCTION_KEY } } },
] as const;

type Where = Record<string, unknown>;

/**
 * Le filtre courant SANS condition de parcours (`journeyKey`) : c'est l'onglet
 * qui la porte. Les autres filtres restent. null s'il ne reste rien.
 */
function withoutJourney(where: unknown): Where | null {
  if (!where || typeof where !== "object") return null;
  const out: Where = {};
  for (const [k, v] of Object.entries(where as Where)) {
    if (k === "journeyKey") continue;
    if ((k === "and" || k === "or") && Array.isArray(v)) {
      const kept = v.map(withoutJourney).filter((w): w is Where => w !== null);
      if (kept.length) out[k] = kept;
    } else out[k] = v;
  }
  return Object.keys(out).length ? out : null;
}

/**
 * Filtre de l'onglet + filtres de l'utilisateur (la recherche vit à part).
 * Un `and` déjà seul en tête est déplié : sans cela, chaque clic d'onglet
 * emboîtait le filtre un niveau plus bas.
 */
const tabWhere = (current: unknown, tab: Where): Where => {
  const rest = withoutJourney(current);
  if (!rest) return tab;
  const keys = Object.keys(rest);
  const kept = keys.length === 1 && keys[0] === "and" && Array.isArray(rest.and) ? (rest.and as Where[]) : [rest];
  return { and: [...kept, tab] };
};

export function JourneyRunsTabs() {
  const { query, refineListData } = useListQuery();
  const raw = JSON.stringify(query?.where ?? {});
  const active = raw.includes(PRODUCTION_KEY) ? "production" : raw.includes("phase-de-test") ? "test" : null;
  const placed = useRef(false);

  // Onglet par défaut, une seule fois à l'arrivée.
  useEffect(() => {
    if (placed.current || active) return;
    placed.current = true;
    void refineListData({ where: tabWhere(query?.where, TEST_RUN_WHERE) as never, page: 1 });
  }, [active, refineListData, query?.where]);

  return (
    <nav className="tim-status-tabs" aria-label="Type de parcours">
      {TABS.map((t) => (
        <button
          key={t.key}
          type="button"
          className={`tim-status-tab${active === t.key ? " tim-status-tab--active" : ""}`}
          aria-pressed={active === t.key}
          onClick={() => void refineListData({ where: tabWhere(query?.where, t.where) as never, page: 1 })}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
