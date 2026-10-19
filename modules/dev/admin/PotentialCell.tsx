"use client";

import { PotentialBadge } from "@/modules/partner/admin/PotentialBadge";
import { requestersTip, type PotentialDetail } from "@/modules/dev/lib/potential-shared";

/** Colonne « Potentiel » de la liste des développements : le demandeur le plus chaud. */
export function PotentialCell({ cellData, rowData }: { cellData?: unknown; rowData?: { potentialDetail?: PotentialDetail | null } }) {
  if (cellData == null || cellData === "") return <span style={{ color: "var(--tim-muted)" }}>—</span>;
  const detail = rowData?.potentialDetail;
  return <PotentialBadge score={Number(cellData)} status={detail?.requesters?.[0]?.status} tip={requestersTip(detail)} />;
}
