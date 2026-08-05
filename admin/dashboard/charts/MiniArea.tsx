"use client";

import { useRef, useState } from "react";

interface Point {
  day: string;
  count: number;
  /** Libellé de l'abscisse (défaut : la date au jour). */
  label?: string;
  /** Valeur déjà formatée pour le tooltip (défaut : le nombre brut). */
  valueLabel?: string;
}

/** Courbe d'aire (1 série, teinte primary) avec crosshair + tooltip au survol.
 *  Job : évolution dans le temps. viewBox fixe, largeur 100% (responsive).
 *
 *  Pour afficher autre chose qu'un compte journalier (ex. un montant en € par
 *  mois), l'appelant fournit `label` / `valueLabel` DÉJÀ formatés sur chaque
 *  point : ce composant est client, et React interdit de lui passer une fonction
 *  de formatage depuis un server component. */
export default function MiniArea({ data, unit = "" }: { data: Point[]; unit?: string }) {
  const ref = useRef<SVGSVGElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  const W = 320;
  const H = 96;
  const padY = 10;
  if (data.length < 2) return <p className="dash-empty">Pas encore de données</p>;

  const max = Math.max(...data.map((d) => d.count), 1);
  const step = W / (data.length - 1);
  const y = (v: number) => H - padY - (v / max) * (H - padY * 2);
  const pts = data.map((d, i) => [i * step, y(d.count)] as const);
  const line = pts.map(([x, yy]) => `${x.toFixed(1)},${yy.toFixed(1)}`).join(" ");
  const area = `0,${H} ${line} ${W},${H}`;

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const frac = (e.clientX - rect.left) / rect.width;
    setHover(Math.max(0, Math.min(data.length - 1, Math.round(frac * (data.length - 1)))));
  };

  const fmtDay = (p: Point) =>
    p.label ?? new Date(p.day).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });

  const hx = hover != null ? pts[hover][0] : 0;

  return (
    <div className="dash-chart">
      <svg
        ref={ref}
        className="dash-area"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        role="img"
      >
        <line x1="0" y1={y(max)} x2={W} y2={y(max)} className="dash-grid" />
        <line x1="0" y1={y(0)} x2={W} y2={y(0)} className="dash-grid" />
        <polygon points={area} className="dash-area__fill" />
        <polyline points={line} className="dash-area__line" />
        {hover != null && (
          <>
            <line x1={hx} y1={padY} x2={hx} y2={H} className="dash-crosshair" />
            <circle cx={hx} cy={pts[hover][1]} r="3.5" className="dash-area__dot" />
          </>
        )}
      </svg>
      <div className="dash-area__axis">
        <span>{fmtDay(data[0])}</span>
        <span>{fmtDay(data[data.length - 1])}</span>
      </div>
      {hover != null && (
        <div className="dash-tooltip" style={{ left: `${(hx / W) * 100}%` }}>
          <strong>{data[hover].valueLabel ?? data[hover].count}</strong>
          {unit ? ` ${unit}` : ""} · {fmtDay(data[hover])}
        </div>
      )}
    </div>
  );
}
