"use client";

import { toast } from "@payloadcms/ui";
import { useCallback, useEffect, useState } from "react";

import type { FollowUpView } from "@/modules/ads/agent/followup-view";

import { eur } from "./format";
import { postAdmin } from "./post-admin";

/**
 * Le suivi d'une campagne EN LIGNE, en tête de l'onglet « Agent » (plan
 * Publicité, §9 nonies, étape 7) : qui passe et quand, les chiffres de la
 * semaine, ce qui alerte, le test en cours, ce que l'analyste a dit — et une
 * question à lui poser. Rien à lancer à la main : les passages sont seuls.
 */

const RYTHME: Record<string, string> = { quotidien: "Suivi (tous les 2 jours)", hebdomadaire: "Lundi", mensuel: "Bilan du mois" };
const AUTONOMIE: Record<string, string> = {
  autonome: "Autonome : il ajuste budgets et pauses seul, dans les garde-fous ; le reste passe par « À valider ».",
  proposer: "Proposer : chaque action attend votre validation dans « À valider ».",
  observer: "Observer : il rapporte, il n'agit pas.",
};
const when = (iso: string) => new Date(iso).toLocaleString("fr-FR", { timeZone: "Europe/Paris", weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const trend = (n: number | null) => (n == null ? null : `${n > 0 ? "+" : ""}${n} % sur 7 j`);

export function FollowUpPanel({ campaignId }: { campaignId: string }) {
  const [view, setView] = useState<FollowUpView | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const url = `/api/admin/ads/campaigns/${encodeURIComponent(campaignId)}/suivi`;

  const load = useCallback(() => {
    fetch(url, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: FollowUpView | null) => setView(d))
      .catch(() => null);
  }, [url]);
  useEffect(load, [load]);

  if (!view?.enLigne) return null;

  const ask = async () => {
    setAsking(true);
    try {
      await postAdmin(url, { question });
      setQuestion("");
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setAsking(false);
    }
  };
  const s = view.semaine;
  const last = view.bilans[0];

  return (
    <section className="ads-gen ads-followup">
      <div className="ads-gen__head">
        <strong>Suivi de la campagne en ligne</strong>
        <span>
          L&apos;analyste passe seul : tous les 2 jours à 7 h (il lit et prévient), le lundi à 8 h (il décide), le premier lundi du mois à 9 h (bilan). {AUTONOMIE[view.autonomie] ?? view.autonomie}
        </span>
      </div>

      {s && (
        <div className="ads-results__kpis">
          <div>
            <span>Dépense, 7 jours</span>
            <strong>{eur(s.depenseEur)}</strong>
            {trend(s.depensePct) && <small>{trend(s.depensePct)}</small>}
          </div>
          <div>
            <span>Vues de la page</span>
            <strong>{s.vuesPage}</strong>
          </div>
          <div>
            <span>Leads du site</span>
            <strong>{s.leadsSite}</strong>
            <small>dont {s.leadsQualifies} qualifié(s)</small>
          </div>
          <div>
            <span>Coût par lead</span>
            <strong>{s.coutParLeadEur == null ? "—" : eur(s.coutParLeadEur)}</strong>
          </div>
          <div>
            <span>Taux de clic</span>
            <strong>{s.tauxClicPct == null ? "—" : `${s.tauxClicPct.toLocaleString("fr-FR")} %`}</strong>
          </div>
        </div>
      )}

      {(view.alertes.length > 0 || view.test) && (
        <ul className="ads-gen__facts">
          {view.alertes.map((a) => (
            <li key={`${a.type}-${a.depuis}`} className="ads-gen__bad">
              <strong>{a.type}</strong> (depuis le {new Date(a.depuis).toLocaleDateString("fr-FR")}) : {a.constat}
            </li>
          ))}
          {view.test && (
            <li>
              Test en cours : « {view.test.hypothese} » — {view.test.ouEnEst ?? "en attente"}.
            </li>
          )}
        </ul>
      )}

      {last ? (
        <div className="ads-followup__last">
          <p className="ads-followup__meta">
            Dernier passage : {RYTHME[last.rythme] ?? last.rythme}, {when(last.le)}
          </p>
          {last.bilan ? <p className="ads-followup__summary">{last.bilan}</p> : <p className="ads-followup__meta">En cours…</p>}
          {last.recommandations.length > 0 && (
            <ul className="ads-followup__recos">
              {last.recommandations.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="ads-followup__meta">Premier passage au prochain 7 h.</p>
      )}

      <div className="ads-followup__ask">
        <label className="ads-agent__objective-field">
          Poser une question à l&apos;agent
          <textarea rows={2} value={question} onChange={(e) => setQuestion(e.target.value)} disabled={asking} placeholder="Pourquoi Meta ne diffuse presque plus C17 ? Que ferais-tu de la page d'arrivée ?" />
        </label>
        <button type="button" className="tim-btn tim-btn--primary" disabled={asking || !question.trim()} onClick={ask}>
          {asking ? "L'agent réfléchit…" : "Demander"}
        </button>
      </div>
      {view.questions.length > 0 && (
        <ol className="ads-followup__qa">
          {view.questions.map((q) => (
            <li key={String(q.id)}>
              <p className="ads-followup__q">
                {q.question} <span className="ads-followup__meta">— {when(q.le)}</span>
              </p>
              <p className="ads-followup__a">{q.reponse ?? "—"}</p>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
