import type { Snapshot } from "@/modules/ai-team/lib/snapshots";

/**
 * LES COURBES DE LA FEUILLE DE ROUTE — les calculs purs (sans base ni réseau), lus aussi par la page dans le navigateur
 * (l'avant / après d'une action). La liste des indicateurs est le catalogue unique (lib/indicators-meta) ; le
 * relevé de la photo du lundi est dans roadmap-metrics.
 */

export type Team = "sea" | "seo" | "com";
/** Une courbe de la photo du lundi : un indicateur du catalogue marqué `weekly` (lib/indicators-meta). */
export type MetricKey = string;

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

