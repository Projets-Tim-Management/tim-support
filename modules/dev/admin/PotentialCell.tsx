"use client";

import { PotentialBadge } from "@/modules/partner/admin/PotentialBadge";
import type { PotentialDetail } from "@/modules/dev/lib/potential-shared";

/** Colonne « Potentiel » de la liste des développements : le demandeur le plus chaud. */
export function PotentialCell({ cellData, rowData }: { cellData?: unknown; rowData?: { potentialDetail?: PotentialDetail | null } }) {
  if (cellData == null || cellData === "") return <span style={{ color: "var(--tim-muted)" }}>—</span>;
  const list = rowData?.potentialDetail?.requesters ?? [];
  const top = list[0];
  return <PotentialBadge score={Number(cellData)} status={top?.status} company={top?.company} more={Math.max(0, list.length - 1)} />;
}
