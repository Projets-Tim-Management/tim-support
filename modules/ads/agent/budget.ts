import { eur as fmt } from "@/modules/ads/lib/spend";
import { localMidnight, localParts, zonedStart } from "@/modules/ads/lib/zoned";

/**
 * Le moteur de budget de l'agent de campagne (plan Publicité, §9 quater, point 3).
 * Pur : aucune lecture de base, tout est passé en paramètre — c'est lui qu'on teste.
 *
 * Trois choses :
 *  1. la règle de dépense de Meta, telle que sa page d'aide la décrit (relue
 *     dans un navigateur le 29/09/2026, exemples de Meta en tests) ;
 *  2. les invariants de la répartition IA / Meta d'une campagne ;
 *  3. le budget d'un passage de préparation, et sa réservation d'agent en agent.
 */

const DAY_MS = 86_400_000;
const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── 1. La règle de Meta ────────────────────────────────────────────────────

/** Un jour peut monter à 175 % du budget quotidien. */
const META_DAY_FACTOR = 1.75;
/** Une semaine complète : 7 fois le budget quotidien. */
const META_WEEK_DAYS = 7;
/** Démarrage ou changement en cours de semaine : marge de 25 % du budget quotidien. */
const META_WEEK_MARGIN = 0.25;
/**
 * Partage du budget entre ensembles de publicités : Meta donne 210 € par jour
 * et 840 € par semaine pour 100 € — soit ×1,2 sur les deux plafonds. Pour un
 * segment de semaine (démarrage, changement), Meta ne donne pas d'exemple : on
 * applique le même ×1,2, ce qui ne peut que relever le plafond (une alerte en
 * moins, jamais une fausse alerte).
 */
const META_SHARING_FACTOR = 1.2;

/** Début et fin (exclue) de la semaine de Meta — dimanche 0 h → dimanche suivant 0 h, fuseau du compte. */
export function metaWeek(now: Date, timeZone: string): { start: Date; end: Date } {
  const start = zonedStart(now, "week", timeZone);
  const { y, m, d } = localParts(start, timeZone);
  return { start, end: localMidnight(y, m, d + 7, timeZone) };
}

/**
 * Le budget en vigueur depuis `from` :
 *  - `semaine` : en place depuis avant le début de la semaine, sans changement ;
 *  - `debut` : la diffusion a commencé à `from`, en cours de semaine ;
 *  - `changement` : le budget a été modifié à `from`, en cours de semaine.
 */
export type BudgetSegment = { kind: "semaine" | "debut" | "changement"; from: Date; dailyBudget: number };

export type WeekCapInput = {
  segment: BudgetSegment;
  timeZone: string;
  /** Date de fin de l'ensemble de publicités, si elle tombe dans la semaine. */
  endAt?: Date | null;
  /** Dépensé dans la semaine AVANT le segment en cours (changement de budget). */
  spentBefore?: number;
  sharing?: boolean;
};

/**
 * Le plafond de dépense de la semaine de Meta, en devise du compte.
 *
 * Exemples de Meta, reproduits en tests :
 *  - 100 €/jour toute la semaine → 700 € ;
 *  - démarrage mercredi à midi à 50 € → 50 × 3,5 j + 12,50 = 187,50 € ;
 *  - passage de 100 € à 50 € mercredi à midi → 50 × 4 j + 12,50 = 212,50 €
 *    du mercredi au samedi (Meta compte le jour du changement en entier),
 *    PLUS ce qui a été dépensé du dimanche au mardi ;
 *  - fin mercredi à 15 h, 50 € → 50 × 3,625 j + 12,50 = 193,75 €.
 */
export function metaWeekCap({ segment, timeZone, endAt, spentBefore = 0, sharing = false }: WeekCapInput): number {
  const { start, end } = metaWeek(segment.from, timeZone);
  const stop = endAt && endAt < end ? endAt : end;
  const factor = sharing ? META_SHARING_FACTOR : 1;
  const b = segment.dailyBudget;

  if (segment.kind === "semaine" && stop === end) return round2(META_WEEK_DAYS * b * factor);

  // Le point de départ du calcul : le début de semaine, l'heure du démarrage,
  // ou le minuit du jour du changement (Meta le compte en entier).
  const from = segment.kind === "semaine" ? start : segment.kind === "changement" ? zonedStart(segment.from, "day", timeZone) : segment.from;
  const days = Math.max(0, (stop.getTime() - from.getTime()) / DAY_MS);
  return round2(spentBefore + (b * days + META_WEEK_MARGIN * b) * factor);
}

/** Le plafond d'un jour : 175 % du budget quotidien le plus élevé défini ce jour-là. */
export const metaDayCap = (highestDailyBudgetToday: number, sharing = false): number =>
  round2(highestDailyBudgetToday * META_DAY_FACTOR * (sharing ? META_SHARING_FACTOR : 1));

/**
 * Où en est la dépense Meta d'un jour : sous le budget (`normal`), au-dessus
 * mais dans ce que Meta s'autorise (`tolerance` — à afficher, pas une alerte),
 * ou au-delà de son propre plafond (`depassement` — Meta n'a pas tenu sa règle).
 */
export function metaDayStatus(spent: number, dailyBudget: number, sharing = false): "normal" | "tolerance" | "depassement" {
  if (spent <= dailyBudget) return "normal";
  return spent <= metaDayCap(dailyBudget, sharing) ? "tolerance" : "depassement";
}

// ─── 2. La répartition IA / Meta d'une campagne ─────────────────────────────

export type CampaignBudget = { totalDailyEur: number; maxAiSharePct: number; metaFloorEur: number };
export type Split = { aiDailyEur: number; metaDailyEur: number };

/**
 * Les invariants d'une répartition (plan, §9 quater, point 3). Renvoie la liste
 * des violations, vide si la répartition est acceptable — la décision est
 * alors journalisée ; sinon elle est `bloquee`, avec ces motifs.
 */
export function splitViolations(b: CampaignBudget, s: Split): string[] {
  const out: string[] = [];
  const eps = 1e-9;
  if (s.aiDailyEur < 0 || s.metaDailyEur < 0) out.push("Un montant négatif n'a pas de sens.");
  const aiMax = (b.totalDailyEur * b.maxAiSharePct) / 100;
  if (s.aiDailyEur > aiMax + eps) out.push(`Part IA de ${fmt(s.aiDailyEur)} au-delà du maximum de ${fmt(aiMax)} (${b.maxAiSharePct} % de ${fmt(b.totalDailyEur)}).`);
  if (s.metaDailyEur < b.metaFloorEur - eps) out.push(`Dépense Meta de ${fmt(s.metaDailyEur)} sous le plancher de ${fmt(b.metaFloorEur)}.`);
  if (s.aiDailyEur + s.metaDailyEur > b.totalDailyEur + eps) {
    out.push(`IA + Meta = ${fmt(s.aiDailyEur + s.metaDailyEur)}, au-delà du total de ${fmt(b.totalDailyEur)}.`);
  }
  return out;
}

// ─── 3. Le budget d'un passage de préparation, et sa réservation ────────────

export type AgentCaps = { prepMaxEur: number; dailyEur: number; monthlyEur: number };
export type AgentSpent = { day: number; month: number };

/** En dessous, un passage ne se lance pas : il s'arrêterait avant d'avoir produit quoi que ce soit. */
const MIN_RUN_BUDGET_EUR = 0.5;

/**
 * Le budget d'un passage : 5 € au plus (décision du 29/09/2026), et jamais plus
 * que ce qui reste au plafond global des agents, du jour et du mois.
 */
export function prepBudget(caps: AgentCaps, spent: AgentSpent): { ok: true; budgetEur: number } | { ok: false; reason: string } {
  const leftDay = caps.dailyEur - spent.day;
  const leftMonth = caps.monthlyEur - spent.month;
  const budgetEur = round2(Math.max(0, Math.min(caps.prepMaxEur, leftDay, leftMonth)));
  if (budgetEur >= MIN_RUN_BUDGET_EUR) return { ok: true, budgetEur };
  const which = leftMonth <= leftDay ? `du mois (${fmt(spent.month)} sur ${fmt(caps.monthlyEur)})` : `du jour (${fmt(spent.day)} sur ${fmt(caps.dailyEur)})`;
  return { ok: false, reason: `Plafond global des agents ${which} : il reste ${fmt(budgetEur)}, moins que les ${fmt(MIN_RUN_BUDGET_EUR)} qu'il faut pour lancer un passage.` };
}

/** L'état budgétaire d'un agent : son budget réservé, ce qu'il a dépensé, ce qu'il a réservé à ses enfants. */
export type AgentLedger = { budgetEur: number; spentEur: number; reservedForChildrenEur: number };

export const availableEur = (a: AgentLedger): number => round2(a.budgetEur - a.spentEur - a.reservedForChildrenEur);

/** Réserver `amount` pour un enfant : la somme des enfants ne dépasse jamais le budget du parent. */
export function canReserve(parent: AgentLedger, amount: number): true | string {
  if (!(amount > 0)) return "Le budget d'un sous-agent doit être positif.";
  const left = availableEur(parent);
  return amount <= left + 1e-9 ? true : `Budget demandé ${fmt(amount)}, il reste ${fmt(left)} à répartir.`;
}

/** Un appel dont le coût MAXIMAL tient dans ce qui reste à l'agent (comme en 3a : jamais une moyenne). */
export function canSpend(agent: AgentLedger, maxCostEur: number): true | string {
  const left = availableEur(agent);
  return maxCostEur <= left + 1e-9 ? true : `Cet appel peut coûter jusqu'à ${fmt(maxCostEur)} ; il reste ${fmt(left)} à cet agent.`;
}
