import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { scoreTone } from "@/modules/partner/lib/signature-score";

/**
 * « 72 % · En phase de test · ACME +2 » : le % de signature, teinté selon sa
 * chaleur, puis le statut et l'entreprise qui le portent. Même pastille sur la
 * carte du Kanban, dans le tableau et sur la fiche — on la reconnaît partout.
 */
export function PotentialBadge({
  score,
  status,
  company,
  more = 0,
  compact = false,
}: {
  score: number;
  status?: string;
  company?: string;
  more?: number;
  compact?: boolean;
}) {
  const meta = clientStatusMeta(status);
  const who = [meta?.label, company ? `${company}${more > 0 ? ` +${more}` : ""}` : null].filter(Boolean).join(" · ");
  return (
    <span className="tim-potential" title={who || undefined}>
      <span className={`tim-potential__pct tim-potential__pct--${scoreTone(score)}`}>{score} %</span>
      {!compact && who ? <span className="tim-potential__who">{who}</span> : null}
    </span>
  );
}
