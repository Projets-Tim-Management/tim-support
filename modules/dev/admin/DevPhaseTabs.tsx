"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { devMeta, paletteColor } from "@/modules/dev/lib/devMeta";
import { DEV_PHASES, statusHasRole, type DevStatusDoc } from "@/modules/dev/lib/devStatus";

/**
 * Vues rapides au-dessus du tableau des développements.
 *
 * Une par PHASE, pas une par statut : une vingtaine d'onglets serait illisible,
 * et la question qu'on se pose en arrivant est plus grossière que le statut
 * exact (« qu'est-ce qui est en réalisation ? », pas « qu'est-ce qui est en
 * relecture ? »). Le statut précis se lit dans la colonne, et se travaille dans
 * le Kanban.
 *
 * « Tous » exclut ce qui est CLOS — c'est-à-dire les statuts qui portent le rôle
 * « clôt le dossier », quels que soient leurs noms. La vue par défaut doit
 * montrer ce qui vit. « En attente » y reste : un dev bloqué demande une action,
 * justement.
 *
 * Les filtres se construisent sur les IDS des statuts, donc à partir de la base :
 * un statut ajouté en Paramètres entre tout seul dans l'onglet de sa phase.
 */

type Filter = {
  label: string;
  query: string;
  counted?: boolean;
  hint?: string;
  /** Couleur du bouton, empruntée au premier statut de la phase. */
  colors?: { fg: string; bg: string };
};

const idsQuery = (statuses: DevStatusDoc[]) =>
  `where[status][in]=${statuses.map((s) => s.id).join(",")}`;

export function DevPhaseTabs() {
  const pathname = usePathname();
  const router = useRouter();
  const search = decodeURIComponent(useSearchParams().toString());
  const [statuses, setStatuses] = useState<DevStatusDoc[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch("/payload-api/dev-statuses?limit=200&sort=position&depth=0", {
          credentials: "include",
        });
        const data = res.ok ? await res.json() : { docs: [] };
        if (active) setStatuses(Array.isArray(data?.docs) ? data.docs : []);
      } catch {
        if (active) setStatuses([]);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  /** Vue par défaut : tout ce qui n'est pas classé. */
  const openOnly = useMemo(() => {
    const closed = (statuses ?? []).filter((s) => statusHasRole(s, "cloture"));
    return closed.length > 0 ? `where[status][not_in]=${closed.map((s) => s.id).join(",")}` : "";
  }, [statuses]);

  const filters = useMemo<Filter[]>(() => {
    if (!statuses || statuses.length === 0) return [];
    // Une phase sans statut n'a pas d'onglet : il ne montrerait jamais rien.
    const phases: Filter[] = [];
    for (const phase of DEV_PHASES) {
      const list = statuses.filter((s) => s.phase === phase.value);
      if (list.length === 0) continue;
      phases.push({
        label: phase.label,
        hint: phase.hint,
        query: idsQuery(list),
        counted: true,
        colors: paletteColor(list[0].color),
      });
    }

    const urgent = devMeta("priority", "urgente");
    return [
      { label: "Tous", query: openOnly, hint: "Tout ce qui n'est ni terminé ni écarté" },
      ...phases,
      {
        label: "Urgents",
        query: "where[priority][equals]=urgente",
        counted: true,
        colors: { fg: urgent.fg, bg: urgent.bg },
      },
    ];
  }, [statuses, openOnly]);

  useEffect(() => {
    let active = true;
    (async () => {
      const results = await Promise.all(
        filters
          .filter((f) => f.counted)
          .map(async (f) => {
            try {
              const res = await fetch(`/payload-api/developments?${f.query}&limit=1&depth=0`, {
                credentials: "include",
              });
              const data = res.ok ? await res.json() : { totalDocs: 0 };
              return [f.label, Number(data.totalDocs) || 0] as const;
            } catch {
              return [f.label, 0] as const;
            }
          }),
      );
      if (active) setCounts(Object.fromEntries(results));
    })();
    return () => {
      active = false;
    };
  }, [filters]);

  // Arrivée sans filtre (menu, retour de fiche) → « Tous ». Écrit dans l'URL
  // plutôt que caché : l'absence des développements classés s'explique alors
  // d'un coup d'œil, et s'annule en un clic.
  useEffect(() => {
    if (openOnly && !search.includes("where[")) router.replace(`${pathname}?${openOnly}`);
  }, [search, pathname, router, openOnly]);

  if (filters.length === 0) return null;

  return (
    <div className="dev-quickfilters">
      {filters.map((f) => {
        const isActive = f.query !== "" && search.includes(f.query);
        const count = counts[f.label] ?? 0;
        const style = f.colors
          ? isActive
            ? { color: "var(--tim-white)", background: f.colors.fg, borderColor: f.colors.fg }
            : {
                color: f.colors.fg,
                background: f.colors.bg,
                borderColor: `color-mix(in srgb, ${f.colors.fg} 35%, transparent)`,
              }
          : undefined;
        const badgeStyle = f.colors
          ? isActive
            ? { background: "var(--tim-white)", color: f.colors.fg }
            : { background: f.colors.fg, color: "var(--tim-white)" }
          : undefined;
        return (
          <Link
            key={f.label}
            href={f.query ? `${pathname}?${f.query}` : pathname}
            className={`dev-quickfilter${isActive ? " dev-quickfilter--active" : ""}`}
            style={style}
            title={f.hint}
          >
            {f.label}
            {f.counted && count > 0 ? (
              <span className="dev-quickfilter__badge" style={badgeStyle}>
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
