"use client";

import { useEffect, useState } from "react";

import { paletteColor } from "@/modules/dev/lib/devMeta";

/**
 * Colonne « Statut » de la liste : le nom du statut dans SA couleur.
 *
 * Selon la profondeur de la requête, une relation arrive peuplée (objet) ou
 * réduite à son id — c'est le cas dans l'onglet « Besoins » d'une fiche
 * prospect, où le tableau des développements n'affichait alors qu'un tiret :
 * on ne savait pas si le développement était fait. On retrouve donc le
 * statut par son id, les statuts étant chargés UNE fois pour toute la page.
 */
type Props = { cellData?: unknown };
type StatusLite = { id: number | string; name?: string; color?: string };

let statusesOnce: Promise<Map<string, StatusLite>> | null = null;
const loadStatuses = () =>
  (statusesOnce ??= fetch("/payload-api/dev-statuses?limit=200&depth=0", { credentials: "include" })
    .then((r) => (r.ok ? r.json() : { docs: [] }))
    .then((j) => new Map(((j.docs ?? []) as StatusLite[]).map((s) => [String(s.id), s])))
    .catch(() => {
      statusesOnce = null;
      return new Map<string, StatusLite>();
    }));

export function DevStatusCell({ cellData }: Props) {
  const populated = typeof cellData === "object" && cellData !== null ? (cellData as StatusLite) : null;
  const id = populated ? null : cellData == null || cellData === "" ? null : String(cellData);
  const [resolved, setResolved] = useState<StatusLite | null>(null);

  useEffect(() => {
    if (id == null) return;
    let alive = true;
    void loadStatuses().then((map) => {
      if (alive) setResolved(map.get(id) ?? null);
    });
    return () => {
      alive = false;
    };
  }, [id]);

  const status = populated ?? resolved;
  if (!status?.name) return <span style={{ color: "var(--tim-muted)" }}>—</span>;
  const { fg, bg } = paletteColor(status.color);
  return (
    <span className="dev-pill" style={{ color: fg, background: bg }}>
      {status.name}
    </span>
  );
}
