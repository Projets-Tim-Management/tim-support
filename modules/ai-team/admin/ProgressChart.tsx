"use client";

import { useState } from "react";

/**
 * La courbe de progression d'un agent (B3) : son score de maîtrise (sur 100)
 * à chaque photo du lundi, avec la maîtrise complète en ligne de référence —
 * ou un montant, avec un repère du marché ; lignes étiquetées directement. Une seule série : pas de légende, le titre la
 * nomme. Survol (ou clavier) : la semaine et la valeur exactes.
 */
export type ChartPoint = { week: string; value: number };

const W = 640;
const H = 190;
const PAD = { top: 16, right: 132, bottom: 26, left: 48 };

const fmt = (v: number, unit: string) =>
  unit === "pts" ? `${Math.round(v)}/100` : unit === "%" ? `${v.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %` : v.toLocaleString("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const weekFr = (w: string) => new Date(`${w}T12:00:00Z`).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: "UTC" });

export function ProgressChart({ points, unit, target, benchmark, label }: { points: ChartPoint[]; unit: string; target: number | null; benchmark: number | null; label: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const refs = [target, benchmark].filter((x): x is number => x != null);
  const values = [...points.map((p) => p.value), ...refs];
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || Math.max(1, hi * 0.2);
  // Un score se lit toujours sur 0–100 : la distance à la maîtrise complète reste juste.
  const yMin = unit === "pts" ? 0 : Math.max(0, lo - span * 0.15);
  const yMax = unit === "pts" ? 100 : hi + span * 0.15;
  const x = (i: number) => PAD.left + (points.length > 1 ? (i / (points.length - 1)) * (W - PAD.left - PAD.right) : (W - PAD.left - PAD.right) / 2);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const ticks = [yMin, (yMin + yMax) / 2, yMax];
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const h = hover != null ? points[hover] : null;

  return (
    <figure className="ait-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${label} : ${points.map((p) => `${weekFr(p.week)} ${fmt(p.value, unit)}`).join(", ")}`} onMouseLeave={() => setHover(null)}>
        {ticks.map((t) => (
          <g key={t}>
            <line className="ait-chart__grid" x1={PAD.left} x2={W - PAD.right} y1={y(t)} y2={y(t)} />
            <text className="ait-chart__tick" x={PAD.left - 6} y={y(t) + 4} textAnchor="end">
              {fmt(t, unit)}
            </text>
          </g>
        ))}
        {benchmark != null && (
          <g>
            <line className="ait-chart__ref ait-chart__ref--bench" x1={PAD.left} x2={W - PAD.right} y1={y(benchmark)} y2={y(benchmark)} />
            <text className="ait-chart__reflabel" x={W - PAD.right + 6} y={y(benchmark) + 4}>
              Marché {fmt(benchmark, unit)}
            </text>
          </g>
        )}
        {target != null && (
          <g>
            <line className="ait-chart__ref ait-chart__ref--target" x1={PAD.left} x2={W - PAD.right} y1={y(target)} y2={y(target)} />
            <text className="ait-chart__reflabel ait-chart__reflabel--target" x={W - PAD.right + 6} y={y(target) + (benchmark != null && Math.abs(y(target) - y(benchmark)) < 14 ? (y(target) < y(benchmark) ? -4 : 12) : 4)}>
              {unit === "pts" ? "Maîtrise complète" : `Votre cible ${fmt(target, unit)}`}
            </text>
          </g>
        )}
        {points.length > 1 && <path className="ait-chart__line" d={path} />}
        {h && <line className="ait-chart__cross" x1={x(hover!)} x2={x(hover!)} y1={PAD.top} y2={H - PAD.bottom} />}
        {points.map((p, i) => (
          <g key={p.week}>
            <circle className={`ait-chart__dot${hover === i ? " ait-chart__dot--on" : ""}`} cx={x(i)} cy={y(p.value)} r={hover === i ? 5 : 4} />
            {/* Cible de survol plus large que le point. */}
            <rect
              className="ait-chart__hit"
              x={x(i) - Math.max(10, (W - PAD.left - PAD.right) / Math.max(2, points.length) / 2)}
              y={PAD.top}
              width={Math.max(20, (W - PAD.left - PAD.right) / Math.max(2, points.length))}
              height={H - PAD.top - PAD.bottom}
              tabIndex={0}
              aria-label={`Semaine du ${weekFr(p.week)} : ${fmt(p.value, unit)}`}
              onMouseEnter={() => setHover(i)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
            />
          </g>
        ))}
        {points.length > 0 && (
          <>
            <text className="ait-chart__tick" x={x(0)} y={H - 6} textAnchor={points.length > 1 ? "start" : "middle"}>
              {weekFr(points[0].week)}
            </text>
            {points.length > 1 && (
              <text className="ait-chart__tick" x={x(points.length - 1)} y={H - 6} textAnchor="end">
                {weekFr(points[points.length - 1].week)}
              </text>
            )}
            <text className="ait-chart__last" x={x(points.length - 1) + 8} y={y(points[points.length - 1].value) - 8}>
              {fmt(points[points.length - 1].value, unit)}
            </text>
          </>
        )}
      </svg>
      {h && (
        <div className="ait-chart__tip" style={{ left: `${(x(hover!) / W) * 100}%` }} role="status">
          <span>Semaine du {weekFr(h.week)}</span>
          <strong>{fmt(h.value, unit)}</strong>
        </div>
      )}
    </figure>
  );
}
