import type { Payload } from "payload";

import { accountContext } from "@/modules/ads/lib/account-access";
import { ACTION_KINDS, actionSummary, judgeAction, readAction, type Action, type Autonomy, type GuardContext, type Verdict } from "@/modules/ads/lib/actions";

/**
 * Appliquer une action chez Meta, sous les garde-fous (plan Publicité, phase 2)
 * — la couche qui lit la base autour de `judgeAction` et journalise TOUT : une
 * action exécutée, proposée ou bloquée devient une décision, avec sa raison.
 *
 * Deux portes : `submitAction` (un agent, ou le code d'une urgence) et
 * `reviewAction` (Charlie valide ou refuse une action proposée).
 */

export class ActionError extends Error {}

type Origin = { run?: number | string | null; agent?: number | string | null; step?: number | string | null };

/** Le premier jour du mois et les jours qui restent, à Paris. */
function month(now: Date): { start: string; daysLeft: number } {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now).split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { start: `${y}-${String(m).padStart(2, "0")}-01`, daysLeft: daysInMonth - d + 1 };
}

type RawCampaign = {
  id: number;
  name: string;
  autonomy?: Autonomy | null;
  agentBudget?: { metaFloorEur?: number | null; split?: { metaDailyEur?: number | null } | null } | null;
  publication?: { activatedAt?: string | null } | null;
  account?: { id: number; monthlyCapEur?: number | null } | number | null;
};

/** Tout ce que les garde-fous ont besoin de savoir pour juger une action sur cette campagne. */
async function guardContext(payload: Payload, campaignId: number | string, a: Action, now = new Date()): Promise<{ ctx: GuardContext; campaign: RawCampaign; accountId: number }> {
  const campaign = (await payload.findByID({ collection: "ad-campaigns", id: campaignId, depth: 1, overrideAccess: true }).catch(() => null)) as RawCampaign | null;
  if (!campaign) throw new ActionError("Campagne introuvable.");
  const account = typeof campaign.account === "object" && campaign.account ? campaign.account : null;
  if (!account) throw new ActionError("La campagne n'a pas de compte publicitaire.");
  const { start, daysLeft } = month(now);
  const [settings, last, spent, live] = await Promise.all([
    payload.findGlobal({ slug: "ads-settings", overrideAccess: true }) as Promise<{ enabled?: boolean | null; maxBudgetChangePct?: number | null; minHoursBetweenChanges?: number | null }>,
    payload.find({ collection: "ad-decisions", where: { and: [{ target: { equals: a.externalId } }, { executedAt: { exists: true } }] }, sort: "-executedAt", limit: 1, depth: 0, overrideAccess: true }),
    payload.find({ collection: "ad-metrics-daily", where: { and: [{ account: { equals: account.id } }, { level: { equals: "campaign" } }, { day: { greater_than_equal: start } }] }, pagination: false, depth: 0, overrideAccess: true, select: { spend: true } as never }),
    payload.find({ collection: "ad-campaigns", where: { and: [{ account: { equals: account.id } }, { publicationStatus: { equals: "active" } }] }, pagination: false, depth: 0, overrideAccess: true, select: { agentBudget: true } as never }),
  ]);
  const lastAt = (last.docs[0] as { executedAt?: string } | undefined)?.executedAt;
  return {
    campaign,
    accountId: account.id,
    ctx: {
      settings: { enabled: settings.enabled !== false, maxBudgetChangePct: settings.maxBudgetChangePct ?? 20, minHoursBetweenChanges: settings.minHoursBetweenChanges ?? 72 },
      autonomy: campaign.autonomy ?? "proposer",
      now,
      lastChangeAt: lastAt ? new Date(lastAt) : null,
      activatedAt: campaign.publication?.activatedAt ? new Date(campaign.publication.activatedAt) : null,
      floorEur: campaign.agentBudget?.metaFloorEur ?? null,
      monthlyCapEur: account.monthlyCapEur ?? null,
      monthSpentEur: (spent.docs as { spend?: number }[]).reduce((s, r) => s + Number(r.spend ?? 0), 0),
      accountDailyEur: (live.docs as RawCampaign[]).reduce((s, c) => s + Number(c.agentBudget?.split?.metaDailyEur ?? 0), 0),
      daysLeftInMonth: daysLeft,
    },
  };
}

/**
 * Après un budget appliqué chez Meta, la part Meta de la répartition suit : c'est
 * elle que lit le plafond mensuel du compte pour projeter la fin du mois.
 */
async function followSplit(payload: Payload, campaignId: number | string, a: Action): Promise<void> {
  if (a.kind !== "budget") return;
  const c = (await payload.findByID({ collection: "ad-campaigns", id: campaignId, depth: 0, overrideAccess: true }).catch(() => null)) as RawCampaign | null;
  const split = c?.agentBudget?.split;
  if (!split || split.metaDailyEur == null) return;
  const metaDailyEur = Math.max(0, Math.round((Number(split.metaDailyEur) + a.toEur - a.fromEur) * 100) / 100);
  await payload.update({ collection: "ad-campaigns", id: campaignId, data: { agentBudget: { ...c!.agentBudget, split: { ...split, metaDailyEur } } } as never, overrideAccess: true });
}

/** Applique l'action chez la régie. */
async function apply(payload: Payload, accountId: number, a: Action): Promise<void> {
  const { ctx, platform } = await accountContext(payload, accountId);
  const ref = { level: a.level, externalId: a.externalId };
  if (a.kind === "budget") {
    if (!platform.setBudget) throw new ActionError(`${platform.label} : le changement de budget n'est pas branché.`);
    await platform.setBudget(ctx, ref, a.toEur);
  } else {
    if (!platform.setStatus) throw new ActionError(`${platform.label} : la mise en pause n'est pas branchée.`);
    await platform.setStatus(ctx, ref, a.kind === "pause" ? "pause" : "active");
  }
}

/**
 * Une action d'un agent (ou d'une urgence détectée par le code) : jugée, journalisée,
 * appliquée si les garde-fous le permettent. Rend la décision et le verdict.
 */
export async function submitAction(
  payload: Payload,
  input: { campaign: number | string; action: Action; rationale: string; origin?: Origin; extra?: Record<string, unknown> },
  now = new Date(),
): Promise<{ decision: number | string; verdict: Verdict; error: string | null }> {
  const a = input.action;
  const { ctx, accountId, campaign } = await guardContext(payload, input.campaign, a, now);
  const verdict = judgeAction(a, ctx);
  const base = {
    campaign: campaign.id,
    run: input.origin?.run ?? null,
    agent: input.origin?.agent ?? null,
    step: input.origin?.step ?? null,
    kind: a.kind,
    rationale: input.rationale.trim() || "—",
    after: { ...a, summary: actionSummary(a) },
    target: a.externalId,
    ...input.extra,
  };
  if (verdict.outcome !== "executer") {
    const d = await payload.create({
      collection: "ad-decisions",
      data: { ...base, status: verdict.outcome === "proposer" ? "proposee" : "bloquee", guardrail: verdict.reasons.join(" ") } as never,
      overrideAccess: true,
    });
    return { decision: d.id, verdict, error: null };
  }
  let error: string | null = null;
  try {
    await apply(payload, accountId, a);
  } catch (e) {
    error = (e as Error).message;
  }
  const d = await payload.create({
    collection: "ad-decisions",
    data: { ...base, status: error ? "bloquee" : "executee", guardrail: error ? `Échec chez Meta : ${error}` : verdict.reasons.join(" "), executedAt: error ? null : now.toISOString() } as never,
    overrideAccess: true,
  });
  if (error) payload.logger.warn(`[publicité] action « ${actionSummary(a)} » : ${error}`);
  else await followSplit(payload, campaign.id, a).catch((e) => payload.logger.warn(`[publicité] répartition non suivie : ${(e as Error).message}`));
  return { decision: d.id, verdict, error };
}

/**
 * Charlie valide ou refuse une action proposée. Valider la rejuge — un garde-fou
 * qui bloque entre-temps (72 h, plafond, interrupteur) bloque encore — mais ce
 * qui n'attendait qu'un humain passe : c'est lui qui décide.
 */
export async function reviewAction(payload: Payload, id: number | string, choice: "valider" | "refuser", userId: number | string, now = new Date()): Promise<{ status: string; guardrail: string | null }> {
  const d = (await payload.findByID({ collection: "ad-decisions", id, depth: 0, overrideAccess: true }).catch(() => null)) as { id: number; kind: string; status: string; campaign: number; after?: unknown } | null;
  if (!d || !(ACTION_KINDS as readonly string[]).includes(d.kind)) throw new ActionError("Décision introuvable.");
  if (d.status !== "proposee") throw new ActionError("Cette action n'attend plus de décision.");
  const a = readAction(d.after);
  if (!a) throw new ActionError("Action illisible.");
  if (choice === "refuser") {
    await payload.update({ collection: "ad-decisions", id, data: { status: "bloquee", guardrail: "Refusée à la main.", reviewedBy: userId } as never, overrideAccess: true });
    return { status: "bloquee", guardrail: "Refusée à la main." };
  }
  const { ctx, accountId } = await guardContext(payload, d.campaign, a, now);
  const verdict = judgeAction(a, { ...ctx, autonomy: "autonome" });
  if (verdict.outcome === "bloquer") {
    const guardrail = verdict.reasons.join(" ");
    await payload.update({ collection: "ad-decisions", id, data: { status: "bloquee", guardrail, reviewedBy: userId } as never, overrideAccess: true });
    return { status: "bloquee", guardrail };
  }
  try {
    await apply(payload, accountId, a);
  } catch (e) {
    const guardrail = `Échec chez Meta : ${(e as Error).message}`;
    await payload.update({ collection: "ad-decisions", id, data: { status: "bloquee", guardrail, reviewedBy: userId } as never, overrideAccess: true });
    return { status: "bloquee", guardrail };
  }
  await payload.update({ collection: "ad-decisions", id, data: { status: "executee", executedAt: now.toISOString(), reviewedBy: userId } as never, overrideAccess: true });
  await followSplit(payload, d.campaign, a).catch((e) => payload.logger.warn(`[publicité] répartition non suivie : ${(e as Error).message}`));
  return { status: "executee", guardrail: null };
}
