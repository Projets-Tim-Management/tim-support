"use client";

/**
 * Cellule « Publication prévue » du tableau des articles (19/11/2026) : le créneau réservé
 * (« mar. 24/11 · 9 h »), seulement tant que l'article n'est pas en ligne.
 */
export function ScheduledCell({ cellData, rowData }: { cellData?: unknown; rowData?: { status?: string } }) {
  if (!cellData || rowData?.status === "publie") return <span className="tim-status-pill tim-status-pill--empty">—</span>;
  const d = new Date(String(cellData));
  if (Number.isNaN(d.getTime())) return <span className="tim-status-pill tim-status-pill--empty">—</span>;
  const day = d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" });
  const hour = d.toLocaleTimeString("fr-FR", { hour: "numeric", minute: "2-digit", timeZone: "Europe/Paris" }).replace(":00", " h").replace(":", " h ");
  return (
    <span className="art-scheduled" title={d.toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short", timeZone: "Europe/Paris" })}>
      {day} · {hour}
    </span>
  );
}
