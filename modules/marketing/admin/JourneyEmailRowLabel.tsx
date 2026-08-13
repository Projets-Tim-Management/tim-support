"use client";

import { useRowLabel } from "@payloadcms/ui";

/**
 * Libellé de ligne d'un envoi automatique : objet + destinataire + échéance.
 * Replié, un tableau d'e-mails afficherait sinon « Envoi 01, 02… ».
 */
type EmailRow = {
  subject?: string;
  audience?: string;
  anchor?: string;
  offsetDays?: number;
};

const AUDIENCE: Record<string, string> = {
  client: "Client",
  partenaire: "Partenaire",
};

const when = (row: EmailRow): string => {
  const offset = row.offsetDays ?? 0;
  const signed = offset > 0 ? `+${offset}` : String(offset);
  if (row.anchor === "debut") return `début ${signed} j`;
  if (row.anchor === "fin") return `fin ${signed} j`;
  if (row.anchor === "milieu") return "mi-parcours";
  return "sur événement";
};

export function JourneyEmailRowLabel() {
  const { data, rowNumber } = useRowLabel<EmailRow>();
  const num = typeof rowNumber === "number" ? String(rowNumber + 1).padStart(2, "0") : "—";

  return (
    <span className="jr-rowlabel">
      <span className="jr-rowlabel__num">{num}</span>
      <span className="jr-rowlabel__title">{data?.subject?.trim() || "Nouvel envoi"}</span>
      {data?.audience && (
        <span className="jr-rowlabel__actor">{AUDIENCE[data.audience] ?? data.audience}</span>
      )}
      <span className="jr-rowlabel__actor">{when(data ?? {})}</span>
    </span>
  );
}
