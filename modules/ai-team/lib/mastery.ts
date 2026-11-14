import type { Payload } from "payload";

import { DAY_MS, money } from "@/modules/ai-team/lib/format";
import { costPerQualified, loadTracking, parseBenchmark, trackingPct } from "@/modules/ai-team/lib/objectives";
import type { Scorecard } from "@/modules/ai-team/lib/scorecard";
import { latestMethods, membersByKeys } from "@/modules/ai-team/lib/shared-data";
import { loadSnapshots, type Snapshot } from "@/modules/ai-team/lib/snapshots";

/**
 * LE SCORE DE MAÎTRISE de chaque agent, sur 100 (B3, décision du 12/11/2026 :
 * « je veux qu'ils soient tous à 100 % et c'est à eux de l'atteindre — mais ils
 * ne le seront jamais : la technologie et les méthodes changent presque chaque
 * jour ; ils doivent être constamment en apprentissage »).
 *
 * La cible est la même pour tous : 100. Personne ne la fixe ; chacun s'en
 * approche par son travail, et redescend s'il s'arrête d'apprendre :
 *
 *  - RÉSULTATS (40) : son coût par lead qualifié face au repère du marché que
 *    rapporte sa veille — au niveau du marché ou mieux : 40 ; deux fois plus
 *    cher : 0. Le repère bouge avec le marché : s'il progresse et pas l'agent,
 *    l'agent perd des points. (Yanis : la part des leads au canal connu.)
 *  - À JOUR (20) : sa veille de la semaine faite : 20 ; −5 par semaine de retard.
 *  - PREUVES (20) : la part des recommandations de son canal qui ont MARCHÉ,
 *    d'après les verdicts des 12 dernières semaines.
 *  - APPRENTISSAGE (20) : ses idées réellement testées chez TIM — un test jugé
 *    dans les 4 dernières semaines : 20 ; appliqué, en attente de verdict : 10.
 *
 * L'ÉQUIPE SEO/GEO (14/11/2026) suit les mêmes quatre parts. Ses résultats :
 * un chiffre de TIM face au repère du marché que rapporte sa veille — la
 * conversion d'une visite gratuite en lead (Serge, Ana, Guy, Paige), la part
 * des réponses d'IA qui nomment TIM (Georges), la part des sites de référence
 * où TIM est présent (Linda), le taux d'interaction des réseaux (Cléo) ; pour
 * Robert, la part des pages indexées (cible 100 %). Ses preuves et son
 * apprentissage : les verdicts de Serge sur les objectifs tirés de son travail.
 *
 * Une part qu'on ne peut pas encore mesurer vaut 0, et la fiche dit ce qui la
 * débloquera. Recalculé à chaque affichage ; photographié chaque lundi pour
 * la courbe.
 */

export type MasteryPartKey = "resultats" | "ajour" | "preuves" | "apprentissage";
export type MasteryPart = { key: MasteryPartKey; label: string; points: number; max: number; detail: string; next: string | null };
export type Mastery = { score: number; parts: MasteryPart[] };

/**
 * Le canal de chacun (null : toute la publicité payante) — celui de ses
 * résultats, de ses preuves et de ses tests. Le studio sert Meta : ses
 * résultats sont ceux de Meta, face au repère du marché de Camille. Yanis
 * (`tracking`) : la part des leads au canal connu.
 */
export type SeoMetric = "conversion" | "indexation" | "ia" | "autorite" | "engagement";
const SEO_METRIC_TEXT: Record<SeoMetric, { what: string; none: string; up: string }> = {
  conversion: { what: "des visites gratuites deviennent un lead", none: "Pas encore de visites gratuites mesurées.", up: "Faire monter la conversion des pages qui reçoivent des visites gratuites." },
  indexation: { what: "des pages contrôlées sont indexées par Google", none: "Pas encore de contrôle de l'indexation.", up: "Que chaque page qui compte soit indexée." },
  ia: { what: "des réponses d'IA nomment TIM", none: "Pas encore de mesure dans les IA ce mois-ci.", up: "Être nommé dans plus de réponses d'IA." },
  autorite: { what: "des sites de référence suivis nomment TIM", none: "Pas encore de cibles d'autorité.", up: "Être présent sur plus de sites de référence." },
  engagement: { what: "d'interactions par vue sur les réseaux", none: "Pas encore de mesure des réseaux.", up: "Des contenus qui font réagir, pas seulement voir." },
};

const SCOPE: Record<string, { channel: string | null; benchmarkOf: string } | { tracking: true } | { seo: SeoMetric }> = {
  "chef-sea": { channel: null, benchmarkOf: "chef-sea" },
  "sea-meta": { channel: "meta", benchmarkOf: "sea-meta" },
  "sea-google": { channel: "google", benchmarkOf: "sea-google" },
  "sea-chatgpt": { channel: "chatgpt", benchmarkOf: "sea-chatgpt" },
  "sea-mesure": { tracking: true },
  "sea-stratege": { channel: "meta", benchmarkOf: "sea-meta" },
  "sea-redacteur": { channel: "meta", benchmarkOf: "sea-meta" },
  "sea-directeur-artistique": { channel: "meta", benchmarkOf: "sea-meta" },
  "sea-controleur": { channel: "meta", benchmarkOf: "sea-meta" },
  "chef-seo": { seo: "conversion" },
  "seo-analyste": { seo: "conversion" },
  "seo-concurrence": { seo: "conversion" },
  "seo-contenu": { seo: "conversion" },
  "seo-visibilite-ia": { seo: "ia" },
  "seo-technique": { seo: "indexation" },
  "seo-autorite": { seo: "autorite" },
  "seo-reseaux": { seo: "engagement" },
};
export const MASTERY_KEYS = Object.keys(SCOPE);
/** Les agents de Margaux (sa revue, sa conversation) et ceux de Serge. */
export const SEA_MASTERY_KEYS = MASTERY_KEYS.filter((k) => !("seo" in SCOPE[k]));
export const SEO_MASTERY_KEYS = MASTERY_KEYS.filter((k) => "seo" in SCOPE[k]);
const channelOf = (key: string) => {
  const s = SCOPE[key];
  return s && "channel" in s ? s.channel : null;
};

export type MasteryInput = {
  key: string;
  /** Son coût par lead qualifié (ou celui du canal qu'il sert) et le repère du marché. */
  cost: number | null;
  benchmark: number | null;
  /** Yanis : la part des leads au canal connu, en %. */
  trackingPct: number | null;
  /** Équipe SEO/GEO : son chiffre de TIM, en % (plus haut = mieux) ; son repère du marché est `benchmark`. */
  seoValue?: number | null;
  lastVeilleAt: string | null;
  /** Verdicts des 12 dernières semaines sur son canal. */
  verdicts: { outcome: string }[];
  /** Ses idées : testées et jugées (4 semaines), appliquées en attente de verdict. */
  tests: { judged: number; applied: number };
  now: Date;
};

/** Pure (testée). */
export function computeMastery(i: MasteryInput): Mastery {
  const parts: MasteryPart[] = [];

  // Résultats
  const scope = SCOPE[i.key];
  const seo = scope && "seo" in scope ? scope.seo : null;
  if (seo) {
    const t = SEO_METRIC_TEXT[seo];
    const v = i.seoValue ?? null;
    // Robert : une cible absolue (100 % des pages) ; les autres : face au repère du marché de leur veille.
    const target = seo === "indexation" ? 100 : i.benchmark;
    const fmt = (n: number) => `${n.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} %`;
    parts.push({
      key: "resultats",
      label: "Résultats",
      max: 40,
      points: v == null || !target ? 0 : Math.round(Math.min(1, v / target) * 40),
      detail: v == null ? t.none : !target ? `${fmt(v)} ${t.what} ; pas encore de repère du marché : sa veille le cherchera.` : `${fmt(v)} ${t.what}, pour ${seo === "indexation" ? "une cible de" : "un marché autour de"} ${fmt(target)}${v >= target ? " : au niveau ou mieux" : ""}.`,
      next: v != null && target && v >= target ? "Rester devant : le marché progresse aussi." : !target && v != null ? "Un repère du marché sourcé, à sa prochaine veille." : t.up,
    });
  } else if (scope && "tracking" in scope) {
    const pct = i.trackingPct;
    parts.push({
      key: "resultats",
      label: "Résultats",
      max: 40,
      points: pct == null ? 0 : Math.round((Math.min(100, pct) / 100) * 40),
      detail: pct == null ? "Aucun lead ces 30 derniers jours : rien à mesurer." : `${pct.toLocaleString("fr-FR", { maximumFractionDigits: 1 })} % des leads des 30 derniers jours ont un canal connu.`,
      next: pct != null && pct >= 100 ? null : "Que chaque lead arrive avec son canal (liens suivis, formulaires).",
    });
  } else if (i.cost == null || i.benchmark == null) {
    parts.push({
      key: "resultats",
      label: "Résultats",
      max: 40,
      points: 0,
      detail: i.cost == null ? "Pas encore de lead qualifié sur son canal : rien à comparer." : "Pas encore de repère du marché : sa veille le cherchera.",
      next: i.cost == null ? "Des leads qualifiés sur son canal." : "Un repère du marché sourcé, à sa prochaine veille.",
    });
  } else {
    const ratio = i.cost / i.benchmark;
    const points = ratio <= 1 ? 40 : ratio >= 2 ? 0 : Math.round((2 - ratio) * 40);
    parts.push({
      key: "resultats",
      label: "Résultats",
      max: 40,
      points,
      detail: `${money(i.cost)} par lead qualifié, pour un marché autour de ${money(i.benchmark)}${ratio > 1 ? ` (${ratio.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}× le marché)` : " : au niveau du marché ou mieux"}.`,
      next: points >= 40 ? "Rester devant le marché : il progresse aussi." : `Descendre vers ${money(i.benchmark)} par lead qualifié.`,
    });
  }

  // À jour
  const days = i.lastVeilleAt ? (i.now.getTime() - Date.parse(i.lastVeilleAt)) / DAY_MS : null;
  const late = days == null ? null : Math.max(0, Math.ceil(days / 7) - 1);
  parts.push({
    key: "ajour",
    label: "À jour",
    max: 20,
    points: late == null ? 0 : Math.max(0, 20 - 5 * late),
    detail: days == null ? "Aucune veille encore." : days < 1 ? "Veille faite aujourd'hui." : `Dernière veille il y a ${Math.floor(days)} jour${Math.floor(days) > 1 ? "s" : ""}.`,
    next: late === 0 ? null : "Sa veille de la semaine (dimanche soir, ou maintenant).",
  });

  // Preuves
  const judged = i.verdicts.length;
  const worked = i.verdicts.filter((v) => v.outcome === "a-marche").length;
  parts.push({
    key: "preuves",
    label: "Preuves",
    max: 20,
    points: judged ? Math.round((worked / judged) * 20) : 0,
    detail: judged ? `${worked} ${seo ? "objectif" : "recommandation"}${worked > 1 ? "s" : ""} sur ${judged} jugé${seo ? "" : "e"}${judged > 1 ? "s" : ""} ont marché (12 semaines).` : seo ? "Aucun objectif tiré de son travail encore jugé." : "Aucune recommandation encore jugée sur son canal.",
    next: judged && worked === judged ? null : seo ? "Des objectifs tirés de son travail, faits, qui marchent — jugés par Serge deux semaines après." : "Des recommandations appliquées, qui marchent, jugées deux semaines après.",
  });

  // Apprentissage
  const learn = i.tests.judged > 0 ? 20 : i.tests.applied > 0 ? 10 : 0;
  parts.push({
    key: "apprentissage",
    label: "Apprentissage",
    max: 20,
    points: learn,
    detail: i.tests.judged ? `${i.tests.judged} de ses idées testée${i.tests.judged > 1 ? "s" : ""} et jugée${i.tests.judged > 1 ? "s" : ""} ce mois-ci.` : i.tests.applied ? "Une de ses idées est en test chez TIM, verdict à venir." : "Aucune de ses idées testée chez TIM ce mois-ci.",
    next: learn === 20 ? null : seo ? "Que Serge reprenne une de ses actions en objectif, que la direction la fasse, puis qu'elle soit jugée." : "Qu'une de ses idées soit retenue par Margaux, appliquée, puis jugée.",
  });

  return { score: parts.reduce((s, p) => s + p.points, 0), parts };
}

/**
 * Les chiffres de TIM de l'équipe SEO/GEO, en % (null : pas encore mesuré). Lus seulement si un agent SEO est à
 * noter ; chaque source est déjà gardée en cache ou en base (rapports des agents). Ne lève pas.
 */
async function loadSeoValues(payload: Payload, now: Date): Promise<Record<SeoMetric, number | null>> {
  const ratio = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
  const safe = <T>(p: Promise<T>) => p.catch(() => null);
  const [funnel, tech, visibility, authority, social] = await Promise.all([
    safe(import("@/modules/ai-team/lib/funnel").then((m) => m.loadFunnel(payload, now))),
    safe(import("@/modules/ai-team/lib/site-health").then((m) => m.latestTech(payload, now))),
    safe(import("@/modules/ai-team/lib/ai-visibility").then((m) => m.visibilityState(payload, now))),
    safe(import("@/modules/ai-team/lib/authority").then((m) => m.latestAuthority(payload, now))),
    safe(import("@/modules/ai-team/lib/social").then((m) => m.latestSocial(payload, now))),
  ]);
  const h = tech?.health ?? null;
  const nets = social?.measure?.networks ?? [];
  const sum = (f: (n: (typeof nets)[number]) => number | null | undefined) => nets.reduce((t, n) => t + (f(n) ?? 0), 0);
  const targets = authority?.findings ?? [];
  return {
    conversion: funnel && funnel.totals.sessions ? funnel.totals.leadRate : null,
    indexation: h && h.indexed != null && h.inspected ? ratio(h.indexed, h.inspected) : null,
    ia: visibility?.measure.answers ? visibility.measure.overall.mentionPct : null,
    autorite: targets.length ? ratio(targets.filter((t) => t.state === "present").length, targets.length) : null,
    engagement: nets.length ? ratio(sum((n) => n.interactions), sum((n) => n.views)) : null,
  };
}

export type MemberMastery = { name: string; mastery: Mastery; history: { week: string; score: number }[] };
export type TeamMastery = Record<string, MemberMastery>;

type Raw = Record<string, unknown>;

/**
 * Le score de toute l'équipe, maintenant, et sa courbe (photos du lundi).
 * `snaps` : les photos déjà lues par l'appelant, pour ne pas les relire. Ne lève pas.
 */
export async function loadTeamMastery(payload: Payload, card: Scorecard | null, now = new Date(), snaps?: Snapshot[]): Promise<TeamMastery> {
  try {
    const common = { pagination: false, depth: 0, overrideAccess: true } as const;
    const since = (days: number) => ({ greater_than_equal: new Date(now.getTime() - days * DAY_MS).toISOString() });
    const [members, tracking, photos, verdictsRes, testsRes, objectivesRes] = await Promise.all([
      membersByKeys(payload, MASTERY_KEYS),
      loadTracking(payload, now).catch(() => null),
      snaps ?? loadSnapshots(payload, 12),
      payload.find({ collection: "ai-team-requests", where: { and: [{ outcome: { exists: true } }, { verdictAt: since(84) }] }, ...common, select: { channel: true, outcome: true } as never }),
      payload.find({ collection: "ai-team-requests", where: { and: [{ proposedBy: { exists: true } }, { createdAt: since(56) }] }, ...common, select: { proposedBy: true, status: true, outcome: true, verdictAt: true } as never }),
      // L'équipe SEO/GEO : les objectifs de Serge des 12 dernières semaines (qui les a proposés, ce qu'ils ont donné).
      payload.find({ collection: "ai-team-objectives", where: { createdAt: since(84) }, ...common, select: { proposedBy: true, status: true, outcome: true, verdictAt: true } as never }).catch(() => ({ docs: [] })),
    ]);
    const objectives = objectivesRes.docs as unknown as Raw[];
    const seoValues = members.some((m) => SCOPE[m.key] && "seo" in SCOPE[m.key]) ? await loadSeoValues(payload, now) : null;
    const verdicts = verdictsRes.docs as unknown as Raw[];
    const tests = testsRes.docs as unknown as Raw[];
    // Dernière veille réussie et repère du marché de chacun (sans le texte des méthodes).
    const methods = await latestMethods(payload, members.map((m) => m.id));
    const idOfKey = new Map(members.map((m) => [m.key, String(m.id)]));
    const rows = card ? card.rows.map((r) => ({ key: r.key, now: r.now })) : [];
    const pct = trackingPct(tracking);
    const recentJudged = now.getTime() - 28 * DAY_MS;
    const out: TeamMastery = {};
    for (const m of members) {
      const scope = SCOPE[m.key];
      const channel = channelOf(m.key);
      const own = methods.get(String(m.id));
      const benchmark = "benchmarkOf" in scope ? methods.get(idOfKey.get(scope.benchmarkOf) ?? "")?.benchmark : "seo" in scope ? own?.benchmark : null;
      if ("seo" in scope) {
        // Ses objectifs : ceux qui reprenaient son action (tous, pour Serge).
        const mine = objectives.filter((o) => m.key === "chef-seo" || o.proposedBy === m.key);
        const mastery = computeMastery({
          key: m.key,
          cost: null,
          benchmark: parseBenchmark(benchmark)?.valeur ?? null,
          trackingPct: null,
          seoValue: seoValues?.[scope.seo] ?? null,
          lastVeilleAt: own ? String(own.createdAt) : null,
          verdicts: mine.filter((o) => o.outcome && Date.parse(String(o.verdictAt ?? "")) >= now.getTime() - 84 * DAY_MS).map((o) => ({ outcome: String(o.outcome) })),
          tests: {
            judged: mine.filter((o) => o.outcome && Date.parse(String(o.verdictAt ?? "")) >= recentJudged).length,
            applied: mine.filter((o) => o.status === "fait" && !o.outcome).length,
          },
          now,
        });
        out[m.key] = { name: m.name, mastery, history: photos.flatMap((s) => (typeof s.mastery?.[m.key] === "number" ? [{ week: s.week, score: s.mastery[m.key] }] : [])) };
        continue;
      }
      const mastery = computeMastery({
        key: m.key,
        cost: "channel" in scope ? costPerQualified(rows, scope.channel) : null,
        benchmark: parseBenchmark(benchmark)?.valeur ?? null,
        trackingPct: pct,
        lastVeilleAt: own ? String(own.createdAt) : null,
        verdicts: verdicts.filter((v) => channel == null || v.channel === channel || v.channel === "tous").map((v) => ({ outcome: String(v.outcome) })),
        tests: {
          judged: tests.filter((t) => t.proposedBy === m.key && t.outcome && Date.parse(String(t.verdictAt ?? "")) >= recentJudged).length,
          applied: tests.filter((t) => t.proposedBy === m.key && (t.status === "faite" || t.status === "repondue") && !t.outcome).length,
        },
        now,
      });
      const history = photos.flatMap((s) => (typeof s.mastery?.[m.key] === "number" ? [{ week: s.week, score: s.mastery[m.key] }] : []));
      out[m.key] = { name: m.name, mastery, history };
    }
    return out;
  } catch (err) {
    payload.logger?.warn?.(`[équipe IA] score de maîtrise illisible : ${err}`);
    return {};
  }
}

/** Ce que Margaux et la veille lisent d'un score. Pure. */
export function masteryForModel(x: MemberMastery) {
  const prev = x.history.length >= 2 ? x.history[x.history.length - 2].score : null;
  return {
    agent: x.name,
    maitriseSur100: x.mastery.score,
    evolutionDepuisLundiDernier: prev == null ? null : x.mastery.score - prev,
    parts: x.mastery.parts.map((p) => ({ part: p.label, points: `${p.points}/${p.max}`, constat: p.detail, pourGagnerDesPoints: p.next })),
  };
}
