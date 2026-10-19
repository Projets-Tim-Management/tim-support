import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { scoreTone } from "@/modules/partner/lib/signature-score";

/**
 * « 72 % · En phase de test » : le % de signature, teinté selon sa chaleur,
 * puis le statut qui le porte. Les entreprises ne sont pas répétées — la carte
 * les montre déjà ; elles viennent au survol du % (`tip`). Même pastille sur
 * la carte du Kanban, dans le tableau et sur la fiche.
 */
export function PotentialBadge({ score, status, tip }: { score: number; status?: string; tip?: string }) {
  const meta = clientStatusMeta(status);
  return (
    <span className="tim-potential">
      <span className={`tim-potential__pct tim-potential__pct--${scoreTone(score)}${tip ? " dev-tip" : ""}`} data-tip={tip || undefined}>
        {score} %
      </span>
      {meta ? <span className="tim-potential__who">{meta.label}</span> : null}
    </span>
  );
}
