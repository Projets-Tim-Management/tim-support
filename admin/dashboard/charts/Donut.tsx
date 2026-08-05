"use client";

import { useState } from "react";

interface Slice {
  key: string;
  label: string;
  count: number;
  color: string; // ex. "var(--tim-blue)"
}

const R = 52;
const RIN = 32;
const C = 60;
const GAP = 0.03; // ~2px de respiration entre segments (radians)

function polar(angle: number, r: number) {
  return [C + r * Math.cos(angle), C + r * Math.sin(angle)] as const;
}

function segPath(a0: number, a1: number) {
  const [x0, y0] = polar(a0, R);
  const [x1, y1] = polar(a1, R);
  const [x2, y2] = polar(a1, RIN);
  const [x3, y3] = polar(a0, RIN);
  const large = a1 - a0 > Math.PI ? 1 : 0;
  return `M${x0} ${y0} A${R} ${R} 0 ${large} 1 ${x1} ${y1} L${x2} ${y2} A${RIN} ${RIN} 0 ${large} 0 ${x3} ${y3} Z`;
}

/** Donut — job : part-à-tout (répartition par statut). Légende toujours présente
 *  (identité jamais par la couleur seule) + tooltip par segment au survol. */
export default function Donut({ slices, centerLabel }: { slices: Slice[]; centerLabel?: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = slices.reduce((s, x) => s + x.count, 0);
  if (total === 0) return <p className="dash-empty">Aucune donnée</p>;

  // Angles cumulés, calculés par `reduce` : chaque segment démarre là où le
  // précédent s'arrête. Une variable mutée dans un `map` ferait le même calcul,
  // mais muter pendant le rendu est ce que le compilateur React proscrit.
  const arcs = slices.reduce<{ a0: number; a1: number; frac: number; start: number }[]>((acc, s) => {
    const start = acc.length > 0 ? acc[acc.length - 1].start : -Math.PI / 2;
    const frac = s.count / total;
    const gap = s.count > 0 ? GAP / 2 : 0;
    const a0 = start + gap;
    const a1 = start + frac * Math.PI * 2 - gap;
    acc.push({ a0: Math.min(a0, a1), a1: Math.max(a0, a1), frac, start: start + frac * Math.PI * 2 });
    return acc;
  }, []);

  return (
    <div className="dash-donut">
      <svg viewBox="0 0 120 120" className="dash-donut__svg" role="img">
        {slices.map((s, i) =>
          s.count > 0 ? (
            <path
              key={s.key}
              d={segPath(arcs[i].a0, arcs[i].a1)}
              style={{ fill: s.color }}
              className={`dash-donut__seg${hover === i ? " is-hover" : ""}`}
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
            />
          ) : null,
        )}
        <text x={C} y={C - 4} className="dash-donut__total">
          {hover != null ? slices[hover].count : total}
        </text>
        <text x={C} y={C + 12} className="dash-donut__caption">
          {hover != null ? `${Math.round(arcs[hover].frac * 100)}%` : centerLabel ?? "total"}
        </text>
      </svg>
      <ul className="dash-donut__legend">
        {slices.map((s, i) => (
          <li
            key={s.key}
            className={`dash-donut__key${hover === i ? " is-hover" : ""}`}
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <span className="dash-donut__dot" style={{ background: s.color }} aria-hidden />
            <span className="dash-donut__key-label">{s.label}</span>
            <span className="dash-donut__key-val">{s.count}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
