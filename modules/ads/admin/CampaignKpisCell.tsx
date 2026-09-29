"use client";

type Kpis = { spend?: number; leads?: number; cpl?: number | null; since?: string; until?: string } | null | undefined;

const eur = (n: number) => n.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: n >= 100 ? 0 : 2 });

/**
 * Colonne « 7 derniers jours » de la liste des campagnes : la dépense, les leads
 * et le coût par lead que la synchro consolide sur sa fenêtre (lib/sync,
 * campaignKpis). Un brouillon n'a rien dépensé : un tiret.
 */
export function CampaignKpisCell({ cellData }: { cellData?: unknown }) {
  const k = cellData as Kpis;
  if (!k || k.spend == null) return <span className="ads-kpis ads-kpis--empty">—</span>;
  return (
    <span className="ads-kpis" title={k.since && k.until ? `Du ${k.since} au ${k.until}` : undefined}>
      {eur(k.spend)} · {k.leads ?? 0} lead{(k.leads ?? 0) > 1 ? "s" : ""}
      {k.cpl != null ? ` · ${eur(k.cpl)} / lead` : ""}
    </span>
  );
}
