import type { Payload } from "payload";

/**
 * Le plafond de dépense de l'assistant : tant d'euros par jour, tous comptes
 * confondus — un bug qui boucle, une distraction, un prompt qui explose ne
 * doivent pas faire une facture. Compté depuis les tokens que l'API renvoie,
 * au tarif du modèle, et PERSISTÉ (global `support-connections`, entrée
 * `anthropic`) : un redémarrage ne remet pas le compteur à zéro.
 *
 * Trois garde-fous se cumulent : ce plafond en euros, le plafond de questions
 * par jour et par compte (route ask), et le plafond de dépense mensuel de la
 * console Anthropic — le seul que rien ici ne peut contourner.
 *
 * On tient aussi le cumul du mois — sans plafond, pour information : c'est ce
 * que la facture Anthropic va dire, lisible sur la carte « Connexions du
 * support » sans aller sur leur console.
 */

/** Tarif de Claude Haiku 4.5, en dollars par million de tokens. */
export const HAIKU_PRICES = { input: 1, output: 5, cacheWrite: 1.25, cacheRead: 0.1 } as const;
/** Conversion indicative : le plafond est en euros, la facture en dollars. */
const USD_PER_EUR = 1.1;

export const dailyBudgetEur = (): number => Number(process.env.ASSISTANT_AI_DAILY_BUDGET_EUR) || 10;

export type Usage = { input: number; output: number; cacheRead: number; cacheWrite: number };

export const costUsd = (u: Usage): number =>
  (u.input * HAIKU_PRICES.input + u.output * HAIKU_PRICES.output + u.cacheWrite * HAIKU_PRICES.cacheWrite + u.cacheRead * HAIKU_PRICES.cacheRead) / 1_000_000;

export const costEur = (u: Usage): number => costUsd(u) / USD_PER_EUR;

/* eslint-disable @typescript-eslint/no-explicit-any */
export type SpendEntry = {
  spendDay?: string | null;
  spendEur?: number | null;
  spendQuestions?: number | null;
  spendMonth?: string | null;
  spendMonthEur?: number | null;
  spendMonthQuestions?: number | null;
};
type Entry = Record<string, any> & { key: string } & SpendEntry;

/** Jour civil de Paris, « AAAA-MM-JJ » ; ses 7 premiers caractères font le mois. */
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(new Date());

export type Spend = { eur: number; questions: number };
export type SpendSummary = { today: Spend; month: Spend; dailyBudgetEur: number };

/**
 * Lit la dépense d'une entrée : le jour et le mois, chacun remis à zéro dès
 * que la date mémorisée n'est plus la courante. Pure — c'est elle qu'on teste.
 */
export function summarizeSpend(e: SpendEntry | null | undefined, day = today()): SpendSummary {
  const month = day.slice(0, 7);
  const sameDay = e?.spendDay === day;
  const sameMonth = e?.spendMonth === month;
  return {
    today: { eur: sameDay ? Number(e?.spendEur) || 0 : 0, questions: sameDay ? Number(e?.spendQuestions) || 0 : 0 },
    month: { eur: sameMonth ? Number(e?.spendMonthEur) || 0 : 0, questions: sameMonth ? Number(e?.spendMonthQuestions) || 0 : 0 },
    dailyBudgetEur: dailyBudgetEur(),
  };
}

/** Ajoute une réponse aux compteurs du jour et du mois. Pure — testée. */
export function addSpend(e: SpendEntry | null | undefined, eur: number, day = today()): Required<SpendEntry> {
  const s = summarizeSpend(e, day);
  return {
    spendDay: day,
    spendEur: s.today.eur + eur,
    spendQuestions: s.today.questions + 1,
    spendMonth: day.slice(0, 7),
    spendMonthEur: s.month.eur + eur,
    spendMonthQuestions: s.month.questions + 1,
  };
}

async function readEntries(payload: Payload): Promise<Entry[]> {
  const g = (await payload.findGlobal({ slug: "support-connections", depth: 0, overrideAccess: true })) as { entries?: Entry[] | null };
  return [...(g.entries ?? [])];
}

/** La dépense du jour, en euros, et le nombre de questions. */
export async function spentToday(payload: Payload): Promise<Spend> {
  const e = (await readEntries(payload)).find((x) => x.key === "anthropic");
  return summarizeSpend(e).today;
}

/** Ajoute une réponse à la dépense du jour et du mois ; renvoie le total du jour. */
export async function recordSpend(payload: Payload, usage: Usage): Promise<Spend> {
  const entries = await readEntries(payload);
  const idx = entries.findIndex((x) => x.key === "anthropic");
  const current: Entry = idx >= 0 ? entries[idx] : { key: "anthropic" };
  const next: Entry = { ...current, ...addSpend(current, costEur(usage)) };
  if (idx >= 0) entries[idx] = next;
  else entries.push(next);
  await payload.updateGlobal({ slug: "support-connections", data: { entries } as never, overrideAccess: true });
  return { eur: next.spendEur as number, questions: next.spendQuestions as number };
}
