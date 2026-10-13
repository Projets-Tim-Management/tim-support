import type { Payload } from "payload";

import { payloadAtelier } from "@/modules/ads/agent/atelier-port";
import { prepBudget } from "@/modules/ads/agent/budget";
import { callAgentModel } from "@/modules/ads/agent/claude";
import { tickRun, type TickResult } from "@/modules/ads/agent/engine";
import { notebookFor, type Notebook } from "@/modules/ads/agent/notebook";
import { FETCH_TIMEOUT_MS, LEASE_MS, MAX_AGENTS_PER_RUN, MAX_CONCURRENT, MAX_DEPTH, MAX_REJECTIONS, MAX_TURNS } from "@/modules/ads/agent/limits";
import { ROLE_TOOLS } from "@/modules/ads/agent/roles";
import { createSourcesPort } from "@/modules/ads/agent/sources/port";
import { MAX_PAGES, plannedSitePages, siteFetcher } from "@/modules/ads/agent/sources/site";
import { payloadAgentStore } from "@/modules/ads/agent/store-payload";
import type { AgentDeps, Id } from "@/modules/ads/agent/types";
import { FINISHED } from "@/modules/ads/agent/tools";
import { AGENT_ROLES } from "@/modules/ads/collections/AdAgents";
import { loadGenerationContext, missingBrief, weeklyUsed } from "@/modules/ads/lib/copy/generate";
import { ADS_AGENT_MODELS, ADS_EXTRACTION_MODEL } from "@/modules/ads/lib/models";
import { AdsBudgetError, assertAdsBudget, recordAdsUsage, spentOf } from "@/modules/ads/lib/spend";

/**
 * Piloter l'agent de campagne (plan Publicité, §9 quater, commit 6) : lancer
 * un passage, l'arrêter, montrer avant le lancement ce qu'il va lire et ce
 * qu'il peut coûter au plus, et le faire avancer (après la réponse de la route,
 * puis chaque minute par le cron).
 */

type Settings = { enabled?: boolean | null; agentPrepMaxEur?: number | null; agentDailyEur?: number | null; agentMonthlyEur?: number | null };
type Campaign = { id: Id; name: string; status?: string | null };

export function agentDeps(payload: Payload): AgentDeps {
  return {
    store: payloadAgentStore(payload),
    model: callAgentModel,
    budget: {
      assert: async (maxEur, now) => void (await assertAdsBudget(payload, "agent", maxEur, now)),
      record: async (e) =>
        void (await recordAdsUsage(payload, { kind: "agent", provider: "anthropic", model: e.model, usd: e.usd, campaign: e.campaign, run: e.run, agent: e.agent, detail: e.detail, usage: e.usage })),
    },
    atelier: payloadAtelier(payload),
    sources: createSourcesPort(payload),
    now: () => new Date(),
  };
}

export class LaunchError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LaunchError";
  }
}

const ACTIVE = ["en-cours", "en-pause-budget"];
/** Ce qu'il faut de libre au plafond global pour reprendre un passage en pause. */
const RESUME_MARGIN_EUR = 1;

async function activeRun(payload: Payload, campaign: Id) {
  const r = await payload.find({ collection: "ad-agent-runs", where: { and: [{ campaign: { equals: campaign } }, { status: { in: ACTIVE } }] }, limit: 1, depth: 0, overrideAccess: true });
  return r.docs[0] ?? null;
}

/**
 * Le budget d'un passage : le plafond choisi pour CE passage (2 € pour le premier
 * vrai, décision du 30/09/2026), dans la limite du budget de préparation (5 €)
 * et de ce qui reste aux plafonds globaux des agents (jour, mois).
 */
export async function runBudget(payload: Payload, capEur: number | null, now: Date) {
  const settings = (await payload.findGlobal({ slug: "ads-settings", overrideAccess: true })) as Settings;
  const caps = { prepMaxEur: settings.agentPrepMaxEur ?? 5, dailyEur: settings.agentDailyEur ?? 15, monthlyEur: settings.agentMonthlyEur ?? 150 };
  const spent = await spentOf(payload, "agent", now);
  const prep = prepBudget({ ...caps, prepMaxEur: Math.min(caps.prepMaxEur, capEur ?? caps.prepMaxEur) }, spent);
  return { enabled: settings.enabled !== false, caps, spent, capEur, prep };
}

/** Ce que l'agent va lire, et ce que le passage peut coûter au plus — à montrer AVANT le clic. */
export async function previewRun(payload: Payload, campaignId: Id, capEur: number | null, deps: { fetch?: typeof fetch; env?: Record<string, string | undefined>; now?: Date } = {}) {
  const now = deps.now ?? new Date();
  const env = deps.env ?? process.env;
  const f = deps.fetch ?? fetch;
  const ctx = await loadGenerationContext(payload, campaignId);
  const campaign = ctx.campaign as Campaign;
  const sources = createSourcesPort(payload, { fetch: f, env, now: () => now });
  const [budget, used, competitors, acquisition, active, sitemap, notebook] = await Promise.all([
    runBudget(payload, capEur, now),
    weeklyUsed(payload, campaignId, now),
    sources.competitors(),
    sources.acquisition(12),
    activeRun(payload, campaignId),
    plannedSitePages(siteFetcher(f, FETCH_TIMEOUT_MS)),
    loadNotebook(payload, campaignId, now),
  ]);
  const library = env.ADS_AD_LIBRARY_MOCK === "1" ? "simulée" : env.META_AD_LIBRARY_TOKEN ? "réelle" : "non connectée";
  const blockers = [
    !budget.enabled && "Interrupteur général coupé (Garde-fous).",
    campaign.status !== "brouillon" && "L'agent ne prépare qu'une campagne en brouillon.",
    missingBrief(campaign as never).length > 0 && `Brief incomplet : il manque ${missingBrief(campaign as never).join(", ")}.`,
    used >= ctx.weeklyLimit && `Quota de créas de la semaine atteint (${used} sur ${ctx.weeklyLimit}).`,
    !budget.prep.ok && budget.prep.reason,
    active && "Un passage est déjà en cours sur cette campagne.",
  ].filter((x): x is string => Boolean(x));
  return {
    campagne: { id: campaign.id, nom: campaign.name, statut: campaign.status },
    lancable: blockers.length === 0,
    blocages: blockers,
    budget: {
      plafondDuPassageEur: capEur,
      preparationMaxEur: budget.caps.prepMaxEur,
      agentsJour: { depense: round2(budget.spent.day), plafond: budget.caps.dailyEur },
      agentsMois: { depense: round2(budget.spent.month), plafond: budget.caps.monthlyEur },
      // Le coût MAXIMAL du passage : aucun appel ne part s'il ne tient pas dans ce budget.
      coutMaximalEur: budget.prep.ok ? budget.prep.budgetEur : 0,
    },
    lectures: {
      brief: { faits: ctx.brief.facts.length, interdits: ctx.forbidden.length, anglesSouhaites: ctx.brief.angles.length },
      // La liste EXACTE des pages qui seront lues (la même fonction choisit, ici et au passage).
      site: { pagesAuPlus: MAX_PAGES, adresses: sitemap },
      acquisition: { leadsParCanal: acquisition.canaux.length, clientsSignes: acquisition.signes.total, manque: acquisition.manque },
      concurrents: { suivis: competitors.map((c) => c.name), bibliotheque: library },
      carnet: {
        consignes: notebook.instructions.length,
        apprentissages: notebook.learnings.length,
        aRevalider: notebook.learnings.filter((l) => l.aRevalider).length,
      },
    },
    creasPossibles: Math.max(0, ctx.weeklyLimit - used),
    modeles: Object.fromEntries([...AGENT_ROLES.filter((r) => r.value !== "analyste").map((r) => [r.label, ADS_AGENT_MODELS[r.value]]), ["Résumé des sources", ADS_EXTRACTION_MODEL]]),
    limites: { profondeur: MAX_DEPTH, simultanes: MAX_CONCURRENT, sousAgentsParPassage: MAX_AGENTS_PER_RUN, rejetsParAngle: MAX_REJECTIONS, toursParAgent: MAX_TURNS },
  };
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Les consignes et le carnet qui s'appliquent à une campagne, maintenant (la photo d'un passage). */
export async function loadNotebook(payload: Payload, campaign: Id, now: Date): Promise<Notebook> {
  const [instructions, learnings] = await Promise.all([
    payload.find({ collection: "ad-instructions", where: { status: { equals: "active" } }, pagination: false, depth: 0, overrideAccess: true }),
    payload.find({ collection: "ad-learnings", where: { status: { equals: "actif" } }, pagination: false, depth: 0, overrideAccess: true }),
  ]);
  return notebookFor(campaign, instructions.docs as never[], learnings.docs as never[], now);
}

/** Lancer un passage : tout ce que montre l'aperçu est revérifié ici, au moment du clic. */
export async function launchRun(payload: Payload, input: { campaign: Id; objective: string; capEur: number | null; userId: Id }, now = new Date()) {
  const objective = input.objective.trim();
  if (!objective) throw new LaunchError("Écrivez l'objectif de la campagne, en une phrase.");
  if (objective.length > 500) throw new LaunchError("L'objectif tient en une phrase (500 caractères au plus).");
  if (input.capEur != null && !(input.capEur > 0)) throw new LaunchError("Le plafond du passage doit être positif.");

  const ctx = await loadGenerationContext(payload, input.campaign);
  const campaign = ctx.campaign as Campaign;
  // L'identifiant de la campagne LUE, pas celui de l'adresse : la route le reçoit en texte (« 7 »), et
  // Payload refuse une relation Postgres en texte — premier vrai lancement, 13/10/2026.
  const campaignId = campaign.id;
  if (campaign.status !== "brouillon") throw new LaunchError("L'agent ne prépare qu'une campagne en brouillon.");
  const missing = missingBrief(campaign as never);
  if (missing.length) throw new LaunchError(`Brief incomplet : il manque ${missing.join(", ")}.`);
  if ((await weeklyUsed(payload, campaignId, now)) >= ctx.weeklyLimit) throw new LaunchError("Quota de créas de la semaine atteint pour cette campagne.");
  if (await activeRun(payload, campaignId)) throw new LaunchError("Un passage est déjà en cours sur cette campagne.");
  const b = await runBudget(payload, input.capEur, now);
  if (!b.enabled) throw new LaunchError("Interrupteur général coupé (Publicité › Paramètres › Garde-fous).");
  if (!b.prep.ok) throw new LaunchError(b.prep.reason);
  const notebook = await loadNotebook(payload, campaignId, now);

  const run = await payload.create({
    collection: "ad-agent-runs",
    data: {
      campaign: campaignId,
      objective,
      kind: "preparation",
      status: "en-cours",
      instructionsRead: notebook.instructions,
      learningsRead: notebook.learnings,
      budgetEur: b.prep.budgetEur,
      costEur: 0,
      startedBy: input.userId,
      startedAt: now.toISOString(),
      limits: { plafondDuPassageEur: input.capEur, preparationMaxEur: b.caps.prepMaxEur, profondeur: MAX_DEPTH, simultanes: MAX_CONCURRENT, sousAgents: MAX_AGENTS_PER_RUN, rejets: MAX_REJECTIONS },
    } as never,
    overrideAccess: true,
  });
  // Deux lancements simultanés (double clic, deux onglets) : le second se retire (relecture du 01/10/2026, F4).
  const racing = await payload.count({ collection: "ad-agent-runs", where: { and: [{ campaign: { equals: campaignId } }, { status: { in: ACTIVE } }] }, overrideAccess: true });
  if (racing.totalDocs > 1) {
    const older = await activeRun(payload, campaignId);
    if (older && older.id !== run.id) {
      await payload.delete({ collection: "ad-agent-runs", id: run.id, overrideAccess: true });
      throw new LaunchError("Un passage vient d'être lancé sur cette campagne.");
    }
  }
  await payload.create({
    collection: "ad-agents",
    data: {
      run: run.id,
      depth: 0,
      role: "orchestrateur",
      status: "en-cours",
      mission: `Préparer la campagne « ${campaign.name} » : positionnement, audiences, angles, textes et visuels, puis déposer les créas « À valider ».`,
      tools: [...ROLE_TOOLS.orchestrateur],
      model: ADS_AGENT_MODELS.orchestrateur,
      budgetEur: b.prep.budgetEur,
      spentEur: 0,
    } as never,
    overrideAccess: true,
  });
  return { id: run.id as Id, budgetEur: b.prep.budgetEur };
}

/** Arrêter tout de suite : le passage, et chaque agent qui n'a pas fini. Ce qui est produit reste. */
export async function stopRun(payload: Payload, runId: Id, who: string, now = new Date()) {
  const run = (await payload.findByID({ collection: "ad-agent-runs", id: runId, depth: 0, overrideAccess: true })) as { status: string };
  if (!ACTIVE.includes(run.status)) throw new LaunchError(`Ce passage n'est plus en cours (« ${run.status} »).`);
  const stamp = now.toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" });
  await payload.update({ collection: "ad-agent-runs", id: runId, data: { status: "arrete", error: `Arrêté par ${who} à ${stamp}.`, finishedAt: now.toISOString() } as never, overrideAccess: true });
  const agents = await payload.find({ collection: "ad-agents", where: { run: { equals: runId } }, pagination: false, depth: 0, overrideAccess: true });
  for (const a of agents.docs as { id: Id; status: string }[]) {
    if (!FINISHED.includes(a.status as never)) await payload.update({ collection: "ad-agents", id: a.id, data: { status: "arrete", error: "Passage arrêté." } as never, overrideAccess: true });
  }
}

/**
 * Le cron (chaque minute) : les passages en cours dont personne ne tient le
 * verrou avancent ; ceux en pause de budget repartent quand le plafond global
 * le permet de nouveau (jour ou mois suivant).
 */
export async function tickDueRuns(payload: Payload, deadline: Date, deps: AgentDeps = agentDeps(payload)): Promise<{ run: Id; result: TickResult | "repris" }[]> {
  const now = deps.now();
  const out: { run: Id; result: TickResult | "repris" }[] = [];
  const paused = await payload.find({ collection: "ad-agent-runs", where: { status: { equals: "en-pause-budget" } }, pagination: false, depth: 0, overrideAccess: true });
  for (const r of paused.docs as { id: Id }[]) {
    try {
      // La marge d'un tour d'Opus avec un long historique : en dessous, le passage repartirait pour se remettre en pause aussitôt.
      await assertAdsBudget(payload, "agent", RESUME_MARGIN_EUR, now);
      await payload.update({ collection: "ad-agent-runs", id: r.id, data: { status: "en-cours", error: null } as never, overrideAccess: true });
      out.push({ run: r.id, result: "repris" });
    } catch (e) {
      if (!(e instanceof AdsBudgetError)) throw e;
    }
  }
  const due = await payload.find({
    collection: "ad-agent-runs",
    where: { and: [{ status: { equals: "en-cours" } }, { or: [{ leaseUntil: { exists: false } }, { leaseUntil: { less_than: now.toISOString() } }] }] },
    sort: "startedAt",
    limit: 3,
    depth: 0,
    overrideAccess: true,
  });
  for (const r of due.docs as { id: Id }[]) {
    if (deps.now().getTime() + LEASE_MS / 10 > deadline.getTime()) break;
    // Une erreur sur un passage n'empêche pas les suivants d'avancer (relecture du 01/10/2026, G2).
    try {
      out.push({ run: r.id, result: await tickRun(deps, r.id, deadline) });
    } catch (e) {
      payload.logger.error(`[publicité] passage ${r.id} : ${(e as Error).message}`);
      out.push({ run: r.id, result: { outcome: "echoue", steps: 0 } });
    }
  }
  return out;
}
