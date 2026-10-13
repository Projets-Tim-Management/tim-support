import type { Payload } from "payload";

import { decisionSummary } from "@/modules/ads/agent/control-room";
import type { Id } from "@/modules/ads/agent/types";
import { parisStart, spendFilter, spentOf } from "@/modules/ads/lib/spend";

/**
 * Les agents vus d'en haut (plan Publicité, §9 quater, point 4 ; commit 8) :
 *
 * - au tableau de bord, une carte « Agents » : chaque campagne avec son passage
 *   en cours ou le dernier, ses agents actifs, et le coût IA du jour, par
 *   campagne et au total face au plafond global ;
 * - dans « À valider », une carte « Proposition de l'agent » par passage
 *   terminé : positionnement, audiences, répartition du budget, et le chemin
 *   vers sa salle de contrôle.
 */

type Raw = Record<string, unknown>;
const ACTIVE = ["en-cours", "en-pause-budget"];
const idOf = (v: unknown): Id | null => (v && typeof v === "object" ? (v as { id: Id }).id : ((v as Id | null) ?? null));
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
const r2 = (n: number) => Math.round(n * 100) / 100;

export type AgentsOverview = {
  jour: { depense: number; plafond: number };
  campagnes: { id: Id; nom: string; statut: string; enCours: boolean; agentsActifs: number; depensePassage: number; budgetPassage: number; coutJour: number; le: string }[];
};

/** Pure. `runs` du plus récent au plus ancien ; seul le dernier passage de chaque campagne compte. */
export function buildAgentsOverview(input: { runs: Raw[]; agents: Raw[]; usageToday: Raw[]; campaigns: Raw[]; spentDay: number; capDay: number }): AgentsOverview {
  const names = new Map(input.campaigns.map((c) => [String(c.id), String(c.name ?? "—")]));
  const today = new Map<string, number>();
  for (const u of input.usageToday) {
    const k = String(idOf(u.campaign) ?? "");
    today.set(k, (today.get(k) ?? 0) + num(u.eur));
  }
  const latest = new Map<string, Raw>();
  for (const r of input.runs) {
    const k = String(idOf(r.campaign));
    if (!latest.has(k)) latest.set(k, r);
  }
  const campagnes = [...latest.entries()].map(([k, r]) => ({
    id: idOf(r.campaign) as Id,
    nom: names.get(k) ?? "—",
    statut: String(r.status),
    enCours: ACTIVE.includes(String(r.status)),
    agentsActifs: input.agents.filter((a) => String(idOf(a.run)) === String(r.id) && (a.status === "en-cours" || a.status === "en-attente")).length,
    depensePassage: r2(num(r.costEur)),
    budgetPassage: num(r.budgetEur),
    coutJour: r2(today.get(k) ?? 0),
    le: String(r.startedAt),
  }));
  // Ce qui tourne d'abord, puis le plus récent.
  campagnes.sort((a, b) => Number(b.enCours) - Number(a.enCours) || b.le.localeCompare(a.le));
  return { jour: { depense: r2(input.spentDay), plafond: input.capDay }, campagnes };
}

export async function agentsOverview(payload: Payload, now = new Date()): Promise<AgentsOverview> {
  const common = { depth: 0, overrideAccess: true, pagination: false } as const;
  const runs = await payload.find({ collection: "ad-agent-runs", sort: "-startedAt", ...common, select: { campaign: true, status: true, costEur: true, budgetEur: true, startedAt: true } as never });
  const active = (runs.docs as unknown as Raw[]).filter((r) => ACTIVE.includes(String(r.status))).map((r) => r.id as Id);
  const [agents, usage, campaigns, spent, settings] = await Promise.all([
    active.length ? payload.find({ collection: "ad-agents", where: { run: { in: active } }, ...common, select: { run: true, status: true } as never }) : Promise.resolve({ docs: [] }),
    payload.find({ collection: "ad-ai-usage", where: { and: [spendFilter("agent"), { createdAt: { greater_than_equal: parisStart(now, "day").toISOString() } }] }, ...common, select: { campaign: true, eur: true } as never }),
    payload.find({ collection: "ad-campaigns", ...common, select: { name: true } as never }),
    spentOf(payload, "agent", now),
    payload.findGlobal({ slug: "ads-settings", overrideAccess: true }) as Promise<{ agentDailyEur?: number | null }>,
  ]);
  return buildAgentsOverview({
    runs: runs.docs as unknown as Raw[],
    agents: agents.docs as unknown as Raw[],
    usageToday: usage.docs as unknown as Raw[],
    campaigns: campaigns.docs as unknown as Raw[],
    spentDay: spent.day,
    capDay: settings.agentDailyEur ?? 15,
  });
}

export type AgentProposal = {
  run: Id;
  campagne: { id: Id; nom: string };
  le: string;
  bilan: string | null;
  positionnement: string | null;
  audience: string | null;
  repartition: string | null;
  creasAValider: number;
};

/** La dernière décision d'un type, lisible ; une décision bloquée n'est pas une proposition. Pure. */
const lastOf = (decisions: Raw[], kind: string): string | null => {
  const d = [...decisions].reverse().find((x) => x.kind === kind && x.status !== "bloquee");
  return d ? decisionSummary(kind, d.after) : null;
};

/** Pure : la proposition d'un passage, à partir de ses décisions (dans l'ordre de création). */
export function buildProposal(run: Raw, campaignName: string, decisions: Raw[], creasAValider: number): AgentProposal {
  return {
    run: run.id as Id,
    campagne: { id: idOf(run.campaign) as Id, nom: campaignName },
    le: String(run.finishedAt ?? run.startedAt),
    bilan: (run.summary as string | null) ?? null,
    positionnement: lastOf(decisions, "positionnement"),
    audience: lastOf(decisions, "audience"),
    repartition: lastOf(decisions, "repartition-budget"),
    creasAValider,
  };
}

/**
 * Les propositions à montrer en tête de « À valider » : un passage terminé
 * (« à valider ») dont au moins une créa attend encore une décision. Une fois
 * toutes ses créas décidées, la carte disparaît d'elle-même.
 */
export async function pendingProposals(payload: Payload, campaignFilter: string | null): Promise<AgentProposal[]> {
  const common = { depth: 0, overrideAccess: true, pagination: false } as const;
  const pending = await payload.find({
    collection: "ad-creatives",
    where: { and: [{ status: { equals: "a-valider" } }, { run: { exists: true } }, ...(campaignFilter ? [{ campaign: { equals: campaignFilter } }] : [])] },
    ...common,
    select: { run: true } as never,
  });
  const count = new Map<string, number>();
  for (const c of pending.docs as unknown as Raw[]) {
    const k = String(idOf(c.run) ?? "");
    if (k) count.set(k, (count.get(k) ?? 0) + 1);
  }
  if (!count.size) return [];
  const ids = [...count.keys()];
  const runs = await payload.find({ collection: "ad-agent-runs", where: { id: { in: ids } }, sort: "-startedAt", ...common, depth: 1 });
  const decisions = await payload.find({ collection: "ad-decisions", where: { run: { in: ids } }, sort: "createdAt", ...common });
  return (runs.docs as unknown as Raw[]).map((r) => {
    const camp = r.campaign as { id?: Id; name?: string } | Id;
    const name = typeof camp === "object" && camp ? String(camp.name ?? "—") : "—";
    return buildProposal(
      r,
      name,
      (decisions.docs as unknown as Raw[]).filter((d) => String(idOf(d.run)) === String(r.id)),
      count.get(String(r.id)) ?? 0,
    );
  });
}
