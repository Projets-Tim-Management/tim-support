import type { Payload } from "payload";

import { payloadSuivi } from "@/modules/ads/agent/suivi-port";
import type { Id } from "@/modules/ads/agent/types";
import { ALERT_KINDS } from "@/modules/ads/lib/alerts";

/**
 * Ce que l'onglet « Agent » montre d'une campagne en ligne (plan, §9 nonies,
 * étape 7) — lu en base, rien n'est calculé ici que le rapport ne calcule déjà.
 */

const label = (kind: string) => ALERT_KINDS.find((k) => k.value === kind)?.label ?? kind;

export type FollowUpView = {
  enLigne: boolean;
  autonomie: string;
  semaine: { depenseEur: number; vuesPage: number; leadsSite: number; leadsQualifies: number; coutParLeadEur: number | null; tauxClicPct: number | null; depensePct: number | null; leadsPct: number | null } | null;
  alertes: { type: string; constat: string; depuis: string }[];
  test: { hypothese: string; ouEnEst: string | null } | null;
  bilans: { id: Id; rythme: string; le: string; statut: string; bilan: string | null; recommandations: string[] }[];
  questions: { id: Id; le: string; question: string; reponse: string | null }[];
};

export async function followUpView(payload: Payload, campaignId: Id): Promise<FollowUpView> {
  const c = (await payload.findByID({ collection: "ad-campaigns", id: campaignId, depth: 0, overrideAccess: true }).catch(() => null)) as { publicationStatus?: string | null; autonomy?: string | null } | null;
  const enLigne = c?.publicationStatus === "active";
  const [runs, questions] = await Promise.all([
    payload.find({ collection: "ad-agent-runs", where: { and: [{ campaign: { equals: campaignId } }, { kind: { in: ["quotidien", "hebdomadaire", "mensuel"] } }] }, sort: "-startedAt", limit: 5, depth: 0, overrideAccess: true }),
    payload.find({ collection: "ad-questions", where: { campaign: { equals: campaignId } }, sort: "-askedAt", limit: 5, depth: 0, overrideAccess: true }),
  ]);
  const ids = runs.docs.map((r) => r.id);
  const roots = ids.length ? await payload.find({ collection: "ad-agents", where: { and: [{ run: { in: ids } }, { depth: { equals: 0 } }] }, pagination: false, depth: 0, overrideAccess: true }) : { docs: [] };
  const resultOf = new Map((roots.docs as { run: Id | { id: Id }; result?: { donnees?: { recommandations?: unknown } } }[]).map((a) => [String(typeof a.run === "object" ? a.run.id : a.run), a.result]));

  let semaine: FollowUpView["semaine"] = null;
  let alertes: FollowUpView["alertes"] = [];
  let test: FollowUpView["test"] = null;
  if (enLigne) {
    const suivi = payloadSuivi(payload);
    const [r, tests] = await Promise.all([suivi.report(campaignId, 7), suivi.tests(campaignId)]);
    const t = r.totaux;
    semaine = { depenseEur: t.depenseEur, vuesPage: t.vuesPage, leadsSite: t.leadsSite, leadsQualifies: t.leadsQualifies, coutParLeadEur: t.coutParLeadEur, tauxClicPct: t.tauxClicPct, depensePct: r.tendances.depensePct, leadsPct: r.tendances.leadsPct };
    alertes = r.alertesOuvertes.map((a) => ({ type: label(a.type), constat: a.constat, depuis: a.depuis }));
    const open = tests.find((x) => x.etat === "en-cours" || x.etat === "en-attente-de-volume");
    test = open ? { hypothese: open.hypothese, ouEnEst: open.ouEnEst } : null;
  }
  return {
    enLigne,
    autonomie: c?.autonomy ?? "proposer",
    semaine,
    alertes,
    test,
    bilans: (runs.docs as { id: Id; kind: string; startedAt: string; status: string; summary?: string | null }[]).map((r) => {
      const recos = resultOf.get(String(r.id))?.donnees?.recommandations;
      return { id: r.id, rythme: r.kind, le: r.startedAt, statut: r.status, bilan: r.summary ?? null, recommandations: Array.isArray(recos) ? recos.map(String) : [] };
    }),
    questions: (questions.docs as { id: Id; askedAt: string; question: string; answer?: string | null }[]).map((q) => ({ id: q.id, le: q.askedAt, question: q.question, reponse: q.answer ?? null })),
  };
}
