"use client";

import { useDocumentInfo, useFormFields } from "@payloadcms/ui";

import { clientPhase } from "@/modules/partner/lib/clientStatus";
import { scoreTone, signatureScore } from "@/modules/partner/lib/signature-score";
import { useScoreSources } from "@/modules/partner/admin/useScoreSources";

/**
 * Le % de signature de l'opportunité, sous son statut : le chiffre, sa jauge,
 * et d'où il vient (« Démo programmée 25 % + 2 réunions = 33 % »). Il suit le
 * statut choisi dans le formulaire sans attendre l'enregistrement.
 *
 * Rien pour une affaire gagnée ou terminée : il n'y a plus rien à estimer.
 */
export function SignatureScoreBox() {
  const status = useFormFields(([f]) => (f.clientStatus?.value as string | undefined) ?? "nouvelle");
  const { id } = useDocumentInfo();
  const sources = useScoreSources(id != null ? [Number(id)] : []);
  const phase = clientPhase(status);
  if (phase === "client" || phase === "fin") return null;

  // Fiche pas encore créée : elle naît maintenant, donc pas « silencieuse ».
  const s = signatureScore(status, sources?.[0]?.activities ?? [], new Date(), sources?.[0]?.createdAt ?? new Date().toISOString());
  return (
    <div className="tim-score">
      <span className="tim-score__label">% de signature</span>
      <div className="tim-score__row">
        <strong className={`tim-score__value tim-potential__pct--${scoreTone(s.score)}`}>{sources ? `${s.score} %` : "…"}</strong>
        <span className="tim-score__bar" aria-hidden>
          <span className={`tim-score__fill tim-score__fill--${scoreTone(s.score)}`} style={{ width: `${s.score}%` }} />
        </span>
      </div>
      {sources ? <p className="tim-score__why">{s.explanation}</p> : null}
    </div>
  );
}
