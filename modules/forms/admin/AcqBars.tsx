import type { Row } from "@/modules/forms/lib/stats";

/**
 * Barres horizontales — comparer des grandeurs et les classer.
 *
 * Chaque ligne porte sa valeur ET sa part du total : « 3 » ne dit rien sans
 * savoir sur combien. Server component, aucun JS.
 */
export default function AcqBars({ rows, tone = "primary" }: { rows: Row[]; tone?: string }) {
  const total = rows.reduce((n, r) => n + r.value, 0);
  if (total === 0) return <p className="acq-none">Aucune donnée sur cette période</p>;
  const max = Math.max(...rows.map((r) => r.value), 1);

  return (
    <ul className="acq-bars">
      {rows.map((r) => (
        <li key={r.label} className="acq-bars__row">
          <span className="acq-bars__head">
            <span className="acq-bars__label" title={r.label}>
              {r.label}
            </span>
            <span className="acq-bars__value">
              {r.value}
              <span className="acq-bars__pct">{Math.round((r.value / total) * 100)} %</span>
            </span>
          </span>
          <span className="acq-bars__track">
            <span
              className="acq-bars__fill"
              style={{
                width: `${Math.max((r.value / max) * 100, 3)}%`,
                background: `var(--tim-${tone})`,
              }}
            />
          </span>
        </li>
      ))}
    </ul>
  );
}
