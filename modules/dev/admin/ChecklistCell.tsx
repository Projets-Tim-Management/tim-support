"use client";

/**
 * Colonne « Checklist » de la liste des features : « 3/7 » avec sa barre.
 *
 * La barre plutôt que le seul chiffre : en parcourant la liste, on cherche ce
 * qui traîne, et une proportion se compare d'un coup d'œil là où deux nombres
 * demandent un calcul.
 */
type Props = { cellData?: unknown };

export function ChecklistCell({ cellData }: Props) {
  const raw = typeof cellData === "string" ? cellData : "";
  const match = raw.match(/^(\d+)\/(\d+)$/);
  if (!match) return <span style={{ color: "var(--tim-muted)" }}>—</span>;

  const done = Number(match[1]);
  const total = Number(match[2]);
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <span className="dev-progress dev-progress--cell">
      <span className="dev-progress__bar">
        <span className="dev-progress__fill" style={{ width: `${pct}%` }} />
      </span>
      <span className="dev-progress__text">{raw}</span>
    </span>
  );
}
