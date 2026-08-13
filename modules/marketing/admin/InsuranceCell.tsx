"use client";

import { useEffect, useState } from "react";

/**
 * Cellule « Date d'assurance » (véhicules, engins) : la date, plus un signal
 * quand l'échéance est passée. Une assurance expirée sur un engin de chantier
 * est un problème de conformité — il ne doit pas se cacher dans une colonne de
 * dates identiques.
 *
 * L'heure courante est lue APRÈS le montage (et non pendant le rendu) : un
 * `Date.now()` au rendu est impur et diverge entre serveur et client.
 */
export function InsuranceCell({ cellData }: { cellData?: unknown }) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => setNow(Date.now()), []);

  if (typeof cellData !== "string" || !cellData) return <span className="jr-ins jr-ins--none">—</span>;

  const ts = Date.parse(cellData);
  if (Number.isNaN(ts)) return <span className="jr-ins jr-ins--none">—</span>;

  const label = new Date(ts).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const expired = now != null && ts < now;

  return (
    <span className={`jr-ins${expired ? " jr-ins--expired" : ""}`}>
      {label}
      {expired && <span className="jr-ins__flag">expirée</span>}
    </span>
  );
}
