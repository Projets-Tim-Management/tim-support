import { NextResponse } from "next/server";

import { adminRequest } from "@/modules/ads/lib/route-auth";
import { callClaude, CopyModelError } from "@/modules/ads/lib/copy/claude";
import { GenerateError, generateCreatives, loadGenerationContext, maxCostEur, missingBrief, weeklyUsed, type GenerateOptions } from "@/modules/ads/lib/copy/generate";
import { userPrompt } from "@/modules/ads/lib/copy/prompt";
import { renderCreativeVisuals } from "@/modules/ads/lib/render/visuals";
import { AdsBudgetError, assertAdsBudget } from "@/modules/ads/lib/spend";

/**
 * Générer les créas d'une campagne.
 *
 * GET  ?angles=3&toneTest=1 → ce que coûterait la génération AVANT de cliquer :
 *      brief incomplet, coût maximal, budget restant, quota de la semaine.
 * POST { angles, toneTest } → génère les textes (lib/copy/generate), puis les
 *      visuels de chaque créa (lib/render/visuals), et renvoie le lot. Un visuel
 *      qui échoue laisse sa créa en brouillon, sans bloquer les autres.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

const options = (angles: unknown, toneTest: unknown): GenerateOptions => {
  const n = Number(angles);
  return { angles: n === 1 || n === 2 ? n : 3, toneTest: toneTest === true || toneTest === "1" || toneTest === "true" };
};

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const url = new URL(req.url);
  const opts = options(url.searchParams.get("angles"), url.searchParams.get("toneTest"));

  const ctx = await loadGenerationContext(payload, id);
  const cost = maxCostEur(ctx.system, userPrompt(ctx.brief, opts));
  const used = await weeklyUsed(payload, id, new Date());
  const planned = opts.angles + (opts.toneTest ? 1 : 0);
  let budget: { ok: true; remainingDay: number | null; remainingMonth: number } | { ok: false; reason: string };
  try {
    budget = await assertAdsBudget(payload, "texte", cost);
  } catch (e) {
    budget = { ok: false, reason: (e as Error).message };
  }
  return NextResponse.json({
    missing: missingBrief(ctx.campaign),
    facts: ctx.brief.facts.length,
    maxCostEur: Math.round(cost * 100) / 100,
    budget,
    quota: { used, limit: ctx.weeklyLimit, planned },
  });
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;
  const body = (await req.json().catch(() => ({}))) as { angles?: unknown; toneTest?: unknown };
  try {
    const r = await generateCreatives(payload, id, options(body.angles, body.toneTest), { call: callClaude });
    let toValidate = 0;
    const visualErrors: string[] = [];
    for (const creativeId of r.created) {
      try {
        const v = await renderCreativeVisuals(payload, creativeId);
        if (v.status === "a-valider") toValidate++;
      } catch (e) {
        visualErrors.push((e as Error).message);
        payload.logger.warn(`[publicité] visuels de la créa ${creativeId} : ${(e as Error).message}`);
      }
    }
    payload.logger.info(`[publicité] génération ${r.batch} : ${r.created.length} créa(s), ${toValidate} à valider, ${r.texts.rejected} texte(s) rejeté(s), ${r.costEur.toFixed(3)} €.`);
    return NextResponse.json({ ...r, toValidate, visualErrors });
  } catch (e) {
    const known = e instanceof GenerateError || e instanceof AdsBudgetError || e instanceof CopyModelError;
    if (!known) payload.logger.error(`[publicité] génération échouée pour la campagne ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: known ? (e as Error).message : "La génération a échoué. Réessayez ; si ça persiste, voir les journaux." }, { status: known ? 409 : 502 });
  }
}
