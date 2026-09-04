export interface Segment {
  label: string;
  value: number;
  /** Jeton de couleur, ex. « var(--tim-green) ». */
  color: string;
}

/**
 * Barre segmentée — une part-à-tout qui tient sur une ligne.
 *
 * Préférée au donut quand les segments se lisent comme une PROPORTION d'un même
 * ensemble (la preuve d'attribution, le devenir des opportunités) : l'œil compare
 * des longueurs bien mieux que des angles.
 *
 * La légende porte toujours le libellé : l'identité ne passe jamais par la seule
 * couleur.
 */
export default function AcqSegments({ segments }: { segments: Segment[] }) {
  const total = segments.reduce((n, s) => n + s.value, 0);
  if (total === 0) return <p className="acq-none">Aucune donnée sur cette période</p>;

  return (
    <div className="acq-seg">
      <div className="acq-seg__bar" role="img" aria-label={segments.map((s) => `${s.label} : ${s.value}`).join(", ")}>
        {segments
          .filter((s) => s.value > 0)
          .map((s) => (
            <span
              key={s.label}
              className="acq-seg__part"
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
              title={`${s.label} — ${s.value}`}
            />
          ))}
      </div>
      <ul className="acq-seg__legend">
        {segments.map((s) => (
          <li key={s.label} className="acq-seg__key">
            <span className="acq-seg__dot" style={{ background: s.color }} aria-hidden />
            <span className="acq-seg__key-label">{s.label}</span>
            <span className="acq-seg__key-val">
              {s.value}
              <span className="acq-seg__key-pct">{Math.round((s.value / total) * 100)} %</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
