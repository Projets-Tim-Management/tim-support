import type { Payload } from "payload";

import { usdToEur } from "@/core/lib/ai-pricing";
import type { AdSpendKind } from "@/modules/ads/collections/AdAiUsage";

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
};

/** Les plafonds d'une nature de dépense, lus dans les garde-fous (défauts du 29/09/2026). */
export function limitsFor(kind: AdSpendKind, s: Settings | null | undefined): Limits {
  if (kind === "texte") return { day: s?.textDailyEur ?? 5, month: s?.textMonthlyEur ?? 50 };
  if (kind === "image") return { month: s?.imagesMonthlyEur ?? 20 };
  return { month: s?.videoMonthlyEur ?? 30 };
}

export type BudgetCheck =
  | { ok: true; remainingDay: number | null; remainingMonth: number }
  | { ok: false; reason: string };

const eur = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

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

/** Décalage de Paris par rapport à UTC, en minutes, à un instant donné. */
function parisOffsetMinutes(at: Date): number {
  const name = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", timeZoneName: "shortOffset" })
    .formatToParts(at)
    .find((p) => p.type === "timeZoneName")?.value;
  const m = /GMT([+-]\d+)(?::(\d+))?/.exec(name ?? "");
  return m ? Number(m[1]) * 60 + Math.sign(Number(m[1])) * Number(m[2] ?? 0) : 0;
}

/** Minuit à Paris, pour le jour (ou le 1er du mois) qui contient `now`, en instant UTC. */
export function parisStart(now: Date, of: "day" | "month"): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(now)
    .split("-")
    .map(Number);
  const guess = Date.UTC(y, m - 1, of === "month" ? 1 : d, 0, 0, 0);
  return new Date(guess - parisOffsetMinutes(new Date(guess)) * 60_000);
}

export class AdsBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdsBudgetError";
  }
}

async function spentSince(payload: Payload, kind: AdSpendKind, since: Date): Promise<number> {
  const rows = await payload.find({
    collection: "ad-ai-usage",
    where: { and: [{ kind: { equals: kind } }, { createdAt: { greater_than_equal: since.toISOString() } }] },
    pagination: false,
    depth: 0,
    overrideAccess: true,
    select: { eur: true } as never,
  });
  return rows.docs.reduce((s, r) => s + (Number((r as { eur?: number }).eur) || 0), 0);
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
  const [day, month] = await Promise.all([spentSince(payload, kind, parisStart(now, "day")), spentSince(payload, kind, parisStart(now, "month"))]);
  const check = checkBudget(limitsFor(kind, settings), { day, month }, maxEur);
  if (!check.ok) throw new AdsBudgetError(check.reason);
  return check;
}

/** Inscrit un appel payant, au coût réellement facturé. */
export async function recordAdsUsage(
  payload: Payload,
  entry: { kind: AdSpendKind; provider: string; model: string; usd: number; campaign?: number | string | null; batch?: string; detail: string; usage?: unknown },
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
      batch: entry.batch ?? null,
      detail: entry.detail,
      usage: (entry.usage ?? null) as never,
    },
    overrideAccess: true,
  });
}
