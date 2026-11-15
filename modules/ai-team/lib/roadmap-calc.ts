import type { Snapshot } from "@/modules/ai-team/lib/snapshots";

/**
 * LES INDICATEURS DE LA FEUILLE DE ROUTE — la liste et les calculs purs (sans base ni réseau), lus aussi par la page
 * dans le navigateur (l'avant / après d'une action). Le chargement est dans roadmap-metrics.
 */

export type Team = "sea" | "seo" | "com";
export type MetricKey =
  | "seo-leads-qualifies"
  | "seo-clics-hors-marque"
  | "seo-conversion"
  | "ia-mentions"
  | "pages-indexees"
  | "autorite-presence"
  | "reseaux-interactions"
  | "sea-leads-qualifies"
  | "sea-cout-lead-qualifie"
  | "leads-qualifies-total";

export type Metric = {
  key: MetricKey;
  team: Team | "tous";
  label: string;
  /** « nb » : un nombre ; « € » ; « % ». */
  unit: "nb" | "€" | "%";
  /** Ce qui est mieux : monter ou descendre. */
  better: "up" | "down";
  /** Ce que mesure le chiffre, en une phrase. */
  help: string;
};

export const METRICS: Metric[] = [
  { key: "seo-leads-qualifies", team: "seo", label: "Leads qualifiés gratuits", unit: "nb", better: "up", help: "Leads venus de Google, des IA ou des réseaux arrivés à « Démo programmée » ou plus, sur 3 mois glissants." },
  { key: "seo-clics-hors-marque", team: "seo", label: "Clics Google hors marque", unit: "nb", better: "up", help: "Clics depuis Google sur des recherches qui ne contiennent pas « TIM », sur 3 mois." },
  { key: "seo-conversion", team: "seo", label: "Conversion des visites gratuites", unit: "%", better: "up", help: "Part des visites venues des moteurs, des IA et des réseaux qui deviennent un lead." },
  { key: "ia-mentions", team: "seo", label: "TIM nommé par les IA", unit: "%", better: "up", help: "Part des réponses de ChatGPT, Perplexity, Gemini et Claude qui nomment TIM, sur les questions d'un acheteur (mesure du mois)." },
  { key: "pages-indexees", team: "seo", label: "Pages indexées par Google", unit: "%", better: "up", help: "Part des pages contrôlées que Google a indexées (contrôle du mois)." },
  { key: "autorite-presence", team: "seo", label: "Présence sur les sites de référence", unit: "%", better: "up", help: "Part des comparateurs, annuaires et médias suivis où TIM est présent." },
  { key: "reseaux-interactions", team: "seo", label: "Interactions sur les réseaux", unit: "%", better: "up", help: "Interactions par vue sur YouTube, Facebook et Instagram (28 derniers jours)." },
  { key: "sea-leads-qualifies", team: "sea", label: "Leads qualifiés payants", unit: "nb", better: "up", help: "Leads venus de Meta, Google Ads et ChatGPT Ads arrivés à « Démo programmée » ou plus, sur 3 mois glissants." },
  { key: "sea-cout-lead-qualifie", team: "sea", label: "Coût par lead qualifié (payant)", unit: "€", better: "down", help: "Dépense publicitaire divisée par les leads qualifiés payants, sur 3 mois glissants." },
  { key: "leads-qualifies-total", team: "tous", label: "Leads qualifiés, tous canaux", unit: "nb", better: "up", help: "Tous les leads arrivés à « Démo programmée » ou plus, sur 3 mois glissants." },
];

export const metricOf = (key: string): Metric | undefined => METRICS.find((m) => m.key === key);
export const metricsOfTeam = (team: Team) => METRICS.filter((m) => m.team === team || m.team === "tous");

const PAID = ["meta", "google", "chatgpt"];
const round = (n: number, d = 1) => Math.round(n * 10 ** d) / 10 ** d;

/** La valeur d'un indicateur dans une photo du lundi ; null : pas mesuré cette semaine-là. Pure (testée). */
export function metricValue(s: Snapshot, key: MetricKey): number | null {
  const ch = s.channels ?? [];
  const paid = ch.filter((c) => PAID.includes(c.key));
  switch (key) {
    case "seo-leads-qualifies":
      return ch.find((c) => c.key === "seo")?.now.qualified ?? null;
    case "sea-leads-qualifies":
      return paid.length ? paid.reduce((n, c) => n + c.now.qualified, 0) : null;
    case "sea-cout-lead-qualifie": {
      const q = paid.reduce((n, c) => n + c.now.qualified, 0);
      const spend = paid.reduce((n, c) => n + c.now.spend, 0);
      return q ? round(spend / q, 0) : null;
    }
    case "leads-qualifies-total":
      return ch.length ? ch.reduce((n, c) => n + c.now.qualified, 0) : null;
    default: {
      const v = s.metrics?.[key];
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    }
  }
}

export type SeriesPoint = { week: string; value: number };

/** La courbe d'un indicateur, photo après photo (de la plus ancienne à la plus récente). Pure. */
export const metricSeries = (snaps: Snapshot[], key: MetricKey): SeriesPoint[] => snaps.flatMap((s) => {
  const v = metricValue(s, key);
  return v == null ? [] : [{ week: s.week, value: v }];
});

/**
 * L'AVANT / APRÈS d'une action : la valeur au point qui la précède, puis à 7, 30 et 60 jours (le point le plus proche ;
 * fenêtres de 3 semaines et 4 jours sur des photos hebdomadaires, élargies selon l'espacement de la courbe). « better » dit si le mouvement est un mieux. Pure (testée).
 */
export function beforeAfter(series: SeriesPoint[], date: string, better: "up" | "down"): { before: number | null; after: { days: number; value: number | null; changePct: number | null; good: boolean | null }[] } {
  const t = Date.parse(date);
  const at = (w: string) => Date.parse(`${w}T12:00:00Z`);
  // Les fenêtres suivent la densité de la courbe : 3 semaines et 4 jours sur des photos du lundi, plus large sur
  // une courbe faite de points de fin de mois (sinon l'avant / après restait presque toujours vide).
  const gaps = series.slice(1).map((p, i) => at(p.week) - at(series[i].week)).sort((x, y) => x - y);
  const step = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 7 * 86_400_000;
  const priorWindow = Math.max(21 * 86_400_000, step * 1.5);
  const nearWindow = Math.max(4 * 86_400_000, step / 2);
  const prior = [...series].reverse().find((p) => at(p.week) <= t && t - at(p.week) <= priorWindow) ?? null;
  const after = [7, 30, 60].map((days) => {
    const goal = t + days * 86_400_000;
    const near = series.filter((p) => at(p.week) > t && Math.abs(at(p.week) - goal) <= nearWindow).sort((a, b) => Math.abs(at(a.week) - goal) - Math.abs(at(b.week) - goal))[0];
    if (!near || !prior) return { days, value: near?.value ?? null, changePct: null, good: null };
    const changePct = prior.value ? round(((near.value - prior.value) / Math.abs(prior.value)) * 100) : null;
    const diff = near.value - prior.value;
    return { days, value: near.value, changePct, good: diff === 0 ? null : better === "up" ? diff > 0 : diff < 0 };
  });
  return { before: prior?.value ?? null, after };
}

