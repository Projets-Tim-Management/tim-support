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
const SCOPE: Record<string, { channel: string | null; benchmarkOf: string } | { tracking: true }> = {
  "chef-sea": { channel: null, benchmarkOf: "chef-sea" },
  "sea-meta": { channel: "meta", benchmarkOf: "sea-meta" },
  "sea-google": { channel: "google", benchmarkOf: "sea-google" },
  "sea-chatgpt": { channel: "chatgpt", benchmarkOf: "sea-chatgpt" },
  "sea-mesure": { tracking: true },
  "sea-stratege": { channel: "meta", benchmarkOf: "sea-meta" },
  "sea-redacteur": { channel: "meta", benchmarkOf: "sea-meta" },
  "sea-directeur-artistique": { channel: "meta", benchmarkOf: "sea-meta" },
  "sea-controleur": { channel: "meta", benchmarkOf: "sea-meta" },
};
export const MASTERY_KEYS = Object.keys(SCOPE);
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
  if (SCOPE[i.key] && "tracking" in SCOPE[i.key]) {
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
    detail: judged ? `${worked} recommandation${worked > 1 ? "s" : ""} sur ${judged} jugée${judged > 1 ? "s" : ""} ont marché (12 semaines).` : "Aucune recommandation encore jugée sur son canal.",
    next: judged && worked === judged ? null : "Des recommandations appliquées, qui marchent, jugées deux semaines après.",
  });

  // Apprentissage
  const learn = i.tests.judged > 0 ? 20 : i.tests.applied > 0 ? 10 : 0;
  parts.push({
    key: "apprentissage",
    label: "Apprentissage",
    max: 20,
    points: learn,
    detail: i.tests.judged ? `${i.tests.judged} de ses idées testée${i.tests.judged > 1 ? "s" : ""} et jugée${i.tests.judged > 1 ? "s" : ""} ce mois-ci.` : i.tests.applied ? "Une de ses idées est en test chez TIM, verdict à venir." : "Aucune de ses idées testée chez TIM ce mois-ci.",
    next: learn === 20 ? null : "Qu'une de ses idées soit retenue par Margaux, appliquée, puis jugée.",
  });

  return { score: parts.reduce((s, p) => s + p.points, 0), parts };
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
    const [members, tracking, photos, verdictsRes, testsRes] = await Promise.all([
      membersByKeys(payload, MASTERY_KEYS),
      loadTracking(payload, now).catch(() => null),
      snaps ?? loadSnapshots(payload, 12),
      payload.find({ collection: "ai-team-requests", where: { and: [{ outcome: { exists: true } }, { verdictAt: since(84) }] }, ...common, select: { channel: true, outcome: true } as never }),
      payload.find({ collection: "ai-team-requests", where: { and: [{ proposedBy: { exists: true } }, { createdAt: since(56) }] }, ...common, select: { proposedBy: true, status: true, outcome: true, verdictAt: true } as never }),
    ]);
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
      const benchmark = "benchmarkOf" in scope ? methods.get(idOfKey.get(scope.benchmarkOf) ?? "")?.benchmark : null;
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
