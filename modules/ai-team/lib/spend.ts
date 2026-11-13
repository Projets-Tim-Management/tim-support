import { minAgentBudgetEur } from "@/modules/ads/agent/tools";
import { num, parisMonthDays, parisMonthStart, r2, r3 } from "@/modules/ai-team/lib/format";
import { CREATABLE_ROLES, type CreatableRole } from "@/modules/ads/agent/roles";

/**
 * Ce que coûte l'équipe IA — par agent, et au total par chef (décision du
 * 12/11/2026 : « le détail dépensé en IA pour chaque agent et le total par
 * chef ; c'est lui qui répartit les budgets, le but est d'optimiser »).
 *
 * D'où viennent les chiffres :
 *  - chaque mission (`ad-agents`) porte le budget que le chef lui a CONFIÉ
 *    (`budgetEur`) et ce qu'elle a vraiment DÉPENSÉ (`spentEur`, l'atelier
 *    compris) ;
 *  - le chef dépense aussi pour lui : ses passages (orchestration, suivis),
 *    ses conversations avec la direction (`ai-team-messages`), les questions
 *    posées à l'analyste (`ad-questions`).
 *
 * Le levier, mesuré sur les vrais chiffres : un sous-agent ne peut pas recevoir
 * moins que le plancher du moteur (deux tours au coût maximal, `minAgentBudgetEur`).
 * Quand le chef confie déjà ce plancher et que l'agent n'en dépense qu'une
 * petite part, c'est le plancher qu'il faudrait revoir — pas le chef. Les
 * pistes le disent tel quel.
 *
 * Pur : « maintenant » et les données sont passés en paramètre.
 */

type Raw = Record<string, unknown>;

export type SpendLine = {
  /** Missions de la période. */
  missions: number;
  /** Budget confié par le chef (sous-agents) ou réservé pour le passage (chef). */
  budgetEur: number;
  spentEur: number;
  /** Dépensé / confié, en %. */
  usedPct: number | null;
  avgEur: number | null;
  maxEur: number | null;
};

export type MemberSpend = {
  key: string;
  name: string;
  level: "chef" | "sous-agent";
  month: SpendLine;
  all: SpendLine;
  /** Le plancher imposé par le moteur à une mission de ce rôle (sous-agents). */
  floorEur: number | null;
  /** Chef seulement : ce qu'il dépense hors passages, ce mois. */
  conversationsEur?: number;
  questionsEur?: number;
};

export type Hint = { memberKey: string; tone: "info" | "save" | "warn"; text: string };

export type TeamSpend = {
  chiefKey: string | null;
  members: MemberSpend[];
  /** Total de l'équipe du chef ce mois (lui compris), et depuis le début. */
  teamMonthEur: number;
  teamAllEur: number;
  /** Plafond mensuel de TOUS les agents (Publicité › Garde-fous). */
  capMonthEur: number | null;
  /** Jours écoulés dans le mois, aujourd'hui compris : le diviseur de la moyenne par jour. */
  daysElapsed: number;
  /** Jours du mois en cours : pour projeter la fin du mois au rythme actuel. */
  daysInMonth: number;
  /** Le budget IA du mois fixé sur la carte du chef (null : seul le plafond global joue). */
  budgetEur: number | null;
  hints: Hint[];
};

const line = (rows: { budget: number; spent: number }[]): SpendLine => {
  const spent = rows.reduce((s, r) => s + r.spent, 0);
  const budget = rows.reduce((s, r) => s + r.budget, 0);
  return {
    missions: rows.length,
    budgetEur: r2(budget),
    spentEur: r3(spent),
    usedPct: budget > 0 ? Math.round((spent / budget) * 100) : null,
    avgEur: rows.length ? r3(spent / rows.length) : null,
    maxEur: rows.length ? r3(Math.max(...rows.map((r) => r.spent))) : null,
  };
};

const fmt = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Ce qu'un membre a coûté ce mois, tout compris (passages, et pour un chef ses conversations et questions). */
export const monthTotal = (m: MemberSpend) => Math.round((m.month.spentEur + (m.conversationsEur ?? 0) + (m.questionsEur ?? 0)) * 1000) / 1000;

/** La moyenne par jour : le total du mois divisé par les jours écoulés (aujourd'hui compris). */
export const perDay = (total: number, days: number) => (days > 0 ? Math.round((total / days) * 1000) / 1000 : 0);

export function buildTeamSpend(input: {
  members: Raw[];
  agents: Raw[];
  messages: Raw[];
  questions: Raw[];
  capMonthEur: number | null;
  now: Date;
  /**
   * La dépense « agents » du mois au registre (ad-ai-usage) — le chiffre que le
   * moteur compare au budget. Fourni, il fait foi pour le total de l'équipe.
   */
  registryMonthEur?: number;
}): TeamSpend {
  const from = parisMonthStart(input.now);
  const inMonth = (iso: unknown) => Date.parse(String(iso ?? "")) >= from;
  // Le budget IA « agents » est celui de l'équipe SEA : Serge (SEO/GEO) a le sien, compté à part.
  const sea = input.members.filter((m) => m.domain !== "seo");
  const chief = sea.find((m) => m.key === "chef-sea") ?? sea.find((m) => m.level === "chef") ?? null;

  const members: MemberSpend[] = sea.map((m) => {
    const roles = new Set((m.engineRoles as string[] | undefined) ?? []);
    const mine = input.agents.filter((a) => roles.has(String(a.role))).map((a) => ({ at: a.createdAt, budget: num(a.budgetEur), spent: num(a.spentEur) }));
    const creatable = [...roles].find((r): r is CreatableRole => (CREATABLE_ROLES as readonly string[]).includes(r));
    const isChief = m.level === "chef";
    const conversationsEur = isChief ? r3(input.messages.filter((x) => String(x.member) === String(m.id) && inMonth(x.createdAt)).reduce((s, x) => s + num(x.costEur), 0)) : undefined;
    const questionsEur = isChief ? r3(input.questions.filter((q) => inMonth(q.askedAt)).reduce((s, q) => s + num(q.costEur), 0)) : undefined;
    return {
      key: String(m.key),
      name: String(m.name),
      level: isChief ? "chef" : "sous-agent",
      month: line(mine.filter((x) => inMonth(x.at))),
      all: line(mine),
      floorEur: creatable ? minAgentBudgetEur(creatable) : null,
      ...(isChief ? { conversationsEur, questionsEur } : {}),
    };
  });

  const totalOf = (k: "month" | "all") =>
    r2(members.reduce((s, m) => s + m[k].spentEur, 0) + (k === "month" ? members.reduce((s, m) => s + (m.conversationsEur ?? 0) + (m.questionsEur ?? 0), 0) : 0));

  // Les pistes : sur l'historique complet, à partir de 3 missions (en deçà, rien de sûr).
  const hints: Hint[] = [];
  for (const m of members) {
    if (m.level !== "sous-agent" || m.all.missions < 3 || m.all.usedPct == null || m.floorEur == null) continue;
    const avgBudget = m.all.budgetEur / m.all.missions;
    const atFloor = avgBudget <= m.floorEur * 1.05;
    // Au plancher, on ne peut pas confier moins : la piste porte sur le plancher, jamais sur le chef.
    if (m.all.usedPct < 50 && atFloor) {
      hints.push({
        memberKey: m.key,
        tone: "info",
        text: `${m.name} reçoit le plancher du moteur (${fmt(m.floorEur)} par mission) mais n'en dépense que ${m.all.usedPct} % (${fmt(m.all.avgEur ?? 0)} en moyenne, ${fmt(m.all.maxEur ?? 0)} au plus). ${chief ? String(chief.name) : "Le chef"} ne peut pas confier moins : c'est le plancher (deux tours au coût maximal) qui est prudent.`,
      });
    } else if (m.all.usedPct < 50) {
      const enough = r2(Math.max(m.floorEur, (m.all.maxEur ?? 0) * 1.3));
      hints.push({
        memberKey: m.key,
        tone: "save",
        text: `${m.name} n'utilise que ${m.all.usedPct} % du budget confié : environ ${fmt(enough)} par mission suffiraient (dépense la plus haute + 30 %).`,
      });
    } else if (m.all.usedPct > 90) {
      hints.push({ memberKey: m.key, tone: "warn", text: `${m.name} dépense ${m.all.usedPct} % du budget confié : c'est juste, une mission risque de s'arrêter faute de budget.` });
    }
  }

  return {
    chiefKey: chief ? String(chief.key) : null,
    members,
    teamMonthEur: input.registryMonthEur != null ? r2(input.registryMonthEur) : totalOf("month"),
    teamAllEur: totalOf("all"),
    capMonthEur: input.capMonthEur,
    // Les jours de Paris, comme les plafonds : le 1er à 0 h 30, c'est déjà le jour 1.
    daysElapsed: parisMonthDays(input.now).day,
    daysInMonth: parisMonthDays(input.now).daysInMonth,
    budgetEur: chief && typeof chief.monthlyAiBudgetEur === "number" ? (chief.monthlyAiBudgetEur as number) : null,
    hints,
  };
}
