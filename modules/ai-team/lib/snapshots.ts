import type { Payload } from "payload";

import { parisNow, periodKey } from "@/modules/ads/agent/followup";
import { loadTracking, type Tracking } from "@/modules/ai-team/lib/objectives";
import { money, r2, weekLabel } from "@/modules/ai-team/lib/format";
import type { Figures, Scorecard } from "@/modules/ai-team/lib/scorecard";
import { cachedScorecard, loadCompetitorNames } from "@/modules/ai-team/lib/shared-data";
import { loadGoogleAds } from "@/modules/analytics/lib/google-ads";
import { loadOpenAiAds } from "@/modules/analytics/lib/openai-ads";

/**
 * La PHOTO DE LA SEMAINE et les TENDANCES qu'on en tire (B2 de
 * l'apprentissage, 12/11/2026). Voir collections/AiTeamSnapshots.
 *
 * Prise le lundi à partir de 7 h (Paris), avant la revue de Margaux, et au
 * plus tard par la revue elle-même si le rythme l'a manquée. Une par semaine
 * (la semaine est unique en base : deux prises simultanées n'en font qu'une).
 */

export type Ads30 = { spend: number; clicks: number; conversions: number; cpc: number | null; costPerConversion: number | null };
export type ChannelFigures = { key: string; label: string; now: Figures };
export type Snapshot = { week: string; channels: ChannelFigures[]; google: Ads30 | null; chatgpt: Ads30 | null; tracking?: Tracking | null; mastery?: Record<string, number> | null; metrics?: Record<string, number | null> | null };

const SNAPSHOT_HOUR = 7;
/** Combien de semaines on relit pour les tendances. */
const TREND_WEEKS = 8;

const ads30 = (spend: number, clicks: number, conversions: number): Ads30 => ({
  spend: r2(spend),
  clicks,
  conversions,
  cpc: clicks ? r2(spend / clicks) : null,
  costPerConversion: conversions ? r2(spend / conversions) : null,
});

/** Prend la photo de la semaine si elle manque. `card` : la fiche déjà calculée, pour ne pas la relire. */
export async function ensureWeeklySnapshot(payload: Payload, now = new Date(), card?: Scorecard | null): Promise<"prise" | "deja" | "pas-encore"> {
  const p = parisNow(now);
  const week = periodKey("hebdomadaire", p);
  const have = await payload.count({ collection: "ai-team-snapshots", where: { week: { equals: week } }, overrideAccess: true });
  if (have.totalDocs) return "deja";
  // Le rythme : le lundi dès 7 h ; la revue (card fourni) peut la prendre n'importe quel jour de la semaine.
  if (card === undefined && !(p.weekday > 1 || p.hour >= SNAPSHOT_HOUR)) return "pas-encore";
  const [fiche, g, o, tracking] = await Promise.all([
    card !== undefined ? card : cachedScorecard(payload, now),
    loadCompetitorNames(payload).then((names) => loadGoogleAds(names, 3, now)).catch(() => null),
    loadOpenAiAds(3, now).catch(() => null),
    loadTracking(payload, now).catch(() => null),
  ]);
  // Le score de maîtrise de chacun, pour sa courbe (import tardif : mastery lit les photos).
  const { loadTeamMastery } = await import("@/modules/ai-team/lib/mastery");
  const team = await loadTeamMastery(payload, fiche ?? null, now);
  const mastery = Object.fromEntries(Object.entries(team).map(([k, v]) => [k, v.mastery.score]));
  try {
    await payload.create({
      collection: "ai-team-snapshots",
      data: {
        week,
        channels: fiche ? fiche.rows.map((r) => ({ key: r.key, label: r.label, now: r.now })) : [],
        google: g?.status === "ok" ? ads30(g.data.last30.cost, g.data.last30.clicks, g.data.last30.conversions) : null,
        chatgpt: o?.status === "ok" ? ads30(o.data.last30.spend, o.data.last30.clicks, o.data.last30.conversions) : null,
        tracking,
        mastery,
      } as never,
      overrideAccess: true,
    });
    return "prise";
  } catch (err) {
    // Une prise simultanée a gagné (semaine unique) : rien à faire.
    const again = await payload.count({ collection: "ai-team-snapshots", where: { week: { equals: week } }, overrideAccess: true });
    if (again.totalDocs) return "deja";
    throw err;
  }
}

/** Les dernières photos, de la plus ancienne à la plus récente. */
export async function loadSnapshots(payload: Payload, weeks = TREND_WEEKS, opts: { history?: boolean } = {}): Promise<Snapshot[]> {
  try {
    // Les photos RECONSTITUÉES (un point par mois, tirées après coup de l'historique : feuille de route) servent aux
    // courbes (`history`), jamais aux tendances semaine après semaine ni à la maîtrise.
    const where = opts.history ? undefined : { reconstituted: { not_equals: true } };
    const res = await payload.find({ collection: "ai-team-snapshots", ...(where ? { where: where as never } : {}), sort: "-week", limit: weeks, depth: 0, overrideAccess: true });
    return (res.docs as unknown as Snapshot[])
      .map((d) => ({ week: String(d.week), channels: Array.isArray(d.channels) ? d.channels : [], google: d.google ?? null, chatgpt: d.chatgpt ?? null, tracking: d.tracking ?? null, mastery: d.mastery ?? null, metrics: d.metrics ?? null }))
      .reverse();
  } catch {
    return [];
  }
}

const pct = (from: number, to: number) => Math.round(((to - from) / from) * 100);
const eur = (n: number) => money(n, n < 10 ? 2 : 0);

/** Une valeur qui bouge d'au moins `threshold` % entre la photo d'il y a `span` semaines et la dernière. */
function move(series: { week: string; v: number | null }[], label: string, span: number, threshold: number): string | null {
  const known = series.filter((x): x is { week: string; v: number } => x.v != null && x.v > 0);
  if (known.length < 2) return null;
  const last = known[known.length - 1];
  const from = known[Math.max(0, known.length - 1 - span)];
  if (from === last) return null;
  const change = pct(from.v, last.v);
  if (Math.abs(change) < threshold) return null;
  return `${label} ${change > 0 ? "a pris" : "a baissé de"} ${Math.abs(change)} % depuis la semaine du ${weekLabel(from.week)} (${eur(from.v)} → ${eur(last.v)}).`;
}

/**
 * Les tendances d'une régie (Google Ads ou ChatGPT Ads), sur les 30 jours
 * glissants des photos successives. Pure (testée).
 */
export function adsTrends(snaps: Snapshot[], platform: "google" | "chatgpt"): string[] {
  const series = snaps.map((s) => ({ week: s.week, a: s[platform] })).filter((x): x is { week: string; a: Ads30 } => x.a != null);
  if (series.length < 2) return [];
  const out: string[] = [];
  // Des semaines d'affilée de dépense sans aucune conversion comptée.
  let dry = 0;
  for (let i = series.length - 1; i >= 0 && series[i].a.spend > 0 && series[i].a.conversions === 0; i -= 1) dry += 1;
  if (dry >= 2) out.push(`${dry}e photo d'affilée sans aucune conversion comptée sur 30 jours, pour ${eur(series[series.length - 1].a.spend)} dépensés : la mesure ou le ciblage ne s'arrange pas.`);
  const cpc = move(series.map((x) => ({ week: x.week, v: x.a.cpc })), "Le coût du clic", 3, 20);
  if (cpc) out.push(cpc);
  const cpa = move(series.map((x) => ({ week: x.week, v: x.a.costPerConversion })), "Le coût par conversion", 3, 25);
  if (cpa) out.push(cpa);
  return out;
}

/** La tendance du coût par lead qualifié d'un canal (fiche des canaux, 3 mois glissants). Pure (testée). */
export function channelTrend(snaps: Snapshot[], key: string): string | null {
  const series = snaps.map((s) => ({ week: s.week, v: s.channels.find((c) => c.key === key)?.now.costPerQualified ?? null }));
  return move(series, "Le coût par lead qualifié", 4, 15);
}

/** Toutes les tendances, par canal, pour Margaux et pour la veille. Pure. */
export function allTrends(snaps: Snapshot[]): Record<string, string[]> {
  const keys = [...new Set(snaps.flatMap((s) => s.channels.map((c) => c.key)))];
  const out: Record<string, string[]> = {};
  for (const k of keys) {
    const lines = [channelTrend(snaps, k), ...(k === "google" || k === "chatgpt" ? adsTrends(snaps, k) : [])].filter((x): x is string => Boolean(x));
    if (lines.length) out[k] = lines;
  }
  return out;
}
