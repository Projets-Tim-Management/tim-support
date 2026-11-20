"use client";

/**
 * Cellule « Performance » du tableau des articles (19/11/2026) : le verdict du diagnostic, et au
 * survol le pourquoi et quoi faire. Calculé à la lecture (champ virtuel `performance`).
 */
const TONE: Record<string, { color: string; bg: string; icon: string }> = {
  performe: { color: "var(--tim-green)", bg: "var(--tim-green-bg)", icon: "✓" },
  moyen: { color: "var(--tim-amber)", bg: "var(--tim-amber-bg)", icon: "~" },
  "a-ameliorer": { color: "var(--tim-red)", bg: "var(--tim-red-bg)", icon: "✗" },
  observation: { color: "var(--tim-muted)", bg: "var(--tim-surface)", icon: "…" },
};

export function PerfCell({ cellData }: { cellData?: unknown }) {
  const d = cellData as { verdict?: string; label?: string; why?: string; action?: string } | null | undefined;
  if (!d?.verdict || d.verdict === "hors-ligne") return <span className="tim-status-pill tim-status-pill--empty">—</span>;
  const t = TONE[d.verdict] ?? TONE.observation;
  return (
    <span className="tim-status-pill" style={{ background: t.bg, color: t.color }} title={`${d.why ?? ""}\n→ ${d.action ?? ""}`}>
      {t.icon} {d.label}
    </span>
  );
}
