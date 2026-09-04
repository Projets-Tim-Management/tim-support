"use client";

import { useRowLabel } from "@payloadcms/ui";

/**
 * Libellé d'une ligne de la liste « Messages » d'une séquence.
 *
 * Sept messages repliés afficheraient sept fois « Message 01, 02… ». Ce qu'on
 * veut lire, c'est le titre et le délai — c'est-à-dire le rythme de la séquence.
 */
type Row = { title?: string; delayValue?: number; delayUnit?: string; besoin?: string };

export function SequenceThemeRowLabel() {
  const { data, rowNumber } = useRowLabel<Row>();

  const num = typeof rowNumber === "number" ? String(rowNumber + 1).padStart(2, "0") : "—";
  const delay =
    data?.delayValue != null && data?.delayUnit
      ? `+ ${data.delayValue} ${data.delayUnit}`
      : "délai non défini";

  return (
    <span>
      {num} — {data?.title?.trim() || "Nouveau message"} · {delay}
      {data?.besoin ? " · ciblé" : ""}
    </span>
  );
}
