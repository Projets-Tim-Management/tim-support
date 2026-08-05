"use client";

import { useListQuery } from "@payloadcms/ui";

import { CLIENT_STATUSES } from "@/modules/partner/lib/clientStatus";

/**
 * Onglets de statut au-dessus de la LISTE « Clients apportés » (beforeListTable).
 * Chaque onglet pré-filtre la liste par `clientStatus` via `handleWhereChange`
 * (« Tous » enlève le filtre). Plus lisible qu'un filtre manuel.
 */

type WhereLike = { clientStatus?: { equals?: string }; and?: WhereLike[]; or?: WhereLike[] } | undefined;

// « Tous » puis un onglet par statut, dans l'ordre du pipeline (CLIENT_STATUSES).
const TABS: { label: string; value: string | null }[] = [
  { label: "Tous", value: null },
  ...CLIENT_STATUSES.map(({ label, value }) => ({ label, value })),
];

/** Extrait le statut actif du `where` courant (gère les groupes and/or). */
function currentStatus(where: WhereLike): string | null {
  if (!where) return null;
  if (where.clientStatus?.equals) return where.clientStatus.equals;
  for (const group of [where.and, where.or]) {
    if (Array.isArray(group)) {
      for (const cond of group) {
        const s = currentStatus(cond);
        if (s) return s;
      }
    }
  }
  return null;
}

export function PartnerClientsStatusTabs() {
  const { query, refineListData } = useListQuery();
  const active = currentStatus(query?.where as WhereLike);

  const select = (value: string | null) => {
    // « Tous » : on réapplique le tri « actifs en premier » (statusRank) en plus
    // d'enlever le filtre — même si l'utilisateur avait trié par une colonne.
    // Un onglet de statut précis ne touche pas au tri (refineListData fusionne).
    void refineListData(
      value ? { where: { clientStatus: { equals: value } } } : { where: {}, sort: "statusRank" },
    );
  };

  return (
    <nav className="tim-status-tabs" aria-label="Filtrer par statut">
      {TABS.map((t) => (
        <button
          key={t.label}
          type="button"
          className={`tim-status-tab${active === t.value ? " tim-status-tab--active" : ""}`}
          onClick={() => select(t.value)}
        >
          {t.label}
        </button>
      ))}
    </nav>
  );
}
