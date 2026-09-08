"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { positionOf, type DevStatusDoc } from "@/modules/dev/lib/devStatus";

/**
 * Colonne « Position » de l'écran des statuts : le rang, et deux flèches pour
 * déplacer la colonne dans le Kanban.
 *
 * Le champ `position` est un nombre — prévisible, et propagé aux développements
 * pour le tri de la liste. Mais réordonner vingt colonnes en retapant des
 * nombres est un travail d'écriture, pas un geste : les flèches échangent la
 * position avec la voisine, ce qui est le geste qu'on a en tête.
 */
type Props = { cellData?: unknown; rowData?: { id?: number | string } };

const patch = (id: number | string, position: number) =>
  fetch(`/payload-api/dev-statuses/${id}`, {
    method: "PATCH",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ position }),
  });

export function DevStatusMoveCell({ cellData, rowData }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const id = rowData?.id;
  const position = positionOf({ id: 0, position: cellData as number | string | null });

  const move = async (direction: -1 | 1) => {
    if (id == null || busy) return;
    setBusy(true);
    try {
      const res = await fetch("/payload-api/dev-statuses?limit=200&sort=position&depth=0", {
        credentials: "include",
      });
      const data = res.ok ? await res.json() : { docs: [] };
      const list: DevStatusDoc[] = Array.isArray(data?.docs) ? data.docs : [];
      const index = list.findIndex((s) => String(s.id) === String(id));
      const neighbour = list[index + direction];
      if (index < 0 || !neighbour) return; // déjà en bout de tableau

      const mine = positionOf(list[index]) ?? 0;
      const theirs = positionOf(neighbour) ?? 0;
      // Deux statuts à la même position (saisie manuelle) : l'échange serait
      // sans effet. On décale d'un cran plutôt que de ne rien faire.
      const [next, other] = mine === theirs ? [theirs + direction, mine] : [theirs, mine];
      await Promise.all([patch(id, next), patch(neighbour.id, other)]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  };

  return (
    <span className="dev-move">
      <button
        type="button"
        className="dev-move__btn"
        aria-label="Monter cette colonne"
        title="Monter"
        disabled={busy}
        onClick={() => void move(-1)}
      >
        ▲
      </button>
      <button
        type="button"
        className="dev-move__btn"
        aria-label="Descendre cette colonne"
        title="Descendre"
        disabled={busy}
        onClick={() => void move(1)}
      >
        ▼
      </button>
      <span className="dev-move__num">{position ?? "—"}</span>
    </span>
  );
}
