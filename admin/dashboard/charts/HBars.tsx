/**
 * Barres horizontales — job : comparer des magnitudes / classement.
 * Une seule teinte (primary, séquentielle par valeur), label direct à la valeur
 * → pas de tooltip nécessaire, donc server component (zéro JS).
 */
export default function HBars({
  rows,
  format = (v) => String(v),
}: {
  rows: Array<{ label: string; value: number }>;
  format?: (v: number) => string;
}) {
  if (rows.length === 0) return <p className="dash-empty">Rien à afficher</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <ul className="dash-bars">
      {rows.map((r) => (
        <li key={r.label} className="dash-bars__row">
          <span className="dash-bars__label" title={r.label}>
            {r.label}
          </span>
          <span className="dash-bars__track">
            <span className="dash-bars__fill" style={{ width: `${Math.max((r.value / max) * 100, 2)}%` }} />
          </span>
          <span className="dash-bars__value">{format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}
