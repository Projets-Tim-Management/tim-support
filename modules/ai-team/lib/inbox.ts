import type { Payload } from "payload";

import { idOf } from "@/core/lib/relations";
import { decisionSummary } from "@/modules/ads/agent/control-room";
import { cleanSteps, type RequestKind } from "@/modules/ai-team/lib/requests";

/**
 * « Vos demandes », en tête de la page Équipe IA : tout ce qui attend la
 * direction, au même endroit et sous les deux mêmes formes.
 *
 *  - les demandes que les chefs ont déposées (ai-team-requests) ;
 *  - ce qui attend dans « À valider », présenté en « à faire » avec le lien et
 *    les étapes — créas à décider, actions proposées sur les campagnes en
 *    ligne. Ces lignes-là se ferment en décidant dans « À valider ».
 *
 * Et clore une demande : « C'est fait » (à faire), une réponse (question), ou
 * la retirer. Les règles de clôture sont pures (testées).
 */

type Raw = Record<string, unknown>;

export type InboxItem = {
  id: string;
  /** Une demande déposée par un chef (on la clôt ici) ou un rappel de « À valider » (on décide là-bas). */
  source: "chef" | "a-valider";
  memberKey: string | null;
  kind: RequestKind;
  title: string;
  why: string;
  url: string | null;
  steps: string[];
  question: string | null;
  at: string;
  campaign: string | null;
};

export type ClosedItem = { id: string; memberKey: string | null; kind: RequestKind; title: string; status: string; answer: string | null; at: string | null };

const A_VALIDER = "/admin/publicite/a-valider";

export function buildInbox(input: { requests: Raw[]; members: Raw[]; campaigns: Raw[]; pendingCreatives: Raw[]; proposedActions: Raw[] }): { open: InboxItem[]; closed: ClosedItem[] } {
  const keyOf = new Map(input.members.map((m) => [String(m.id), String(m.key)]));
  const analystRaw = input.members.find((m) => ((m.engineRoles as string[] | undefined) ?? []).includes("analyste"));
  // La direction ne parle qu'aux chefs : ce que propose l'analyste (Camille) remonte par son chef.
  const analystChief = analystRaw?.chief ? input.members.find((m) => String(m.id) === String(idOf(analystRaw.chief))) : null;
  const analyst = analystChief ?? analystRaw;
  const analystVia = analystChief && analystRaw ? `${analystRaw.name} (${analystRaw.jobTitle})` : null;
  const orchestrator = input.members.find((m) => ((m.engineRoles as string[] | undefined) ?? []).includes("orchestrateur"));
  const camp = new Map(input.campaigns.map((c) => [String(c.id), String(c.name ?? "—")]));

  const open: InboxItem[] = input.requests
    .filter((r) => r.status === "ouverte")
    .map((r) => ({
      id: `r-${r.id}`,
      source: "chef",
      memberKey: keyOf.get(String(idOf(r.member))) ?? null,
      kind: r.kind === "question" ? "question" : "a-faire",
      title: String(r.title),
      why: String(r.why ?? ""),
      url: (r.url as string | null) ?? null,
      steps: cleanSteps(r.steps),
      question: (r.question as string | null) ?? null,
      at: String(r.createdAt),
      campaign: r.campaign ? (camp.get(String(idOf(r.campaign))) ?? null) : null,
    }));

  // Les créas à décider, regroupées par campagne : une demande par campagne.
  const byCampaign = new Map<string, number>();
  for (const c of input.pendingCreatives) {
    const k = String(idOf(c.campaign) ?? "");
    byCampaign.set(k, (byCampaign.get(k) ?? 0) + 1);
  }
  for (const [k, n] of byCampaign) {
    open.push({
      id: `creas-${k}`,
      source: "a-valider",
      memberKey: orchestrator ? String(orchestrator.key) : null,
      kind: "a-faire",
      title: `Décider de ${n} créa${n > 1 ? "s" : ""}${camp.get(k) ? ` — ${camp.get(k)}` : ""}`,
      why: "L'équipe a préparé ces créas ; rien ne part chez Meta sans votre décision.",
      url: `${A_VALIDER}${k ? `?campagne=${k}` : ""}`,
      steps: ["Ouvrez « À valider ».", "Pour chaque créa, regardez le visuel et les textes.", "Cliquez « Valider », ou « Refuser » en donnant le motif : l'équipe en tirera une consigne."],
      question: null,
      at: String(input.pendingCreatives.find((c) => String(idOf(c.campaign) ?? "") === k)?.createdAt ?? new Date(0).toISOString()),
      campaign: camp.get(k) ?? null,
    });
  }

  // Les actions proposées sur les campagnes en ligne (budget, pause, réactivation) : une demande chacune.
  for (const d of input.proposedActions) {
    const summary = decisionSummary(String(d.kind), d.after) ?? String(d.kind);
    open.push({
      id: `action-${d.id}`,
      source: "a-valider",
      memberKey: analyst ? String(analyst.key) : null,
      kind: "a-faire",
      title: summary.length > 110 ? `${summary.slice(0, 109)}…` : summary,
      why: `${analystVia ? `Soulevé par ${analystVia} : ` : ""}${String(d.rationale ?? "Proposition de suivi.")}`,
      url: A_VALIDER,
      steps: ["Ouvrez « À valider », section des actions sur les campagnes en ligne.", "Lisez la justification et les chiffres.", "Cliquez « Valider » pour l'appliquer chez Meta (les garde-fous sont revérifiés), ou « Refuser »."],
      question: null,
      at: String(d.createdAt),
      campaign: camp.get(String(idOf(d.campaign) ?? "")) ?? null,
    });
  }

  open.sort((a, b) => b.at.localeCompare(a.at));
  const closed: ClosedItem[] = input.requests
    .filter((r) => r.status === "faite" || r.status === "repondue")
    .slice(0, 6)
    .map((r) => ({
      id: `r-${r.id}`,
      memberKey: keyOf.get(String(idOf(r.member))) ?? null,
      kind: r.kind === "question" ? "question" : "a-faire",
      title: String(r.title),
      status: String(r.status),
      answer: (r.answer as string | null) ?? null,
      at: (r.closedAt as string | null) ?? null,
    }));
  return { open, closed };
}

export async function loadInbox(payload: Payload) {
  const common = { pagination: false, depth: 0, overrideAccess: true } as const;
  const [requests, members, campaigns, creatives, actions] = await Promise.all([
    payload.find({ collection: "ai-team-requests", sort: "-createdAt", limit: 60, depth: 0, overrideAccess: true }),
    payload.find({ collection: "ai-team-members", ...common, select: { key: true, engineRoles: true, chief: true, name: true, jobTitle: true } as never }),
    payload.find({ collection: "ad-campaigns", ...common, select: { name: true } as never }),
    payload.find({ collection: "ad-creatives", where: { status: { equals: "a-valider" } }, ...common, select: { campaign: true, createdAt: true } as never }),
    payload.find({ collection: "ad-decisions", where: { and: [{ status: { equals: "proposee" } }, { kind: { in: ["budget", "pause", "activation"] } }] }, ...common }),
  ]);
  return buildInbox({
    requests: requests.docs as unknown as Raw[],
    members: members.docs as unknown as Raw[],
    campaigns: campaigns.docs as unknown as Raw[],
    pendingCreatives: creatives.docs as unknown as Raw[],
    proposedActions: actions.docs as unknown as Raw[],
  });
}

/** Ce que la direction fait d'une demande : la nouvelle valeur, ou la raison du refus. Pure (testée). */
export function closeRequest(req: { kind: string; status: string }, action: string, text: string): { ok: true; status: "faite" | "repondue" | "retiree"; answer: string | null } | { ok: false; reason: string } {
  if (req.status !== "ouverte") return { ok: false, reason: "Cette demande est déjà close." };
  const t = text.trim();
  if (t.length > 2000) return { ok: false, reason: "2 000 caractères au plus." };
  if (action === "retirer") return { ok: true, status: "retiree", answer: t || null };
  if (action === "fait") {
    if (req.kind !== "a-faire") return { ok: false, reason: "Une question attend une réponse, pas « C'est fait »." };
    return { ok: true, status: "faite", answer: t || null };
  }
  if (action === "repondre") {
    if (req.kind !== "question") return { ok: false, reason: "Cette demande n'est pas une question." };
    if (!t) return { ok: false, reason: "Écrivez votre réponse." };
    return { ok: true, status: "repondue", answer: t };
  }
  return { ok: false, reason: "Action inconnue." };
}
