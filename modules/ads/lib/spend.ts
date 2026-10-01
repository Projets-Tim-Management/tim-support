import type { Payload, Where } from "payload";

import { usdToEur } from "@/core/lib/ai-pricing";
import { PARIS_TZ } from "@/core/lib/dates";
import type { AdSpendKind } from "@/modules/ads/collections/AdAiUsage";
import { zonedStart } from "@/modules/ads/lib/zoned";

/**
 * Les plafonds de dépense de l'atelier de créas, APPLIQUÉS avant chaque appel
 * (plan Publicité, D9 : garde-fous en code, jamais dans le prompt).
 *
 * La règle : le coût MAXIMAL possible de l'appel (pas une moyenne) doit tenir
 * dans ce qui reste du jour et du mois. Sinon, l'appel n'est pas lancé et la
 * raison est dite. L'interrupteur général coupé arrête aussi toute génération.
 *
 * Les jours et les mois sont ceux de Paris : un plafond « du jour » qui
 * basculerait à 2 h du matin en été ne serait pas celui qu'on croit.
 */

export type Limits = { day?: number; month: number };
export type Spent = { day: number; month: number };

type Settings = {
  enabled?: boolean | null;
  textDailyEur?: number | null;
  textMonthlyEur?: number | null;
  imagesMonthlyEur?: number | null;
  videoMonthlyEur?: number | null;
  agentDailyEur?: number | null;
  agentMonthlyEur?: number | null;
};

/** Les plafonds d'une nature de dépense, lus dans les garde-fous (défauts du 29/09/2026, agents : §9 quater). */
export function limitsFor(kind: AdSpendKind, s: Settings | null | undefined): Limits {
  if (kind === "texte") return { day: s?.textDailyEur ?? 5, month: s?.textMonthlyEur ?? 50 };
  if (kind === "image") return { month: s?.imagesMonthlyEur ?? 20 };
  if (kind === "agent") return { day: s?.agentDailyEur ?? 15, month: s?.agentMonthlyEur ?? 150 };
  return { month: s?.videoMonthlyEur ?? 30 };
}

export type BudgetCheck =
  | { ok: true; remainingDay: number | null; remainingMonth: number }
  | { ok: false; reason: string };

/** « 1,50 € » — les montants des messages de refus. */
export const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Pure — c'est elle qu'on teste. */
export function checkBudget(limits: Limits, spent: Spent, maxEur: number): BudgetCheck {
  const remainingMonth = limits.month - spent.month;
  const remainingDay = limits.day != null ? limits.day - spent.day : null;
  if (remainingDay != null && maxEur > remainingDay) {
    return { ok: false, reason: `Plafond du jour : ${eur(spent.day)} dépensés sur ${eur(limits.day!)}, cet appel peut coûter jusqu'à ${eur(maxEur)}.` };
  }
  if (maxEur > remainingMonth) {
    return { ok: false, reason: `Plafond du mois : ${eur(spent.month)} dépensés sur ${eur(limits.month)}, cet appel peut coûter jusqu'à ${eur(maxEur)}.` };
  }
  return { ok: true, remainingDay, remainingMonth };
}

/** Minuit à Paris, pour le jour (ou le 1er du mois) qui contient `now`, en instant UTC. */
export const parisStart = (now: Date, of: "day" | "month"): Date => zonedStart(now, of, PARIS_TZ);

export class AdsBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsBudgetError";
  }
}

/**
 * Les lignes du registre qu'un plafond compte. Une dépense déclenchée par un
 * agent (des textes écrits par l'atelier, par exemple) est UNE ligne, de sa
 * nature (« texte »), rattachée au passage : elle compte donc dans le plafond de
 * sa nature ET dans celui des agents — le plus strict l'emporte — sans jamais
 * apparaître deux fois dans les totaux (décision du 30/09/2026).
 */
export const spendFilter = (kind: AdSpendKind): Where =>
  kind === "agent" ? { or: [{ kind: { equals: "agent" } }, { run: { exists: true } }] } : { kind: { equals: kind } };

async function spentSince(payload: Payload, kind: AdSpendKind, since: Date): Promise<number> {
  const rows = await payload.find({
    collection: "ad-ai-usage",
    where: { and: [spendFilter(kind), { createdAt: { greater_than_equal: since.toISOString() } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { eur: true } as never,
  });
  return rows.docs.reduce((s, r) => s + (Number((r as { eur?: number }).eur) || 0), 0);
}

/** Ce que compte un plafond, dépensé depuis minuit et depuis le 1er du mois (Paris). */
export async function spentOf(payload: Payload, kind: AdSpendKind, now = new Date()): Promise<Spent> {
  const [day, month] = await Promise.all([spentSince(payload, kind, parisStart(now, "day")), spentSince(payload, kind, parisStart(now, "month"))]);
  return { day, month };
}

/**
 * À appeler AVANT chaque appel payant. Lève `AdsBudgetError` avec la raison
 * (interrupteur coupé, plafond du jour, plafond du mois) ; sinon renvoie ce
 * qui reste.
 */
export async function assertAdsBudget(payload: Payload, kind: AdSpendKind, maxEur: number, now = new Date()) {
  const settings = (await payload.findGlobal({ slug: "ads-settings", overrideAccess: true })) as Settings;
  if (settings?.enabled === false) {
    throw new AdsBudgetError("Interrupteur général coupé (Publicité › Paramètres › Garde-fous) : aucune génération ne part.");
  }
  const check = checkBudget(limitsFor(kind, settings), await spentOf(payload, kind, now), maxEur);
  if (!check.ok) throw new AdsBudgetError(check.reason);
  return check;
}

/** Inscrit un appel payant, au coût réellement facturé. */
export async function recordAdsUsage(
  payload: Payload,
  entry: {
    kind: AdSpendKind;
    provider: string;
    model: string;
    usd: number;
    campaign?: number | string | null;
    /** Le passage et l'agent qui ont déclenché la dépense, s'il y en a un. */
    run?: number | string | null;
    agent?: number | string | null;
    batch?: string;
    detail: string;
    usage?: unknown;
  },
) {
  return payload.create({
    collection: "ad-ai-usage",
    data: {
      kind: entry.kind,
      provider: entry.provider,
      model: entry.model,
      usd: Math.round(entry.usd * 10_000) / 10_000,
      eur: Math.round(usdToEur(entry.usd) * 10_000) / 10_000,
      campaign: (entry.campaign ?? null) as number | null,
      run: (entry.run ?? null) as number | null,
      agent: (entry.agent ?? null) as number | null,
      batch: entry.batch ?? null,
      detail: entry.detail,
      usage: (entry.usage ?? null) as never,
    },
    overrideAccess: true,
  });
}
