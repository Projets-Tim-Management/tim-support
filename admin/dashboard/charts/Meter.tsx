/**
 * Meter — job : une part contre un tout (ex. % d'avis « utile »).
 * Piste = teinte claire, remplissage = primary. Server component (statique).
 */
export default function Meter({
  pct,
  caption,
}: {
  pct: number | null;
  caption?: string;
}) {
  if (pct == null) return <p className="dash-empty">Pas encore de votes</p>;
  return (
    <div className="dash-meter">
      <div className="dash-meter__head">
        <span className="dash-meter__value">{pct}%</span>
        {caption && <span className="dash-meter__caption">{caption}</span>}
      </div>
      <div className="dash-meter__track" role="meter" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="dash-meter__fill" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
