import type { Payload } from "payload";

import { ActionError } from "@/modules/ads/lib/actions-run";
import type { MediaPlan } from "@/modules/ads/lib/media-plan";

/**
 * Basculer une campagne « Trafic » vers une campagne « Prospects » (plan
 * Publicité, §9 nonies, étape 6 — décision de Charlie du 29/10/2026 :
 * l'agent prépare, Charlie publie).
 *
 * Meta ne change pas l'objectif d'une campagne publiée : optimiser sur les
 * leads, c'est une NOUVELLE campagne. Quand Meta reçoit assez de leads par
 * l'API Conversions pour apprendre, l'analyste fait préparer un BROUILLON :
 * même compte, même brief, même budget, le même ciblage en objectif Prospects
 * (optimisation sur les conversions du pixel), et les créas en ligne qu'il
 * choisit, recopiées validées. Charlie le publie ensuite d'un clic, comme
 * n'importe quelle campagne ; l'analyste propose alors de couper l'ancienne.
 */

/** Leads reçus par Meta (API Conversions) sur 30 jours avant de lui demander d'optimiser dessus. */
export const MIN_LEADS_SENT = 10;

type Source = {
  id: number;
  name: string;
  account?: number | { id: number } | null;
  autonomy?: string | null;
  brief?: Record<string, unknown> | null;
  agentBudget?: Record<string, unknown> | null;
  publicationStatus?: string | null;
  publication?: { plan?: MediaPlan | null } | null;
};

/** Le plan Prospects tiré du plan publié : le même ciblage, l'objectif et l'optimisation qui changent. Pure. */
export function prospectsPlan(plan: MediaPlan): Record<string, unknown> {
  return {
    objectif: "prospects",
    optimisation: "conversions",
    ensembles: plan.ensembles.map((e) => ({
      nom: e.nom,
      part: e.part,
      advantage: e.advantage,
      pays: e.pays,
      regions: e.regions,
      age_min: e.ageMin,
      age_max: e.ageMax,
      genres: e.genres,
      interets: e.interets,
      metiers: e.metiers,
    })),
    chiffres: {},
  };
}

/** Une copie sans ce qui identifie l'original (identifiants de lignes compris), pour une nouvelle créa. Pure. */
export function withoutIds(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(withoutIds);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.entries(v as Record<string, unknown>)
        .filter(([k]) => !["id", "_id", "createdAt", "updatedAt"].includes(k))
        .map(([k, x]) => [k, withoutIds(x)]),
    );
  }
  return v;
}

export async function prepareProspects(
  payload: Payload,
  input: { campaign: number | string; reason: string; creatives: (number | string)[]; origin?: { run: number | string; agent: number | string; step: number | string } },
  now = new Date(),
): Promise<{ campaign: number | string; creatives: (number | string)[] }> {
  const src = (await payload.findByID({ collection: "ad-campaigns", id: input.campaign, depth: 0, overrideAccess: true }).catch(() => null)) as Source | null;
  if (!src || src.publicationStatus !== "active") throw new ActionError("La bascule part d'une campagne en diffusion.");
  const plan = src.publication?.plan;
  if (!plan) throw new ActionError("Le plan publié de cette campagne est introuvable.");
  if (plan.objectif === "prospects") throw new ActionError("Cette campagne optimise déjà sur les prospects.");
  const accountId = typeof src.account === "object" ? src.account?.id : src.account;
  const account = accountId ? ((await payload.findByID({ collection: "ad-accounts", id: accountId, depth: 0, overrideAccess: true }).catch(() => null)) as { diffusion?: { pixelId?: string | null } } | null) : null;
  if (!account?.diffusion?.pixelId) throw new ActionError("Le compte n'a pas de pixel choisi (« Vérifier les droits ») : Meta ne pourrait rien optimiser.");

  const since = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const sent = await payload.count({ collection: "ad-conversions", where: { and: [{ event: { equals: "Lead" } }, { status: { equals: "envoye" } }, { sentAt: { greater_than_equal: since } }] }, overrideAccess: true });
  if (sent.totalDocs < MIN_LEADS_SENT) throw new ActionError(`Meta n'a reçu que ${sent.totalDocs} lead(s) en 30 jours : il en faut ${MIN_LEADS_SENT} pour qu'il apprenne sur les prospects. On attend.`);

  const already = await payload.find({ collection: "ad-decisions", where: { and: [{ campaign: { equals: src.id } }, { kind: { equals: "bascule" } }, { status: { equals: "executee" } }] }, limit: 1, depth: 0, overrideAccess: true });
  const prior = (already.docs[0] as { after?: { campagne?: number } } | undefined)?.after?.campagne;
  if (prior && (await payload.findByID({ collection: "ad-campaigns", id: prior, depth: 0, overrideAccess: true }).catch(() => null))) {
    throw new ActionError(`Une campagne Prospects est déjà préparée à partir de celle-ci (n° ${prior}).`);
  }

  const ids = [...new Set(input.creatives.map(String))];
  if (!ids.length) throw new ActionError("Choisis les créas à reprendre : celles qui marchent.");
  const creas = await payload.find({ collection: "ad-creatives", where: { and: [{ campaign: { equals: src.id } }, { status: { equals: "en-ligne" } }, { id: { in: ids } }] }, pagination: false, depth: 0, overrideAccess: true });
  if (creas.docs.length !== ids.length) throw new ActionError("Seules les créas EN LIGNE de cette campagne se reprennent.");

  const campaign = await payload.create({
    collection: "ad-campaigns",
    data: {
      name: `${src.name} — Prospects`.slice(0, 120),
      account: accountId,
      autonomy: src.autonomy ?? "proposer",
      brief: withoutIds(src.brief ?? {}),
      agentBudget: withoutIds(src.agentBudget ?? {}),
    } as never,
    overrideAccess: true,
  });
  await payload.create({
    collection: "ad-decisions",
    data: {
      campaign: campaign.id,
      run: input.origin?.run ?? null,
      agent: input.origin?.agent ?? null,
      step: input.origin?.step ?? null,
      kind: "audience",
      status: "proposee",
      rationale: `Reprise du ciblage de « ${src.name} », en objectif Prospects : Meta optimise sur les leads du pixel. ${input.reason}`.slice(0, 2000),
      after: prospectsPlan(plan),
    } as never,
    overrideAccess: true,
  });
  const copied: (number | string)[] = [];
  for (const c of creas.docs as unknown as Record<string, unknown>[]) {
    const data = withoutIds(c) as Record<string, unknown>;
    delete data.campaign;
    delete data.run;
    const doc = await payload.create({ collection: "ad-creatives", data: { ...data, campaign: campaign.id, status: "validee" } as never, overrideAccess: true });
    copied.push(doc.id as number);
  }
  return { campaign: campaign.id as number, creatives: copied };
}
