import Link from "next/link";
import type { ReactNode } from "react";

import { signed } from "./format";

/** Sparkline statique (SVG), teinte primary — pour la mini-tendance d'une tuile. */
function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null;
  const w = 96;
  const h = 26;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const step = w / (data.length - 1);
  const pts = data.map((v, i) => [i * step, h - ((v - min) / span) * (h - 4) - 2] as const);
  const line = pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const area = `0,${h} ${line} ${w},${h}`;
  return (
    <svg className="dash-tile__spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden>
      <polygon points={area} className="dash-tile__spark-fill" />
      <polyline points={line} className="dash-tile__spark-line" />
    </svg>
  );
}

interface Props {
  icon: ReactNode;
  label: string;
  value: string;
  sub?: string;
  href?: string;
  /** Accent visuel : neutre, primary, attention (ambre), danger (rouge). */
  tone?: "default" | "accent" | "warn" | "danger";
  delta?: number;
  /** true : hausse = bien (vert) ; false : hausse = mauvais (rouge). */
  goodWhenUp?: boolean;
  sparkline?: number[];
}

/**
 * KPI card : icône + libellé + valeur (+ delta, sous-texte, sparkline).
 * Cliquable vers la vue filtrée si `href`. Server component (aucun JS).
 */
export default function StatTile({
  icon,
  label,
  value,
  sub,
  href,
  tone = "default",
  delta,
  goodWhenUp = true,
  sparkline,
}: Props) {
  const deltaClass =
    delta == null || delta === 0
      ? "dash-tile__delta--flat"
      : delta > 0 === goodWhenUp
        ? "dash-tile__delta--good"
        : "dash-tile__delta--bad";

  const body = (
    <>
      <div className="dash-tile__head">
        <span className="dash-tile__icon" aria-hidden>
          {icon}
        </span>
        <span className="dash-tile__label">{label}</span>
      </div>
      <div className="dash-tile__value-row">
        <span className="dash-tile__value">{value}</span>
        {delta != null && (
          <span className={`dash-tile__delta ${deltaClass}`} title="Évolution vs 30 jours précédents">
            {signed(delta)}
          </span>
        )}
      </div>
      {sub && <span className="dash-tile__sub">{sub}</span>}
      {sparkline && sparkline.length > 1 && <Sparkline data={sparkline} />}
    </>
  );

  const className = `dash-tile dash-tile--${tone}${href ? " dash-tile--link" : ""}`;

  return href ? (
    <Link href={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
