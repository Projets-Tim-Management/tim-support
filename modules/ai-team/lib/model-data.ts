import type { Payload } from "payload";

import { DAY_MS } from "@/modules/ai-team/lib/format";
import type { Scorecard } from "@/modules/ai-team/lib/scorecard";
import { latestMethods, loadCompetitorNames, membersByKeys } from "@/modules/ai-team/lib/shared-data";
import { loadGoogleAds, type GoogleAdsView } from "@/modules/analytics/lib/google-ads";
import { loadOpenAiAds, type OpenAiAdsView } from "@/modules/analytics/lib/openai-ads";

/**
 * Ce que les agents LISENT des données de TIM, mis en forme pour le modèle —
 * une seule forme pour la revue de Margaux, sa conversation et les veilles
 * (relecture du 12/11/2026 : chacune avait la sienne, presque pareille).
 */

const NOT_PLUGGED = "non branché";

/** La fiche des canaux (Yanis) ; `channel` : seulement ce canal. Pure. */
export function scorecardForModel(card: Scorecard | null, channel?: string | null) {
  if (!card) return "indisponible pour l'instant";
  const rows = channel ? card.rows.filter((r) => r.key === channel) : card.rows;
  return {
    fenetre: `${card.window.months} derniers mois (depuis le ${card.window.from}), comparés aux ${card.window.months} précédents`,
    aRetenir: card.headlines,
    canaux: rows.map((r) => ({ canal: r.label, payant: r.paid, maintenant: r.now, avant: r.before, evolutionCoutParQualifiePct: r.cpqTrend })),
    budgetsFixesParLaDirection: card.budgets,
    limites: card.caveats,
  };
}

/** Ce que Thomas remet : ses constats et l'essentiel du compte Google Ads, sans le détail. Pure. */
export const googleForModel = (g: GoogleAdsView) => ({
  constats: g.findings,
  trenteDerniersJours: g.last30,
  campagnes: g.campaigns.slice(0, 6).map((c) => ({ nom: c.name, etat: c.status, budgetJour: c.dailyBudget, depense: c.cost, clics: c.clicks, conversions: c.conversions })),
  recherchesQuiCoutent: g.searchTerms.slice(0, 15).map((t) => ({ recherche: t.term, depense: t.cost, clics: t.clicks, conversions: t.conversions, concurrent: t.competitor })),
  actionsDeConversionActives: g.activeConversionActions,
});

/** Ce que Sarah remet : ses constats et l'essentiel du compte ChatGPT Ads. Pure. */
export const chatgptForModel = (o: OpenAiAdsView) => ({
  constats: o.findings,
  trenteDerniersJours: o.last30,
  depenseParMois: o.spendByMonth,
  campagnes: o.campaigns.slice(0, 6).map((c) => ({ nom: c.name, depense: c.spend, clics: c.clicks, conversionsDuPixel: c.conversions })),
});

/**
 * Les comptes lus par Thomas et Sarah (chacun gardé 3 heures par son
 * connecteur). `only` : ne lire que l'un des deux.
 */
export async function loadAdsReaders(payload: Payload, now: Date, only?: "google" | "chatgpt") {
  const [g, o] = await Promise.all([
    only === "chatgpt" ? null : loadCompetitorNames(payload).then((names) => loadGoogleAds(names, 3, now)).catch(() => null),
    only === "google" ? null : loadOpenAiAds(3, now).catch(() => null),
  ]);
  return {
    googleAdsLuParThomas: g?.status === "ok" ? googleForModel(g.data) : NOT_PLUGGED,
    chatgptAdsLuParSarah: o?.status === "ok" ? chatgptForModel(o.data) : NOT_PLUGGED,
  };
}

/** Les verdicts des 12 dernières semaines (ce qu'ont donné les recommandations appliquées) ; `channel` : ce canal et « tous ». */
export async function recentVerdicts(payload: Payload, now: Date, channel?: string | null) {
  const res = await payload
    .find({ collection: "ai-team-requests", where: { and: [{ outcome: { exists: true } }, { verdictAt: { greater_than_equal: new Date(now.getTime() - 84 * DAY_MS).toISOString() } }] }, sort: "-verdictAt", limit: 20, depth: 0, overrideAccess: true, select: { title: true, channel: true, outcome: true, verdict: true, verdictAt: true } as never })
    .then((r) => r.docs as unknown as Record<string, unknown>[])
    .catch(() => []);
  return res
    .filter((r) => !channel || r.channel === channel || r.channel === "tous")
    .map((r) => ({ le: String(r.verdictAt ?? "").slice(0, 10), recommandation: r.title, canal: r.channel, resultat: r.outcome, lecon: r.verdict }));
}

/**
 * Ce que Margaux lit des méthodes de l'équipe : la sienne en entier, et pour
 * chaque agent ce qui a changé et ses idées à tester. `keys` : les agents qui
 * font une veille. Une lecture qui échoue ne casse rien.
 */
export async function teamMethodsForModel(payload: Payload, keys: string[], ownMax = 8_000) {
  try {
    const members = await membersByKeys(payload, keys);
    const methods = await latestMethods(payload, members.map((m) => m.id), true);
    return members.map((m) => {
      const cur = methods.get(String(m.id));
      if (!cur) return { agent: m.name, key: m.key, methode: "pas encore de veille" };
      const base = { agent: m.name, key: m.key, semaine: cur.week, changements: String(cur.changes ?? ""), ideesATester: Array.isArray(cur.ideas) ? cur.ideas : [] };
      return m.key === "chef-sea" ? { ...base, maMethode: String(cur.method ?? "").slice(0, ownMax) } : base;
    });
  } catch {
    return "indisponible";
  }
}
