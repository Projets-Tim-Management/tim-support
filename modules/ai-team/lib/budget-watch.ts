import type { Payload } from "payload";

import { money, parisMonthDays, r2 } from "@/modules/ai-team/lib/format";
import type { RequestInput } from "@/modules/ai-team/lib/requests";

/**
 * LE BUDGET IA DU MOIS DE L'ÉQUIPE SEA, VU PAR MARGAUX (12/11/2026).
 *
 * La direction le fixe sur la carte de Margaux. C'est un PLAFOND, pas une
 * enveloppe à vider : l'équipe n'est pas tenue de tout dépenser. Margaux peut
 * en demander plus (ou proposer moins) si elle le justifie, et la direction
 * change le chiffre.
 *
 *  - `budgetOutlook` : où en est le mois — dépensé, par jour, projection à la
 *    fin du mois. Margaux le lit dans sa revue et dans la conversation.
 *  - `watchTeamBudget` : deux alertes déposées PAR LE CODE dans « Vos
 *    demandes », une fois par mois chacune — à 80 % du plafond, et quand le
 *    plafond bloque un appel. Aucun appel IA : l'alerte part même quand
 *    l'équipe ne peut plus rien dépenser.
 *
 * Les jours sont ceux de Paris.
 */

const ALERT_PCT = 80;
const CHIEF_KEY = "chef-sea";
export const BUDGET_URL = "/admin/equipe-ia?membre=chef-sea";

export type BudgetOutlook = {
  budgetEur: number;
  spentEur: number;
  usedPct: number;
  perDayEur: number;
  daysElapsed: number;
  daysInMonth: number;
  daysLeft: number;
  /** Au rythme actuel, ce que coûtera le mois entier. */
  projectedEur: number;
  level: "ok" | "projection-au-dessus" | "alerte" | "atteint";
};

const eur = (n: number) => money(n);

/** Pure (testée). `blocked` : un appel vient d'être refusé par ce plafond. */
export function budgetOutlook(input: { budgetEur: number; spentEur: number; now: Date; blocked?: boolean }): BudgetOutlook {
  const { day, daysInMonth } = parisMonthDays(input.now);
  const perDay = input.spentEur / day;
  const projected = perDay * daysInMonth;
  const usedPct = input.budgetEur > 0 ? Math.round((input.spentEur / input.budgetEur) * 100) : 100;
  const level: BudgetOutlook["level"] =
    input.blocked || input.spentEur >= input.budgetEur ? "atteint" : usedPct >= ALERT_PCT ? "alerte" : projected > input.budgetEur ? "projection-au-dessus" : "ok";
  return { budgetEur: input.budgetEur, spentEur: r2(input.spentEur), usedPct, perDayEur: r2(perDay), daysElapsed: day, daysInMonth, daysLeft: daysInMonth - day, projectedEur: r2(projected), level };
}

/** Le montant à proposer : de quoi finir le mois au rythme actuel, arrondi aux 10 € du dessus. */
export function suggestedBudget(o: BudgetOutlook): number {
  return Math.max(o.budgetEur + 10, Math.ceil(Math.max(o.projectedEur, o.spentEur + o.perDayEur * o.daysLeft) / 10) * 10);
}

const monthName = (now: Date) => new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", month: "long" }).format(now);

/** L'alerte à déposer pour ce mois, ou rien. Le titre porte le mois : une seule par mois. Pure (testée). */
export function budgetAlert(o: BudgetOutlook, now: Date, chiefName: string): RequestInput | null {
  if (o.level !== "alerte" && o.level !== "atteint") return null;
  const month = monthName(now);
  const ask = suggestedBudget(o);
  const steps = [
    `Ouvrez la carte de ${chiefName} (le lien).`,
    `Dans « Budget IA du mois », remplacez ${eur(o.budgetEur)} par le montant que vous choisissez — ${eur(ask)} suffiraient à finir le mois au rythme actuel.`,
    "Enregistrez, puis cliquez « C'est fait » ici. Vous ne voulez pas augmenter ? Retirez cette demande : l'équipe s'en tiendra au plafond.",
  ];
  const rythme = `${eur(o.spentEur)} dépensés sur ${eur(o.budgetEur)} au ${o.daysElapsed} ${month} (${eur(o.perDayEur)} par jour en moyenne, ${o.daysLeft} jour${o.daysLeft > 1 ? "s" : ""} restant${o.daysLeft > 1 ? "s" : ""}).`;
  if (o.level === "atteint") {
    return {
      kind: "a-faire",
      title: `Budget IA de ${month} atteint : l'équipe SEA est à l'arrêt`,
      why: `${rythme} Plus aucun appel IA de l'équipe ne part jusqu'au 1er du mois prochain (préparations, suivis, revue du lundi, conversation) — sauf si vous relevez le plafond.`,
      url: BUDGET_URL,
      steps,
      question: null,
    };
  }
  return {
    kind: "a-faire",
    title: `Budget IA de ${month} : ${ALERT_PCT} % du plafond atteint`,
    why: `${rythme} Au même rythme, le mois coûterait ${eur(o.projectedEur)}. Rien ne presse : c'est un avertissement, pour décider avant que l'équipe ne s'arrête.`,
    url: BUDGET_URL,
    steps,
    question: null,
  };
}

/**
 * Regarde le budget de l'équipe et dépose l'alerte due (une fois par mois
 * chacune, quel que soit le sort de la précédente). Ne lève jamais : un
 * incident ici ne doit pas faire échouer l'appel qui l'a déclenchée.
 */
export async function watchTeamBudget(payload: Payload, opts: { now?: Date; blocked?: boolean } = {}): Promise<"deposee" | "rien"> {
  try {
    const now = opts.now ?? new Date();
    const found = await payload.find({ collection: "ai-team-members", where: { key: { equals: CHIEF_KEY } }, limit: 1, depth: 0, overrideAccess: true, select: { name: true, monthlyAiBudgetEur: true } as never });
    const chief = found.docs[0] as unknown as { id: number | string; name?: string; monthlyAiBudgetEur?: number | null } | undefined;
    if (!chief || typeof chief.monthlyAiBudgetEur !== "number") return "rien";
    const { spentOf } = await import("@/modules/ads/lib/spend");
    const spent = await spentOf(payload, "agent", now);
    const o = budgetOutlook({ budgetEur: chief.monthlyAiBudgetEur, spentEur: spent.month, now, blocked: opts.blocked });
    const alert = budgetAlert(o, now, String(chief.name ?? "la directrice SEA"));
    if (!alert) return "rien";
    const same = await payload.count({ collection: "ai-team-requests", where: { and: [{ member: { equals: chief.id } }, { title: { equals: alert.title } }] }, overrideAccess: true });
    if (same.totalDocs) return "rien";
    await payload.create({
      collection: "ai-team-requests",
      data: { member: chief.id, kind: alert.kind, status: "ouverte", title: alert.title, why: alert.why, url: alert.url, steps: alert.steps, question: null, origin: "alerte", channel: "tous" } as never,
      overrideAccess: true,
    });
    return "deposee";
  } catch (err) {
    payload.logger?.warn?.(`[équipe IA] surveillance du budget IA : ${err}`);
    return "rien";
  }
}

/** Ce que Margaux lit de son budget, dans sa revue et la conversation. */
export async function loadBudgetOutlook(payload: Payload, now: Date): Promise<BudgetOutlook | null> {
  const found = await payload.find({ collection: "ai-team-members", where: { key: { equals: CHIEF_KEY } }, limit: 1, depth: 0, overrideAccess: true, select: { monthlyAiBudgetEur: true } as never });
  const budget = (found.docs[0] as unknown as { monthlyAiBudgetEur?: number | null } | undefined)?.monthlyAiBudgetEur;
  if (typeof budget !== "number") return null;
  const { spentOf } = await import("@/modules/ads/lib/spend");
  const spent = await spentOf(payload, "agent", now);
  return budgetOutlook({ budgetEur: budget, spentEur: spent.month, now });
}

/** La même chose, en clair pour le modèle. */
export function outlookForModel(o: BudgetOutlook | null) {
  if (!o) return "aucun budget IA fixé : seul le plafond global des agents s'applique";
  return {
    plafondDuMoisEur: o.budgetEur,
    depenseCeMoisEur: o.spentEur,
    utilisePct: o.usedPct,
    parJourEur: o.perDayEur,
    joursRestants: o.daysLeft,
    projectionFinDeMoisEur: o.projectedEur,
    etat: { ok: "dans le plafond", "projection-au-dessus": "au rythme actuel, le mois dépassera le plafond", alerte: `${ALERT_PCT} % du plafond atteint`, atteint: "plafond atteint" }[o.level],
  };
}
