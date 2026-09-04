"use client";

import { useRowLabel } from "@payloadcms/ui";

/**
 * Libellé d'une ligne de la liste « Messages ».
 *
 * Sept messages repliés afficheraient sept fois « Message 01, 02… ». Ce qu'on
 * veut savoir d'un coup d'œil, c'est le thème, la date, et si c'est parti.
 */
type Row = {
  key?: string;
  scheduledAt?: string;
  sentAt?: string;
  skipped?: string;
};

const date = (iso?: string) =>
  iso ? new Date(iso).toLocaleDateString("fr-FR", { timeZone: "Europe/Paris" }) : "—";

export function SequenceMessageRowLabel() {
  const { data, rowNumber } = useRowLabel<Row>();

  const num = typeof rowNumber === "number" ? String(rowNumber + 1).padStart(2, "0") : "—";
  const title = data?.key ?? "Message";

  const state = data?.sentAt
    ? `envoyé le ${date(data.sentAt)}`
    : data?.skipped
      ? data.skipped === "desinscrit"
        ? "non envoyé · désinscrit"
        : "non envoyé · échec"
      : `prévu le ${date(data?.scheduledAt)}`;

  return (
    <span>
      {num} — {title} · {state}
    </span>
  );
}
