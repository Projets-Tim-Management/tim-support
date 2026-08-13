"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

import { ticketMeta } from "./ticket-meta";

/**
 * Vues rapides au-dessus du tableau des tickets (façon helpdesk) :
 *  - filtres pré-définis (Nouveaux / En cours / Résolus / Urgents) via `where`
 *    dans l'URL, lu nativement par la liste Payload ;
 *  - « Tous » exclut les tickets RÉSOLUS : sur un helpdesk, la vue par défaut
 *    doit montrer ce qui reste à traiter, pas l'archive de tout ce qui a été
 *    fait. Les résolus gardent leur propre onglet.
 *    Le filtre passe par l'URL et non par `baseListFilter` : ce dernier
 *    s'applique AUSSI aux champs de relation, et masquerait les résolus
 *    jusque dans leur propre onglet ;
 *  - badge compteur par catégorie (masqué si 0 ; pas sur Tous ni Résolus) ;
 *  - clic n'importe où sur une ligne → ouvre la fiche du ticket.
 * Les filtres avancés restent dispo via le bouton « Filtres » de Payload.
 */
type Filter = {
  label: string;
  query: string;
  countKey?: string;
  color?: [field: string, value: string]; // couleur du bouton (palette ticket-meta)
};

/** Vue par défaut : tout sauf l'archive. */
const OPEN_ONLY = "where[status][not_equals]=resolved";

const FILTERS: Filter[] = [
  { label: "Tous", query: OPEN_ONLY },
  {
    label: "Nouveaux",
    query: "where[status][equals]=new",
    countKey: "where[status][equals]=new",
    color: ["status", "new"],
  },
  {
    label: "En cours",
    query: "where[status][equals]=in_progress",
    countKey: "where[status][equals]=in_progress",
    color: ["status", "in_progress"],
  },
  { label: "Résolus", query: "where[status][equals]=resolved", color: ["status", "resolved"] },
  {
    label: "Urgents",
    query: "where[priority][equals]=urgent",
    countKey: "where[priority][equals]=urgent",
    color: ["priority", "urgent"],
  },
];

export function TicketListFilters() {
  const pathname = usePathname();
  const router = useRouter();
  const search = decodeURIComponent(useSearchParams().toString());
  const [counts, setCounts] = useState<Record<string, number>>({});

  // Compteurs par catégorie (badges).
  useEffect(() => {
    let active = true;
    (async () => {
      const toCount = FILTERS.filter((f) => f.countKey);
      const results = await Promise.all(
        toCount.map(async (f) => {
          try {
            const res = await fetch(`/payload-api/tickets?${f.countKey}&limit=1&depth=0`, {
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
  }, []);

  // Arrivée sur la liste sans aucun filtre (menu, retour de fiche) : on applique
  // « Tous ». Écrire le filtre dans l'URL plutôt que le cacher rend l'absence
  // des résolus explicable d'un coup d'œil — et annulable en un clic.
  useEffect(() => {
    if (!search.includes("where[")) router.replace(`${pathname}?${OPEN_ONLY}`);
  }, [search, pathname, router]);

  // Clic sur une ligne → ouvre la fiche (délégation, survit aux re-rendus/pagination).
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target || target.closest("a, button, input, label, [role='button']")) return;
      const row = target.closest(".table tbody tr");
      if (!row) return;
      const href = row.querySelector("a[href]")?.getAttribute("href");
      if (href) router.push(href);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [router]);

  return (
    <div className="ticket-quickfilters">
      {FILTERS.map((f) => {
        const isActive = f.query ? search.includes(f.query) : !search.includes("where[");
        const count = f.countKey ? counts[f.label] ?? 0 : 0;
        const meta = f.color ? ticketMeta(f.color[0], f.color[1]) : null;
        // Couleur du bouton = couleur du label (clair au repos, plein si actif).
        const style = meta
          ? isActive
            ? { color: "#ffffff", background: meta.fg, borderColor: meta.fg }
            : {
                color: meta.fg,
                background: meta.bg,
                borderColor: `color-mix(in srgb, ${meta.fg} 35%, transparent)`,
              }
          : undefined;
        const badgeStyle = meta
          ? isActive
            ? { background: "#ffffff", color: meta.fg }
            : { background: meta.fg, color: "#ffffff" }
          : undefined;
        return (
          <Link
            key={f.label}
            href={f.query ? `${pathname}?${f.query}` : pathname}
            className={`ticket-quickfilter${isActive ? " ticket-quickfilter--active" : ""}`}
            style={style}
          >
            {f.label}
            {f.countKey && count > 0 ? (
              <span className="ticket-quickfilter__badge" style={badgeStyle}>
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </div>
  );
}
