import { randomUUID } from "node:crypto";

import type { Payload } from "payload";

import { claudeCostUsd, claudeMaxCostUsd, estimateTokens, usdToEur, type Usage } from "@/core/lib/ai-pricing";
import { allowedNumbers, guard, type TextKind } from "@/modules/ads/lib/copy/guardrails";
import { PROMPT_VERSION, VARIANTS, systemPrompt, userPrompt, type BriefInput, type CopyAngle } from "@/modules/ads/lib/copy/prompt";
import { ctaLabel } from "@/modules/ads/lib/cta";
import { DEFAULT_TONE, type Tone } from "@/modules/ads/lib/dimensions";
import { ADS_TEXT_MAX_TOKENS, ADS_TEXT_MODEL } from "@/modules/ads/lib/models";
import { assertAdsBudget, recordAdsUsage } from "@/modules/ads/lib/spend";
import type { ModelCall } from "@/modules/ads/lib/copy/claude";

/**
 * Générer les textes d'une campagne (plan Publicité, §9 ter, point 3).
 *
 * Dans l'ordre, et rien ne part si une étape refuse :
 *  1. le brief a ce qu'il faut (cible, douleur, offre) ;
 *  2. le quota de créas de la semaine le permet ;
 *  3. le coût MAXIMAL tient dans le budget du jour et du mois ;
 *  4. l'appel à Claude ;
 *  5. la dépense réelle est inscrite — même si la réponse est refusée ou
 *     tronquée : elle a été facturée ;
 *  6. chaque texte passe les garde-fous ; un texte rejeté reste visible avec sa
 *     raison ;
 *  7. une créa par angle, en brouillon (les visuels viennent ensuite).
 *
 * Appelée par l'agent de campagne (plan, §9 quater), elle reçoit les angles
 * choisis par le stratège SANS toucher au brief saisi, garde sur chaque créa
 * l'angle demandé et le passage qui l'a demandée, et rattache la dépense au
 * passage. Le contrôle `preCheck` de l'agent s'ajoute aux plafonds de
 * l'atelier : le plus strict l'emporte (décision du 30/09/2026).
 */

export type AgentRequest = {
  run: number | string;
  agent: number | string;
  /** Les angles demandés, dans l'ordre (1 à 3). Ils remplacent, pour cette génération seulement, ceux du brief. */
  angles: string[];
  /** Le budget de l'agent et le plafond global des agents, vérifiés avec le coût maximal ; lève si ça ne tient pas. */
  preCheck: (maxEur: number) => Promise<void>;
};

export type GenerateOptions = { angles: 1 | 2 | 3; toneTest: boolean; agent?: AgentRequest };

export class GenerateError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GenerateError";
  }
}

type Fact = { id: number | string; statement: string; source: string; active?: boolean | null };
type Campaign = {
  id: number | string;
  name: string;
  brief?: {
    audience?: string | null;
    pain?: string | null;
    offer?: string | null;
    promise?: string | null;
    proofs?: (Fact | number | string)[] | null;
    forbidden?: string | null;
    landingUrl?: string | null;
    cta?: string | null;
    tone?: Tone | null;
    angles?: { angle?: string | null }[] | null;
  } | null;
};
type Kit = { defaultTone?: Tone | null; voice?: string | null; goodExamples?: string | null; badExamples?: string | null; forbidden?: { term?: string | null }[] | null };

/** Ce qui manque au brief pour générer. Pure. */
export function missingBrief(c: Campaign): string[] {
  const b = c.brief ?? {};
  return [
    !b.audience?.trim() && "la cible",
    !b.pain?.trim() && "la douleur",
    !b.offer?.trim() && "l'offre",
  ].filter((x): x is string => Boolean(x));
}

const lines = (s?: string | null) => (s ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

export function briefInput(c: Campaign): BriefInput {
  const b = c.brief ?? {};
  const facts = (b.proofs ?? []).filter((f): f is Fact => typeof f === "object" && f !== null && f.active !== false);
  return {
    campaign: c.name,
    audience: b.audience,
    pain: b.pain,
    offer: b.offer,
    promise: b.promise,
    landingUrl: b.landingUrl,
    cta: ctaLabel(b.cta) ?? "En savoir plus",
    ctaValue: ctaLabel(b.cta) ? (b.cta as string) : "en-savoir-plus",
    tone: b.tone ?? DEFAULT_TONE,
    angles: (b.angles ?? []).map((a) => a.angle?.trim() ?? "").filter(Boolean),
    facts: facts.map((f) => ({ id: f.id, statement: f.statement, source: f.source })),
    forbidden: lines(b.forbidden),
  };
}

type TextRow = { kind: "principal" | "titre" | "description"; tone: Tone; text: string; status: "ok" | "rejete"; reason: string | null };

/** Une créa (à écrire) à partir d'un angle de la réponse. Pure — c'est elle qu'on teste. */
export function creativeFromAngle(
  a: CopyAngle,
  ctx: { brief: BriefInput; forbidden: string[]; campaignId: number | string; batch: string; costEur: number; requested?: { angle: string; run: number | string } },
) {
  const tone: Tone = a.tone === "tu" ? "tu" : "vous";
  const g = { tone, forbidden: ctx.forbidden, allowed: allowedNumbers([...ctx.brief.facts.map((f) => f.statement), ctx.brief.offer ?? ""]) };
  const rows = (kind: TextRow["kind"], list: string[], n: number): TextRow[] =>
    list.slice(0, n).map((text) => {
      const r = guard(kind as TextKind, text, g);
      return { kind, tone, text: text.trim(), status: r.ok ? "ok" : "rejete", reason: r.ok ? null : r.reason };
    });
  const texts = [...rows("principal", a.primaryTexts, VARIANTS.principal), ...rows("titre", a.headlines, VARIANTS.titre), ...rows("description", a.descriptions, VARIANTS.description)];

  // L'accroche va sur l'image : si elle échoue, on prend le premier titre passé plutôt que d'imprimer un texte rejeté.
  const hookCheck = guard("accroche", a.hook, g);
  const hook = hookCheck.ok ? a.hook.trim() : (texts.find((t) => t.kind === "titre" && t.status === "ok")?.text ?? null);

  // Un ton différent de celui du brief EST un test de ton, que le modèle l'ait déclaré ou non.
  const tests = tone !== ctx.brief.tone ? [{ dimension: "ton" as const, value: tone }] : [];
  const known = new Set(ctx.brief.facts.map((f) => String(f.id)));

  return {
    angle: a.angle.trim(),
    hook,
    campaign: ctx.campaignId,
    tone,
    cta: ctx.brief.ctaValue,
    tests,
    copy: texts,
    facts: a.factIds.filter((id) => known.has(String(id))).map((id) => (Number.isFinite(Number(id)) ? Number(id) : id)),
    origin: ctx.requested ? ("agent" as const) : ("generee" as const),
    requestedAngle: ctx.requested?.angle ?? null,
    run: ctx.requested?.run ?? null,
    generation: { model: ADS_TEXT_MODEL, costEur: ctx.costEur, batch: ctx.batch },
    status: "brouillon" as const,
  };
}

/** Une créa publiable a au moins un texte principal et un titre passés. Pure. */
export const publishable = (texts: { kind: string; status: string }[]): boolean =>
  texts.some((t) => t.kind === "principal" && t.status === "ok") && texts.some((t) => t.kind === "titre" && t.status === "ok");

export type GenerateResult = {
  batch: string;
  created: (number | string)[];
  costEur: number;
  texts: { ok: number; rejected: number };
  toneTests: number;
};

export async function weeklyUsed(payload: Payload, campaignId: number | string, now: Date): Promise<number> {
  const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const r = await payload.count({
    collection: "ad-creatives",
    where: { and: [{ campaign: { equals: campaignId } }, { createdAt: { greater_than_equal: since } }] },
    overrideAccess: true,
  });
  return r.totalDocs;
}

export async function loadGenerationContext(payload: Payload, campaignId: number | string) {
  const [campaign, kit, settings] = await Promise.all([
    payload.findByID({ collection: "ad-campaigns", id: campaignId, depth: 1, overrideAccess: true }) as Promise<Campaign>,
    payload.findGlobal({ slug: "ads-brand-kit", overrideAccess: true }) as Promise<Kit>,
    payload.findGlobal({ slug: "ads-settings", overrideAccess: true }) as Promise<{ creativesPerCampaignPerWeek?: number | null }>,
  ]);
  const brief = briefInput(campaign);
  const forbidden = [...(kit.forbidden ?? []).map((f) => f.term ?? "").filter(Boolean), ...brief.forbidden];
  const system = systemPrompt({ defaultTone: kit.defaultTone ?? DEFAULT_TONE, voice: kit.voice, goodExamples: kit.goodExamples, badExamples: kit.badExamples, forbidden });
  return { campaign, brief, forbidden, system, weeklyLimit: settings.creativesPerCampaignPerWeek ?? 6 };
}

export const maxCostEur = (system: string, user: string) => usdToEur(claudeMaxCostUsd(ADS_TEXT_MODEL, estimateTokens(system, user), ADS_TEXT_MAX_TOKENS));

export async function generateCreatives(
  payload: Payload,
  campaignId: number | string,
  opts: GenerateOptions,
  deps: { call: ModelCall; now?: Date },
): Promise<GenerateResult> {
  const now = deps.now ?? new Date();
  const ctx = await loadGenerationContext(payload, campaignId);

  const missing = missingBrief(ctx.campaign);
  if (missing.length) throw new GenerateError(`Brief incomplet : il manque ${missing.join(", ")}.`);

  const requested = opts.agent?.angles.slice(0, 3);
  if (opts.agent && !requested?.length) throw new GenerateError("Aucun angle demandé.");
  const angleCount = requested?.length ?? opts.angles;
  const planned = angleCount + (opts.toneTest ? 1 : 0);
  const used = await weeklyUsed(payload, campaignId, now);
  if (used + planned > ctx.weeklyLimit) {
    throw new GenerateError(`Quota de la semaine : ${used} créa(s) sur ${ctx.weeklyLimit} pour cette campagne, cette génération en ajouterait ${planned}.`);
  }

  // Les angles de l'agent ne passent que dans CE prompt : le brief enregistré ne bouge pas.
  const brief = requested ? { ...ctx.brief, angles: requested } : ctx.brief;
  const user = userPrompt(brief, { angles: angleCount, toneTest: opts.toneTest });
  const maxEur = maxCostEur(ctx.system, user);
  await assertAdsBudget(payload, "texte", maxEur, now);
  await opts.agent?.preCheck(maxEur);
  const attribution = opts.agent ? { run: opts.agent.run, agent: opts.agent.agent } : {};

  const batch = `gen-${now.toISOString().slice(0, 10)}-${randomUUID().slice(0, 8)}`;
  let result: Awaited<ReturnType<ModelCall>>;
  try {
    result = await deps.call({ system: ctx.system, user });
  } catch (e) {
    // Facturé même quand la réponse est refusée ou tronquée.
    const usage = (e as { usage?: Usage }).usage;
    if (usage) await recordAdsUsage(payload, { kind: "texte", provider: "anthropic", model: ADS_TEXT_MODEL, usd: claudeCostUsd(ADS_TEXT_MODEL, usage), campaign: campaignId, ...attribution, batch, detail: `Échec : ${(e as Error).message}`, usage });
    throw e;
  }

  const usd = claudeCostUsd(ADS_TEXT_MODEL, result.usage);
  const angles = result.result.angles.slice(0, planned);
  await recordAdsUsage(payload, {
    kind: "texte",
    provider: "anthropic",
    model: ADS_TEXT_MODEL,
    usd,
    campaign: campaignId,
    ...attribution,
    batch,
    detail: `${angles.length} angle(s), prompt ${PROMPT_VERSION}`,
    usage: result.usage,
  });

  const share = angles.length ? Math.round((usdToEur(usd) / angles.length) * 10_000) / 10_000 : 0;
  const created: (number | string)[] = [];
  let ok = 0;
  let rejected = 0;
  let toneTests = 0;
  for (const [i, a] of angles.entries()) {
    // Le test de ton reprend le premier angle : il en porte donc l'origine.
    const origin = requested && opts.agent ? { angle: requested[i] ?? requested[0], run: opts.agent.run } : undefined;
    const data = creativeFromAngle(a, { brief: ctx.brief, forbidden: ctx.forbidden, campaignId, batch, costEur: share, requested: origin });
    ok += data.copy.filter((t) => t.status === "ok").length;
    rejected += data.copy.filter((t) => t.status === "rejete").length;
    if (data.tests.length) toneTests++;
    const doc = await payload.create({ collection: "ad-creatives", data: data as never, overrideAccess: true });
    created.push(doc.id);
  }
  return { batch, created, costEur: usdToEur(usd), texts: { ok, rejected }, toneTests };
}

