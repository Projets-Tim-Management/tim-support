"use client";

import { useFormFields } from "@payloadcms/ui";

import { relId, rankRequesters, type Requester } from "@/modules/dev/lib/potential-shared";
import { clientStatusMeta } from "@/modules/partner/lib/clientStatus";
import { scoreTone, signatureScore } from "@/modules/partner/lib/signature-score";
import { useScoreSources } from "@/modules/partner/admin/useScoreSources";

/**
 * Sous « Demandé par » : où en est chaque entreprise qui attend ce
 * développement — son statut et son % de signature, la plus chaude d'abord.
 * Le potentiel du développement est celui de la première ligne.
 */
export function DevRequesters() {
  const raw = useFormFields(([f]) => f.opportunities?.value);
  const ids = (Array.isArray(raw) ? raw : raw == null ? [] : [raw]).map(relId).filter((id): id is number => id != null);
  const sources = useScoreSources(ids);
  if (!ids.length) return null;
  if (!sources) return <p className="tim-requesters__empty">Calcul du potentiel…</p>;

  const now = new Date();
  const list: Requester[] = rankRequesters(
    sources.map((c) => {
      const s = signatureScore(c.status, c.activities, now, c.createdAt);
      return { id: c.id, company: c.company, status: c.status, score: s.score, explanation: s.explanation };
    }),
  );
  return (
    <div className="tim-requesters">
      <span className="tim-score__label">Potentiel · {list[0] ? `${list[0].score} %` : "—"}</span>
      <ul className="tim-requesters__list">
        {list.map((r) => {
          const meta = clientStatusMeta(r.status);
          return (
            <li key={r.id} className="tim-requesters__row" title={r.explanation}>
              <a href={`/admin/collections/partner-clients/${r.id}`} className="tim-requesters__name">
                {r.company}
              </a>
              <span className="tim-requesters__status" style={{ color: meta?.color }}>
                {meta?.label ?? r.status}
              </span>
              <span className={`tim-potential__pct tim-potential__pct--${scoreTone(r.score)}`}>{r.score} %</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
