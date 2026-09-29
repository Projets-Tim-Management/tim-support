import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { callClaude, CopyModelError } from "@/modules/ads/lib/copy/claude";
import { AdsBudgetError, GenerateError, generateCreatives, loadGenerationContext, maxCostEur, missingBrief, weeklyUsed, type GenerateOptions } from "@/modules/ads/lib/copy/generate";
import { userPrompt } from "@/modules/ads/lib/copy/prompt";
import { assertAdsBudget } from "@/modules/ads/lib/spend";

/**
 * Générer les créas d'une campagne.
 *
 * GET  ?angles=3&toneTest=1 → ce que coûterait la génération AVANT de cliquer :
 *      brief incomplet, coût maximal, budget restant, quota de la semaine.
 * POST { angles, toneTest } → génère (voir lib/copy/generate) et renvoie le lot.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type Params = { params: Promise<{ id: string }> };

async function guardAdmin(req: Request) {
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return { payload, error: NextResponse.json({ error: "unauthorized" }, { status: 401 }) };
  if (!hasAdminRole(user)) return { payload, error: NextResponse.json({ error: "forbidden" }, { status: 403 }) };
  return { payload, error: null };
}

const options = (angles: unknown, toneTest: unknown): GenerateOptions => {
  const n = Number(angles);
  return { angles: n === 1 || n === 2 ? n : 3, toneTest: toneTest === true || toneTest === "1" || toneTest === "true" };
};

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const { payload, error } = await guardAdmin(req);
  if (error) return error;
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
  const { payload, error } = await guardAdmin(req);
  if (error) return error;
  const body = (await req.json().catch(() => ({}))) as { angles?: unknown; toneTest?: unknown };
  try {
    const r = await generateCreatives(payload, id, options(body.angles, body.toneTest), { call: callClaude });
    payload.logger.info(`[publicité] génération ${r.batch} : ${r.created.length} créa(s), ${r.texts.rejected} texte(s) rejeté(s), ${r.costEur.toFixed(3)} €.`);
    return NextResponse.json(r);
  } catch (e) {
    const known = e instanceof GenerateError || e instanceof AdsBudgetError || e instanceof CopyModelError;
    if (!known) payload.logger.error(`[publicité] génération échouée pour la campagne ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: known ? (e as Error).message : "La génération a échoué. Réessayez ; si ça persiste, voir les journaux." }, { status: known ? 409 : 502 });
  }
}
