import type { Payload } from "payload";

import { prepBudget } from "@/modules/ads/agent/budget";
import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import type { Id } from "@/modules/ads/agent/types";
import { ADS_FOLLOWUP_MODELS } from "@/modules/ads/lib/models";
import { spentOf } from "@/modules/ads/lib/spend";
import { MAX_CONCURRENT, MAX_DEPTH } from "@/modules/ads/agent/limits";

/**
 * Les passages de SUIVI d'une campagne en ligne (plan Publicité, §9 quinquies
 * §5 et §9 nonies, étape 3), lancés par le cron — personne n'a à y penser.
 *
 * | Rythme        | Quand (Paris)               | Modèle | Agit ? |
 * |---------------|-----------------------------|--------|--------|
 * | quotidien     | chaque jour dès 7 h         | Sonnet | non : il lit, repère, prévient |
 * | hebdomadaire  | chaque lundi dès 8 h        | Opus   | oui, sous les garde-fous |
 * | mensuel       | le premier lundi dès 9 h    | Opus   | oui, et il fait le bilan et revoit le carnet |
 *
 * Un passage par rythme et par période (jour, semaine, mois), jamais deux en
 * même temps sur une campagne : celui du matin attend que celui du lundi ait
 * fini, le jour même, plutôt que de se chevaucher.
 */

export type FollowUpKind = "quotidien" | "hebdomadaire" | "mensuel";

/** Le budget d'un passage de suivi, pris dans les plafonds globaux des agents (jour, mois). */
export const FOLLOWUP_BUDGET_EUR: Record<FollowUpKind, number> = { quotidien: 0.8, hebdomadaire: 3, mensuel: 3 };
const HOUR: Record<FollowUpKind, number> = { quotidien: 7, hebdomadaire: 8, mensuel: 9 };

type ParisNow = { date: string; hour: number; weekday: number; dayOfMonth: number };

/** L'heure de Paris : le jour (AAAA-MM-JJ), l'heure, le jour de la semaine (1 = lundi) et du mois. Pure. */
export function parisNow(now: Date): ParisNow {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23", weekday: "short" })
      .formatToParts(now)
      .map((p) => [p.type, p.value]),
  );
  const weekday = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(parts.weekday) + 1;
  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour), weekday, dayOfMonth: Number(parts.day) };
}

/** La période d'un rythme : on n'en lance qu'un par période. Pure. */
export function periodKey(kind: FollowUpKind, p: ParisNow): string {
  if (kind === "quotidien") return p.date;
  if (kind === "mensuel") return p.date.slice(0, 7);
  // La semaine : le lundi qui l'ouvre.
  const monday = new Date(Date.parse(`${p.date}T12:00:00Z`) - (p.weekday - 1) * 86_400_000);
  return monday.toISOString().slice(0, 10);
}

/**
 * Les rythmes dus maintenant pour une campagne, du plus lourd au plus léger :
 * le bilan du mois tient lieu de passage du lundi, et celui du lundi de passage
 * du matin. `last` : la période du dernier passage de chaque rythme. Pure.
 */
export function dueKinds(p: ParisNow, last: Partial<Record<FollowUpKind, string>>): FollowUpKind[] {
  const monday = p.weekday === 1;
  const firstMonday = monday && p.dayOfMonth <= 7;
  const due: FollowUpKind[] = [];
  if (firstMonday && p.hour >= HOUR.mensuel && last.mensuel !== periodKey("mensuel", p)) due.push("mensuel");
  if (monday && p.hour >= HOUR.hebdomadaire && last.hebdomadaire !== periodKey("hebdomadaire", p) && !firstMonday) due.push("hebdomadaire");
  if (p.hour >= HOUR.quotidien && last.quotidien !== periodKey("quotidien", p) && !monday) due.push("quotidien");
  return due;
}

/** Ce que l'analyste doit faire à ce rythme : sa mission, en clair. */
export function missionOf(kind: FollowUpKind, campaign: string): string {
  if (kind === "quotidien") {
    return `Passage du matin sur la campagne en ligne « ${campaign} » : lis les résultats des 7 derniers jours et le journal, repère ce qui a changé (rupture de dépense, pub qui s'use, page qui ne convertit pas, alerte ouverte). Tu n'agis pas : tu dis ce que tu as vu et ce que tu proposerais au passage du lundi.`;
  }
  if (kind === "hebdomadaire") {
    return `Passage du lundi sur la campagne en ligne « ${campaign} » : lis les résultats sur 7 et 14 jours et le journal, puis DÉCIDE — budget entre ensembles, pause d'une pub qui perd ou s'use, réactivation — sous les garde-fous, ou attends en disant pourquoi. Note ce que les chiffres ont établi. Dans ton résultat : ce que tu as fait, ce qui attend Charlie, et ce qui ne se règle pas chez Meta (page, offre, créas à renouveler).`;
  }
  return `Bilan du mois de la campagne en ligne « ${campaign} » : lis les résultats sur 30 jours et le journal ; coût par lead, par lead qualifié et par client signé ; ce qui a marché ou non et pourquoi. Décide comme le lundi s'il le faut. Revois le carnet : note les apprentissages établis, propose en global ceux qui valent pour toutes les campagnes.`;
}

type RawCampaign = { id: Id; name: string; publicationStatus?: string | null; status?: string | null };

/**
 * Lance les passages de suivi dus (appelé chaque minute par le cron, avant de
 * faire avancer les passages). Un passage déjà en cours sur une campagne la
 * fait attendre ; un plafond global atteint fait sauter le passage (noté au
 * journal du serveur), il sera retenté à la minute suivante.
 */
export async function scheduleFollowUps(payload: Payload, now = new Date()): Promise<{ campaign: Id; kind: FollowUpKind; run?: Id; skipped?: string }[]> {
  const settings = (await payload.findGlobal({ slug: "ads-settings", overrideAccess: true })) as { enabled?: boolean | null; agentDailyEur?: number | null; agentMonthlyEur?: number | null };
  if (settings.enabled === false) return [];
  const p = parisNow(now);
  // Avant 7 h, rien n'est dû : on ne lit même pas la base.
  if (p.hour < HOUR.quotidien) return [];
  const live = await payload.find({ collection: "ad-campaigns", where: { and: [{ publicationStatus: { equals: "active" } }, { status: { equals: "active" } }] }, pagination: false, depth: 0, overrideAccess: true });
  const out: { campaign: Id; kind: FollowUpKind; run?: Id; skipped?: string }[] = [];
  for (const c of live.docs as unknown as RawCampaign[]) {
    const runs = await payload.find({
      collection: "ad-agent-runs",
      where: { and: [{ campaign: { equals: c.id } }, { startedAt: { greater_than_equal: new Date(now.getTime() - 40 * 86_400_000).toISOString() } }] },
      sort: "-startedAt",
      limit: 60,
      depth: 0,
      overrideAccess: true,
    });
    const docs = runs.docs as unknown as { kind: string; status: string; startedAt: string }[];
    if (docs.some((r) => r.status === "en-cours" || r.status === "en-pause-budget")) continue;
    const last: Partial<Record<FollowUpKind, string>> = {};
    for (const k of ["quotidien", "hebdomadaire", "mensuel"] as FollowUpKind[]) {
      const r = docs.find((d) => d.kind === k);
      if (r) last[k] = periodKey(k, parisNow(new Date(r.startedAt)));
    }
    const kind = dueKinds(p, last)[0];
    if (!kind) continue;
    const spent = await spentOf(payload, "agent", now);
    const b = prepBudget({ prepMaxEur: FOLLOWUP_BUDGET_EUR[kind], dailyEur: settings.agentDailyEur ?? 15, monthlyEur: settings.agentMonthlyEur ?? 150 }, spent);
    if (!b.ok) {
      out.push({ campaign: c.id, kind, skipped: b.reason });
      continue;
    }
    const run = await launchFollowUp(payload, c, kind, b.budgetEur, now);
    if (run != null) out.push({ campaign: c.id, kind, run });
  }
  return out;
}

/**
 * Crée le passage et son analyste (racine de l'arbre). Il avance ensuite comme
 * tout passage. Deux crons qui se chevauchent (une minute qui déborde) peuvent
 * le lancer ensemble : le plus récent se retire. Rend `null` dans ce cas.
 */
export async function launchFollowUp(payload: Payload, c: { id: Id; name: string }, kind: FollowUpKind, budgetEur: number, now: Date): Promise<Id | null> {
  const { loadNotebook } = await import("@/modules/ads/agent/run");
  const notebook = await loadNotebook(payload, c.id, now);
  const mission = missionOf(kind, c.name);
  const run = await payload.create({
    collection: "ad-agent-runs",
    data: {
      campaign: c.id,
      objective: mission,
      kind,
      status: "en-cours",
      instructionsRead: notebook.instructions,
      learningsRead: notebook.learnings,
      budgetEur,
      costEur: 0,
      startedAt: now.toISOString(),
      limits: { budgetDuPassageEur: budgetEur, rythme: kind, profondeur: MAX_DEPTH, simultanes: MAX_CONCURRENT },
    } as never,
    overrideAccess: true,
  });
  const racing = await payload.find({ collection: "ad-agent-runs", where: { and: [{ campaign: { equals: c.id } }, { status: { in: ["en-cours", "en-pause-budget"] } }] }, sort: "createdAt", limit: 5, depth: 0, overrideAccess: true });
  if (racing.docs.length > 1 && racing.docs[0].id !== run.id) {
    await payload.delete({ collection: "ad-agent-runs", id: run.id, overrideAccess: true });
    return null;
  }
  await payload.create({
    collection: "ad-agents",
    data: {
      run: run.id,
      depth: 0,
      role: "analyste",
      status: "en-cours",
      mission,
      // Le matin, il lit ; il n'a pas l'outil pour agir (l'outil le refuserait aussi).
      tools: ROLE_TOOLS.analyste.filter((t) => kind !== "quotidien" || !["agir", "ouvrir_test", "demander_creas", "preparer_campagne_prospects"].includes(t)),
      model: ADS_FOLLOWUP_MODELS[kind],
      budgetEur,
      spentEur: 0,
    } as never,
    overrideAccess: true,
  });
  return run.id as Id;
}
