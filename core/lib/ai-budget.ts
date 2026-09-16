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
type Entry = Record<string, any> & { key: string; spendDay?: string | null; spendEur?: number | null; spendQuestions?: number | null };

const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", dateStyle: "short" }).format(new Date());

async function readEntries(payload: Payload): Promise<Entry[]> {
  const g = (await payload.findGlobal({ slug: "support-connections", depth: 0, overrideAccess: true })) as { entries?: Entry[] | null };
  return [...(g.entries ?? [])];
}

/** La dépense du jour, en euros, et le nombre de questions. */
export async function spentToday(payload: Payload): Promise<{ eur: number; questions: number }> {
  const e = (await readEntries(payload)).find((x) => x.key === "anthropic");
  if (!e || e.spendDay !== today()) return { eur: 0, questions: 0 };
  return { eur: Number(e.spendEur) || 0, questions: Number(e.spendQuestions) || 0 };
}

/** Ajoute une réponse à la dépense du jour et renvoie le nouveau total. */
export async function recordSpend(payload: Payload, usage: Usage): Promise<{ eur: number; questions: number }> {
  const entries = await readEntries(payload);
  const idx = entries.findIndex((x) => x.key === "anthropic");
  const current: Entry = idx >= 0 ? entries[idx] : { key: "anthropic" };
  const sameDay = current.spendDay === today();
  const next: Entry = {
    ...current,
    spendDay: today(),
    spendEur: (sameDay ? Number(current.spendEur) || 0 : 0) + costEur(usage),
    spendQuestions: (sameDay ? Number(current.spendQuestions) || 0 : 0) + 1,
  };
  if (idx >= 0) entries[idx] = next;
  else entries.push(next);
  await payload.updateGlobal({ slug: "support-connections", data: { entries } as never, overrideAccess: true });
  return { eur: next.spendEur as number, questions: next.spendQuestions as number };
}
