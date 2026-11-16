import type { Payload } from "payload";

import { idOf } from "@/core/lib/relations";
import { addMonths, DAY_MS, parisDay } from "@/modules/ai-team/lib/format";
import { HORIZON_MONTHS, WHO_LABEL, type Horizon } from "@/modules/ai-team/lib/roadmap-constants";
import { OFFICES, teamOfKey } from "@/modules/ai-team/lib/veille-domains";

export { HORIZON_MONTHS, type Horizon };
import { INDICATORS, indicatorOf, WEEKLY_INDICATORS } from "@/modules/ai-team/lib/indicators-meta";
import { initialMeasures, measureContext, type Measure } from "@/modules/ai-team/lib/indicators";
import { metricSeries, type SeriesPoint, type Team } from "@/modules/ai-team/lib/roadmap-calc";
import { loadSnapshots } from "@/modules/ai-team/lib/snapshots";

/**
 * LA FEUILLE DE ROUTE (14/11/2026) — « une roadmap des actions réalisées à
 * telle date, des objectifs à court, moyen et long terme, et pouvoir analyser
 * si telle action a fait progresser ».
 *
 * Comme les meilleurs outils (annotations de Google Ads et d'Analytics,
 * avant / après de SEOTesting ou SEOcrawl) : les actions datées posées sur la
 * courbe des résultats, l'avant / après de chacune à 7, 30 et 60 jours, et le
 * verdict du chef — qui reste prudent : un avant / après ne prouve rien seul.
 *
 * LES OBJECTIFS (collection ai-team-goals) : chiffrés (un indicateur, une
 * cible) ou jalons (un livrable daté) ; fixés par la direction, ou proposés par
 * les chefs puis validés. LES ACTIONS : celles des agents (objectifs de Serge,
 * recommandations de Margaux, décisions du carnet) et celles des ÉQUIPES
 * HUMAINES (collection ai-team-actions), prévues ou faites, chacune avec
 * l'objectif qu'elle sert. Tous les agents lisent les objectifs et les actions
 * humaines (roadmapBlock) : ils travaillent pour les atteindre.
 */

export type GoalTeam = Team | "tous";
const TEAM_CHIEF: Record<Team, string> = { sea: OFFICES.sea.chief, seo: OFFICES.seo.chief, com: OFFICES.com.chief };

type Raw = Record<string, unknown>;

export type GoalView = {
  id: string;
  team: GoalTeam;
  horizon: Horizon;
  kind: "chiffre" | "jalon";
  title: string;
  /** La clé du catalogue des indicateurs (indicators-meta), et son paramètre (la page suivie). */
  metric: string | null;
  param: string | null;
  baseline: number | null;
  target: number | null;
  current: number | null;
  /** La courbe propre à l'objectif : son passé, ses relevés, ses saisies. */
  series: SeriesPoint[];
  dueDate: string;
  startDate: string | null;
  status: string;
  /** La part du chemin parcourue, de 0 à 100 ; null sans point de départ ou sans valeur du jour. */
  progress: number | null;
  /** Où il en est face au temps écoulé. */
  pace: "atteint" | "avance" | "dans-les-temps" | "retard" | null;
  why: string | null;
  review: string | null;
  reviewedAt: string | null;
  by: string | null;
};

/** La progression d'un objectif chiffré et son allure face au temps écoulé. Pure (testée). */
export function goalProgress(g: { baseline: number | null; target: number; current: number | null; startDate: string | null; dueDate: string }, better: "up" | "down", now: Date): { progress: number | null; pace: GoalView["pace"] } {
  if (g.current == null || g.baseline == null) return { progress: null, pace: null };
  const reached = better === "up" ? g.current >= g.target : g.current <= g.target;
  if (reached) return { progress: 100, pace: "atteint" };
  const span = g.target - g.baseline;
  const progress = span === 0 ? 0 : Math.max(0, Math.min(100, Math.round(((g.current - g.baseline) / span) * 100)));
  const start = Date.parse(g.startDate ?? "");
  const due = Date.parse(g.dueDate);
  if (!Number.isFinite(start) || !Number.isFinite(due) || due <= start) return { progress, pace: null };
  const expected = Math.max(0, Math.min(100, ((now.getTime() - start) / (due - start)) * 100));
  return { progress, pace: progress >= expected + 15 ? "avance" : progress >= expected - 10 ? "dans-les-temps" : "retard" };
}

const measuresOf = (d: Raw): Measure[] => (Array.isArray(d.measures) ? (d.measures as Measure[]) : []).filter((m) => m && typeof m.value === "number" && m.at).sort((a, b) => a.at.localeCompare(b.at));

function toGoal(d: Raw, names: Map<string, string>, now: Date): GoalView | null {
  const kind = d.kind === "jalon" ? "jalon" : "chiffre";
  const meta = kind === "chiffre" ? indicatorOf(String(d.metric)) : undefined;
  if (kind === "chiffre" && (!meta || typeof d.target !== "number")) return null;
  const startDate = d.startDate ? String(d.startDate) : d.createdAt ? String(d.createdAt) : null;
  const dueDate = String(d.dueDate ?? "");
  const status = String(d.status ?? "propose");
  const measures = measuresOf(d);
  const base = { baseline: typeof d.baseline === "number" ? d.baseline : null, target: typeof d.target === "number" ? d.target : null, current: measures.at(-1)?.value ?? null };
  let progress: number | null = null;
  let pace: GoalView["pace"] = null;
  if (meta && base.target != null) ({ progress, pace } = goalProgress({ ...base, target: base.target, startDate, dueDate }, meta.better, now));
  // Un jalon : atteint quand on le coche ; en retard si l'échéance est passée.
  if (kind === "jalon") pace = status === "atteint" ? "atteint" : Date.parse(dueDate) < now.getTime() ? "retard" : null;
  return {
    id: String(d.id),
    team: (d.team as GoalTeam) ?? "tous",
    horizon: d.horizon as Horizon,
    kind,
    title: String(d.title ?? ""),
    metric: meta?.key ?? null,
    param: (d.param as string | null) ?? null,
    ...base,
    series: measures.map((m) => ({ week: m.at.slice(0, 10), value: m.value })),
    dueDate,
    startDate,
    status,
    progress,
    pace,
    why: (d.why as string | null) ?? null,
    review: (d.review as string | null) ?? null,
    reviewedAt: d.reviewedAt ? String(d.reviewedAt) : null,
    by: d.member != null ? (names.get(String(idOf(d.member))) ?? null) : d.author != null ? "Direction" : null,
  };
}

export type ActionView = {
  id: string;
  team: GoalTeam;
  /** La date qui compte : faite le, ou prévue pour le. */
  date: string;
  status: "faite" | "prevue" | "en-cours";
  title: string;
  /** Le type d'action (contenu, technique, Meta, développement…) : ce qui sert au bilan « ce qui marche ». */
  type: string;
  by: string | null;
  /** Une action d'une équipe humaine (pas d'un agent). */
  human: boolean;
  /**
   * La famille, qui donne sa couleur sur la frise : « vous » — ce que les agents confient à la direction (objectifs de
   * la semaine de Serge, demandes de Margaux) ; « ia » — ce que les agents font eux-mêmes (rapports, décisions) ;
   * « equipe » — les actions des équipes humaines.
   */
  kind: "vous" | "ia" | "equipe";
  source: "objectif" | "recommandation" | "decision" | "equipe" | "rapport";
  /** Une demande de Margaux : « a-faire » se coche, « question » se tranche dans « Vos demandes ». */
  requestKind?: "a-faire" | "question";
  goal: string | null;
  outcome: "a-marche" | "sans-effet" | "a-empire" | null;
  verdict: string | null;
  href: string;
  /** Le contenu de la tâche, pour sa fiche : ce qu'on voit, pourquoi, les étapes (et leurs prompts), ce qu'on mesurera. */
  detail?: TaskDetail;
};

export type TaskStep = { text: string; minutes: number | null; prompt: string | null; done: boolean };
export type TaskDetail = { diagnosis?: string | null; why?: string | null; measure?: string | null; page?: string | null; minutes?: number | null; steps?: TaskStep[]; question?: string | null; url?: string | null; notes?: string | null; summary?: string | null };

/** Les étapes d'une tâche, quelle que soit leur forme en base (objets ou simples textes). Pure. */
const stepsOf = (v: unknown): TaskStep[] =>
  (Array.isArray(v) ? v : []).flatMap((x) =>
    typeof x === "string" ? [{ text: x, minutes: null, prompt: null, done: false }] : x && typeof x === "object" && (x as Raw).text ? [{ text: String((x as Raw).text), minutes: typeof (x as Raw).minutes === "number" ? ((x as Raw).minutes as number) : null, prompt: ((x as Raw).prompt as string | null) || null, done: Boolean((x as Raw).done) }] : [],
  );

const AGENT_TYPE: Record<string, string> = { "seo-contenu": "Contenu", "seo-technique": "Technique", "seo-autorite": "Autorité", "seo-visibilite-ia": "Visibilité IA", "seo-reseaux": "Réseaux & vidéo", "seo-analyste": "Conversion", "seo-concurrence": "Concurrence" };
const REPORT_LABEL: Record<string, string> = { site: "Audit du site", concurrence: "Rapport de concurrence", contenu: "Plan de contenu", ia: "Visibilité dans les IA", technique: "Contrôle technique", autorite: "Autorité", reseaux: "Réseaux & vidéo", pipeline: "Point du pipeline", conversion: "Revue de la conversion", essais: "Point des essais", sante: "Santé des clients" };
const CHANNEL_TYPE: Record<string, string> = { meta: "Meta Ads", google: "Google Ads", chatgpt: "ChatGPT Ads", seo: "SEO", tous: "Budget & arbitrages" };

export type RoadmapView = {
  goals: GoalView[];
  actions: ActionView[];
  series: Record<string, SeriesPoint[]>;
  /** Par type d'action : combien ont marché, sur combien jugées. */
  works: { team: GoalTeam; type: string; worked: number; judged: number; pending: number }[];
  lastWeek: string | null;
  today: string;
};

/** Le bilan « ce qui marche chez TIM », par type d'action faite. Pure (testée). */
export function whatWorks(actions: ActionView[]): RoadmapView["works"] {
  const by = new Map<string, RoadmapView["works"][number]>();
  for (const a of actions) {
    if (a.source === "decision" || a.source === "rapport" || a.status !== "faite") continue;
    const k = `${a.team}|${a.type}`;
    const row = by.get(k) ?? { team: a.team, type: a.type, worked: 0, judged: 0, pending: 0 };
    if (a.outcome) {
      row.judged += 1;
      if (a.outcome === "a-marche") row.worked += 1;
    } else row.pending += 1;
    by.set(k, row);
  }
  return [...by.values()].sort((a, b) => b.judged - a.judged || b.worked - a.worked);
}

const outcomeOf = (v: unknown): ActionView["outcome"] => (v === "a-marche" || v === "sans-effet" || v === "a-empire" ? v : null);
const goalOf = (v: unknown) => (v == null ? null : String(idOf(v)));

/** Tout ce que la page lit : objectifs, actions (12 mois passés, et à venir), courbes de chaque indicateur, bilan. */
export async function loadRoadmap(payload: Payload, now = new Date()): Promise<RoadmapView> {
  const common = { pagination: false, depth: 0, overrideAccess: true } as const;
  const since = new Date(now.getTime() - 400 * DAY_MS).toISOString();
  const safe = <T>(p: Promise<{ docs: T[] }>) => p.then((r) => r.docs).catch(() => [] as T[]);
  const [snaps, members, goals, objectives, requests, decisions, human, reports] = await Promise.all([
    loadSnapshots(payload, 80, { history: true }),
    safe(payload.find({ collection: "ai-team-members", ...common, select: { key: true, name: true } as never })),
    safe(payload.find({ collection: "ai-team-goals", where: { or: [{ status: { not_equals: "abandonne" } }, { updatedAt: { greater_than_equal: new Date(now.getTime() - 90 * DAY_MS).toISOString() } }] }, sort: "dueDate", ...common })),
    // Les objectifs de Serge : faits (avec leur verdict) et à faire (prévus).
    safe(payload.find({ collection: "ai-team-objectives", where: { or: [{ and: [{ status: { equals: "fait" } }, { closedAt: { greater_than_equal: since } }] }, { status: { equals: "a-faire" } }] }, sort: "-closedAt", ...common, select: { title: true, status: true, closedAt: true, dueDate: true, proposedBy: true, goal: true, outcome: true, verdict: true, diagnosis: true, why: true, measure: true, page: true, minutes: true, steps: true } as never })),
    // Les demandes des chefs : ouvertes (ce qui attend la direction) et closes depuis 12 mois.
    safe(payload.find({ collection: "ai-team-requests", where: { or: [{ status: { equals: "ouverte" } }, { and: [{ status: { in: ["faite", "repondue"] } }, { closedAt: { greater_than_equal: since } }] }] }, sort: "-createdAt", ...common, select: { member: true, kind: true, status: true, title: true, createdAt: true, closedAt: true, channel: true, proposedBy: true, goal: true, outcome: true, verdict: true, why: true, url: true, steps: true, question: true } as never })),
    safe(payload.find({ collection: "ai-team-notes", where: { and: [{ kind: { equals: "decision" } }, { createdAt: { greater_than_equal: since } }] }, sort: "-createdAt", ...common, select: { member: true, text: true, createdAt: true } as never })),
    // Les actions humaines : à venir, ou faites depuis 12 mois.
    safe(payload.find({ collection: "ai-team-actions", where: { and: [{ status: { not_equals: "abandonnee" } }, { or: [{ status: { not_equals: "faite" } }, { doneDate: { greater_than_equal: since } }, { doneDate: { exists: false } }] }] }, sort: "-updatedAt", ...common, select: { title: true, who: true, team: true, status: true, plannedDate: true, doneDate: true, goal: true, notes: true, outcome: true, verdict: true, createdAt: true, updatedAt: true } as never })),
    // Le travail des agents eux-mêmes : leurs rapports faits.
    safe(payload.find({ collection: "ai-team-audits", where: { and: [{ status: { equals: "fait" } }, { createdAt: { greater_than_equal: since } }] }, sort: "-createdAt", ...common, select: { member: true, kind: true, createdAt: true, summary: true } as never })),
  ]);
  const m = members as unknown as Raw[];
  const nameById = new Map(m.map((x) => [String(x.id), String(x.name)]));
  const nameByKey = new Map(m.map((x) => [String(x.key), String(x.name)]));
  const keyById = new Map(m.map((x) => [String(x.id), String(x.key)]));
  // Le bureau de chaque agent (SEA, SEO/GEO, commercial), d'après sa clé.
  const teamById = new Map(m.map((x) => [String(x.id), teamOfKey(String(x.key)) as Team]));

  const actions: ActionView[] = [
    ...(objectives as unknown as Raw[]).flatMap((o) => {
      const done = o.status === "fait";
      const date = done ? o.closedAt : o.dueDate;
      if (!date) return [];
      return [
        {
          id: `o${o.id}`,
          team: "seo" as GoalTeam,
          date: String(date),
          status: (done ? "faite" : "prevue") as ActionView["status"],
          title: String(o.title ?? ""),
          type: AGENT_TYPE[String(o.proposedBy ?? "")] ?? "Pilotage SEO",
          by: o.proposedBy ? `${nameByKey.get(TEAM_CHIEF.seo) ?? "Serge"} · idée de ${nameByKey.get(String(o.proposedBy)) ?? o.proposedBy}` : (nameByKey.get(TEAM_CHIEF.seo) ?? null),
          human: false,
          kind: "vous" as const,
          source: "objectif" as const,
          goal: goalOf(o.goal),
          outcome: outcomeOf(o.outcome),
          verdict: (o.verdict as string | null) ?? null,
          href: `/admin/collections/ai-team-objectives/${o.id}`,
          detail: { diagnosis: (o.diagnosis as string | null) ?? null, why: (o.why as string | null) ?? null, measure: (o.measure as string | null) ?? null, page: (o.page as string | null) ?? null, minutes: typeof o.minutes === "number" ? o.minutes : null, steps: stepsOf(o.steps) },
        },
      ];
    }),
    ...(requests as unknown as Raw[]).map((r) => ({
      id: `r${r.id}`,
      team: teamById.get(String(idOf(r.member))) ?? ("sea" as GoalTeam),
      date: String(r.status === "ouverte" ? r.createdAt : (r.closedAt ?? r.createdAt)),
      status: (r.status === "ouverte" ? "prevue" : "faite") as ActionView["status"],
      title: String(r.title ?? ""),
      type: CHANNEL_TYPE[String(r.channel ?? "tous")] ?? "Budget & arbitrages",
      by: nameById.get(String(idOf(r.member))) ?? null,
      human: false,
      kind: "vous" as const,
      requestKind: (r.kind === "question" ? "question" : "a-faire") as ActionView["requestKind"],
      source: "recommandation" as const,
      goal: goalOf(r.goal),
      outcome: outcomeOf(r.outcome),
      verdict: (r.verdict as string | null) ?? null,
      href: r.status === "ouverte" ? "/admin/equipe-ia" : `/admin/collections/ai-team-requests/${r.id}`,
      detail: { why: (r.why as string | null) ?? null, url: (r.url as string | null) ?? null, steps: stepsOf(r.steps), question: (r.question as string | null) ?? null },
    })),
    ...(decisions as unknown as Raw[]).map((d) => ({
      id: `d${d.id}`,
      team: teamById.get(String(idOf(d.member))) ?? ("sea" as GoalTeam),
      date: String(d.createdAt),
      status: "faite" as const,
      title: String(d.text ?? ""),
      type: "Décision",
      by: nameById.get(String(idOf(d.member))) ?? null,
      human: false,
      kind: "ia" as const,
      source: "decision" as const,
      goal: null,
      outcome: null,
      verdict: null,
      href: `/admin/collections/ai-team-notes/${d.id}`,
    })),
    ...(human as unknown as Raw[]).flatMap((a) => {
      const done = a.status === "faite";
      const date = done ? (a.doneDate ?? a.plannedDate ?? a.updatedAt) : (a.plannedDate ?? a.createdAt);
      return [
        {
          id: `a${a.id}`,
          team: (a.team as GoalTeam) ?? "tous",
          date: String(date),
          status: (done ? "faite" : a.status === "en-cours" ? "en-cours" : "prevue") as ActionView["status"],
          title: String(a.title ?? ""),
          type: WHO_LABEL[String(a.who ?? "autre")] ?? "Autre",
          by: WHO_LABEL[String(a.who ?? "autre")] ?? null,
          human: true,
          kind: "equipe" as const,
          source: "equipe" as const,
          goal: goalOf(a.goal),
          outcome: outcomeOf(a.outcome),
          verdict: (a.verdict as string | null) ?? null,
          href: `/admin/collections/ai-team-actions/${a.id}`,
          detail: { notes: (a.notes as string | null) ?? null },
        },
      ];
    }),
    ...(reports as unknown as Raw[]).map((r) => {
      const key = keyById.get(String(idOf(r.member))) ?? "";
      return {
        id: `p${r.id}`,
        team: teamOfKey(key) as GoalTeam,
        date: String(r.createdAt),
        status: "faite" as const,
        title: `${REPORT_LABEL[String(r.kind)] ?? "Rapport"} — ${String(r.summary ?? "").split(/(?<=[.!?])\s/)[0].slice(0, 140)}`,
        type: REPORT_LABEL[String(r.kind)] ?? "Rapport",
        by: nameById.get(String(idOf(r.member))) ?? null,
        human: false,
        kind: "ia" as const,
        source: "rapport" as const,
        goal: null,
        outcome: null,
        verdict: null,
        href: `/admin/equipe-ia?membre=${key}`,
        detail: { summary: (r.summary as string | null) ?? null },
      };
    }),
  ].sort((a, b) => Date.parse(b.date) - Date.parse(a.date));

  return {
    goals: (goals as unknown as Raw[]).flatMap((g) => toGoal(g, nameById, now) ?? []),
    actions,
    series: Object.fromEntries(WEEKLY_INDICATORS.map((x) => [x.key, metricSeries(snaps, x.key)])),
    works: whatWorks(actions),
    lastWeek: snaps.at(-1)?.week ?? null,
    today: parisDay(now),
  };
}

/* ─── Ce que les agents en lisent, et ce que les chefs proposent ────────── */

const inTeam = (team: Team) => ({ team: { in: [team, "tous"] } });

/** Les objectifs en cours et les actions humaines d'une équipe, tels que les agents les lisent. */
export async function roadmapForModel(payload: Payload, team: Team, now = new Date()) {
  const common = { pagination: false, depth: 0, overrideAccess: true } as const;
  const [goals, human] = await Promise.all([
    payload.find({ collection: "ai-team-goals", where: { and: [inTeam(team), { status: { in: ["propose", "valide", "atteint", "manque"] } }] }, sort: "dueDate", ...common }).then((r) => r.docs as unknown as Raw[]).catch(() => [] as Raw[]),
    payload.find({ collection: "ai-team-actions", where: { and: [inTeam(team), { or: [{ status: { in: ["prevue", "en-cours"] } }, { doneDate: { greater_than_equal: new Date(now.getTime() - 90 * DAY_MS).toISOString() } }] }] }, sort: "plannedDate", ...common }).then((r) => r.docs as unknown as Raw[]).catch(() => [] as Raw[]),
  ]);
  const views = goals.flatMap((g) => toGoal(g, new Map(), now) ?? []);
  return {
    objectifs: views.map((g) => ({
      id: g.id,
      horizon: g.horizon,
      sorte: g.kind,
      etat: g.status,
      objectif: g.title,
      ...(g.kind === "chiffre" ? { indicateur: `${indicatorOf(g.metric)?.label ?? g.metric}${g.param ? ` (${g.param})` : ""}`, depart: g.baseline, cible: g.target, aujourdhui: g.current, progressionPct: g.progress, courbe: g.series.slice(-8).map((p) => `${p.week} : ${p.value}`) } : {}),
      allure: g.pace,
      echeance: g.dueDate.slice(0, 10),
      fixePar: g.by,
      dernierPoint: g.review,
      pointDuMois: g.status === "valide" && monthlyPointDue(g.reviewedAt, now),
    })),
    actionsDesEquipesHumaines: human.map((a) => ({
      id: `action-${a.id}`,
      action: a.title,
      qui: WHO_LABEL[String(a.who ?? "autre")] ?? "Autre",
      etat: a.status,
      prevueLe: a.plannedDate ? String(a.plannedDate).slice(0, 10) : null,
      faiteLe: a.doneDate ? String(a.doneDate).slice(0, 10) : null,
      sertObjectif: a.goal != null ? String(idOf(a.goal)) : null,
      detail: a.notes ?? null,
      verdict: a.outcome ? { resultat: a.outcome, lecon: a.verdict ?? "" } : null,
    })),
  };
}

/** Les objectifs de son équipe et les indicateurs disponibles, avec leur valeur du jour, pour la revue du chef. */
export async function goalsForChief(payload: Payload, team: Team, now = new Date()) {
  const road = await roadmapForModel(payload, team, now);
  // Les indicateurs qu'il peut proposer, avec leur valeur du jour (les sources sont en cache).
  const ctx = measureContext(payload, now);
  const available = INDICATORS.filter((x) => x.teams.includes(team) && !x.param);
  const values = await Promise.all(available.map((x) => ctx.measure(x.key, now).catch(() => null)));
  return {
    mesObjectifsAHorizon: road.objectifs,
    actionsDesEquipesHumaines: road.actionsDesEquipesHumaines,
    indicateursDisponibles: available.map((x, i) => ({ cle: x.key, famille: x.group, nom: x.label, unite: x.unit, mieux: x.better === "up" ? "plus haut" : "plus bas", ceQueCestMesure: x.help, valeurDuJour: values[i] })),
  };
}

/**
 * Le bloc joint à la consigne de CHAQUE agent (sous-agents compris) : les objectifs de son équipe et ce que les
 * équipes humaines font. Vide s'il n'y a rien. Pure.
 */
export function roadmapBlock(road: Awaited<ReturnType<typeof roadmapForModel>> | null): string {
  if (!road) return "";
  const goals = road.objectifs.filter((g) => g.etat === "valide" || g.etat === "propose");
  const human = road.actionsDesEquipesHumaines.filter((a) => a.etat !== "faite").slice(0, 10);
  if (!goals.length && !human.length) return "";
  const lines = [
    "\n\nLA FEUILLE DE ROUTE DE TON ÉQUIPE — ton travail sert ces objectifs : fais tout pour les atteindre, et dis lequel chacune de tes actions fait avancer.",
    ...goals.map((g) => `- [${g.horizon} terme, échéance ${g.echeance}${g.etat === "propose" ? ", proposé" : ""}] ${g.objectif}${g.sorte === "chiffre" ? ` — ${g.indicateur} : ${g.aujourdhui ?? "?"} aujourd'hui, cible ${g.cible}` : " (jalon)"}${g.allure ? ` (${g.allure})` : ""}`),
  ];
  if (human.length) lines.push("Ce que les équipes humaines de TIM ont prévu (n'en fais pas un doublon, appuie-les) :", ...human.map((a) => `- ${a.qui} : ${a.action}${a.prevueLe ? ` (prévue le ${a.prevueLe})` : ""}`));
  return lines.join("\n");
}

/** Les règles des objectifs à horizon, pour la consigne du chef. */
export const GOAL_RULES = [
  "TA FEUILLE DE ROUTE (feuilleDeRoute.mesObjectifsAHorizon) : les objectifs de ton équipe à court terme (3 mois), moyen terme (6 mois) et long terme (12 mois) — chiffrés (un indicateur de indicateursDisponibles, une cible) ou jalons (un livrable daté). Ceux fixés par la direction sont ta priorité.",
  "- Tout ton travail sert ces objectifs : chaque objectif de la semaine ou recommandation dit lequel il fait avancer (« sertObjectif » : son id, ou « aucun »).",
  "- Les actions des équipes humaines (actionsDesEquipesHumaines : direction, développement, commerciaux, marketing…) comptent autant que les vôtres : tiens-en compte, ne les double pas, appuie-les. Une action humaine faite depuis au moins deux semaines se juge comme les tiennes (son id commence par « action- »).",
  "- S'il manque un objectif à un horizon (ni proposé ni validé), propose-le : un indicateur, une cible chiffrée réaliste et ambitieuse — appuie-toi sur la courbe, le volume de TIM et les repères du marché de ta méthode — et pourquoi. Au plus un par horizon. La direction le valide, le corrige ou le refuse.",
  "- Pour chaque objectif validé marqué pointDuMois, fais le point : où on en est face à la cible et au temps écoulé, ce qui a fait bouger le chiffre (vos actions, celles des équipes), ce que tu fais pour tenir l'échéance. Deux ou trois phrases, chiffres à l'appui.",
].join("\n");

/** Les propositions et les points du mois d'une réponse en texte libre (balise <horizons>) ; null s'il n'y en a pas. */
export function horizonsOf(text: string): unknown {
  const m = /<horizons>([\s\S]*?)<\/horizons>/.exec(text);
  try {
    return m ? JSON.parse(m[1]) : null;
  } catch {
    return null;
  }
}

/** Le format des propositions dans une réponse en texte libre (Serge). */
export const GOAL_FORMAT = '<horizons>{"propositions":[{"horizon":"court|moyen|long","indicateur":"clé","titre":"…","cible":12,"pourquoi":"…"}],"points":[{"id":"…","point":"…"}]}</horizons> — omets la balise s\'il n\'y a rien à proposer ni de point à faire.';

export type GoalProposal = { horizon: Horizon; metric: string; title: string; target: number; why: string };
const clip = (v: unknown, n: number) => String(v ?? "").trim().slice(0, n);

/** Les propositions et les points du mois, vérifiés : un indicateur de SON équipe, une cible chiffrée, un horizon libre. Pure (testée). */
export function parseGoalUpdates(raw: unknown, ctx: { team: Team; takenHorizons: Set<string>; goalIds: Set<string> }): { proposals: GoalProposal[]; points: { id: string; text: string }[] } {
  const r = (raw && typeof raw === "object" ? raw : {}) as { propositions?: unknown; points?: unknown };
  const allowed = new Set(INDICATORS.filter((x) => x.teams.includes(ctx.team) && !x.param).map((x) => x.key));
  const proposals: GoalProposal[] = [];
  const taken = new Set(ctx.takenHorizons);
  for (const p of Array.isArray(r.propositions) ? (r.propositions as Raw[]) : []) {
    const horizon = String(p?.horizon ?? "") as Horizon;
    const metric = String(p?.indicateur ?? "");
    const target = Number(p?.cible);
    const title = clip(p?.titre, 160);
    if (!(horizon in HORIZON_MONTHS) || taken.has(horizon) || !allowed.has(metric) || !Number.isFinite(target) || !title) continue;
    taken.add(horizon);
    proposals.push({ horizon, metric, title, target, why: clip(p?.pourquoi, 800) });
  }
  const points = (Array.isArray(r.points) ? (r.points as Raw[]) : []).flatMap((p) => {
    const id = String(p?.id ?? "");
    const text = clip(p?.point, 800);
    return ctx.goalIds.has(id) && text ? [{ id, text }] : [];
  });
  return { proposals, points };
}

/**
 * Écrit ce que le chef propose et le point du mois, et tient les états à jour : un objectif chiffré validé atteint
 * passe « atteint », un objectif validé dont l'échéance est passée sans l'atteindre passe « manqué ». Rend ce qui a
 * changé.
 */
export async function applyGoalUpdates(payload: Payload, o: { team: Team; chiefId: number | string; raw: unknown; now: Date }): Promise<{ proposed: number; points: number }> {
  const goals = await payload.find({ collection: "ai-team-goals", where: { and: [inTeam(o.team), { status: { in: ["propose", "valide"] } }] }, pagination: false, depth: 0, overrideAccess: true }).then((r) => r.docs as unknown as Raw[]).catch(() => [] as Raw[]);
  // Atteint ou manqué : l'état change, et l'objectif clos ne reçoit plus de point du mois.
  const closed = goals.flatMap((g) => {
    if (g.status !== "valide" || g.kind === "jalon") return [];
    const view = toGoal(g, new Map(), o.now);
    const status = !view ? null : view.pace === "atteint" ? "atteint" : Date.parse(view.dueDate) < o.now.getTime() ? "manque" : null;
    return status ? [{ id: String(g.id), status }] : [];
  });
  await Promise.all(closed.map((c) => payload.update({ collection: "ai-team-goals", id: c.id, data: { status: c.status } as never, overrideAccess: true }).catch(() => null)));
  const closedIds = new Set(closed.map((c) => c.id));
  // Un horizon est pris par un objectif de SON équipe (les objectifs « toute l'entreprise » n'empêchent pas de proposer).
  const own = goals.filter((g) => g.team === o.team);
  const { proposals, points } = parseGoalUpdates(o.raw, { team: o.team, takenHorizons: new Set(own.map((g) => String(g.horizon))), goalIds: new Set(goals.filter((g) => g.status === "valide" && !closedIds.has(String(g.id))).map((g) => String(g.id))) });
  const ctx = measureContext(payload, o.now);
  await Promise.all(proposals.map(async (p) => {
    const measures = await initialMeasures(ctx, p.metric, null, o.now).catch(() => [] as Measure[]);
    const due = addMonths(o.now, HORIZON_MONTHS[p.horizon]);
    await payload
      .create({ collection: "ai-team-goals", data: { team: o.team, horizon: p.horizon, kind: "chiffre", status: "propose", title: p.title, metric: p.metric, baseline: measures.at(-1)?.value ?? null, measures, target: p.target, dueDate: due.toISOString(), startDate: o.now.toISOString(), why: p.why || null, member: o.chiefId } as never, overrideAccess: true })
      .catch((e) => payload.logger.warn(`[équipe IA] objectif à horizon : ${e instanceof Error ? e.message : String(e)}`));
  }));
  await Promise.all(points.map((p) => payload.update({ collection: "ai-team-goals", id: p.id, data: { review: p.text, reviewedAt: o.now.toISOString() } as never, overrideAccess: true }).catch(() => null)));
  return { proposed: proposals.length, points: points.length };
}

/** Le point du mois est dû : le premier passage du mois, pour un objectif validé sans point ce mois-ci. */
export const monthlyPointDue = (reviewedAt: string | null, now: Date) => !reviewedAt || parisDay(new Date(reviewedAt)).slice(0, 7) !== parisDay(now).slice(0, 7);

/** Les actions humaines faites depuis au moins 14 jours, pas encore jugées, d'une équipe (pour le verdict du chef). */
export async function humanActionsToJudge(payload: Payload, team: Team, now: Date) {
  const res = await payload
    .find({ collection: "ai-team-actions", where: { and: [inTeam(team), { status: { equals: "faite" } }, { outcome: { exists: false } }, { doneDate: { less_than_equal: new Date(now.getTime() - 14 * DAY_MS).toISOString() } }, { doneDate: { greater_than_equal: new Date(now.getTime() - 84 * DAY_MS).toISOString() } }] }, limit: 10, depth: 0, overrideAccess: true })
    .then((r) => r.docs as unknown as Raw[])
    .catch(() => [] as Raw[]);
  return res.map((a) => ({ id: `action-${a.id}`, action: a.title, qui: WHO_LABEL[String(a.who ?? "autre")] ?? "Autre", faiteLe: String(a.doneDate ?? "").slice(0, 10), detail: a.notes ?? null }));
}

/** Écrit le verdict d'un chef sur une action humaine (id « action-12 »). */
export async function judgeHumanAction(payload: Payload, id: string, outcome: "a-marche" | "sans-effet" | "a-empire", lesson: string, now: Date) {
  const n = id.replace(/^action-/, "");
  await payload.update({ collection: "ai-team-actions", id: n, data: { outcome, verdict: lesson.slice(0, 600), verdictAt: now.toISOString() } as never, overrideAccess: true }).catch(() => null);
}
