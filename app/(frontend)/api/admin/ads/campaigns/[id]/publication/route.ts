import { NextResponse } from "next/server";

import { AccountUnavailable } from "@/modules/ads/lib/account-access";
import { planSummary } from "@/modules/ads/lib/media-plan";
import { activatePublication, loadInput, pausePublication, PublishError, publishProblems, startPublication } from "@/modules/ads/lib/publish/run";
import { adminRequest } from "@/modules/ads/lib/route-auth";
import { AdTokenError } from "@/modules/ads/platforms/types";

/**
 * GET  /api/admin/ads/campaigns/:id/publication → ce qui empêche de publier, le
 *      plan de diffusion, les créas prêtes et l'état de la publication.
 * POST { action: "publier" | "activer" | "pause" } → le geste de Charlie.
 * Jamais appelée par un agent : créer ou activer une campagne n'est pas autonome.
 */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  try {
    const { input, campaign } = await loadInput(auth.payload, id);
    return NextResponse.json({
      problems: publishProblems(input),
      plan: input.plan ? planSummary(input.plan) : null,
      metaDailyEur: input.metaDailyEur,
      creas: input.creas.map((c) => ({ id: c.id, angle: c.angle })),
      state: campaign.publication ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof PublishError ? 404 : 500 });
  }
}

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;
  const { action } = (await req.json().catch(() => ({}))) as { action?: string };
  const who = String((user as { email?: string }).email ?? "un admin");
  try {
    const state =
      action === "publier" ? await startPublication(payload, id, who) : action === "activer" ? await activatePublication(payload, id, who) : action === "pause" ? await pausePublication(payload, id, who) : null;
    if (!state) return NextResponse.json({ error: "Action attendue : publier, activer ou pause." }, { status: 400 });
    payload.logger.info(`[publicité] campagne ${id} : ${action} par ${who} → ${state.status}.`);
    return NextResponse.json({ state });
  } catch (e) {
    const known = e instanceof PublishError || e instanceof AccountUnavailable || e instanceof AdTokenError;
    if (!known) payload.logger.error(`[publicité] ${action} de la campagne ${id} : ${(e as Error).message}`);
    return NextResponse.json({ error: (e as Error).message }, { status: known ? 409 : 502 });
  }
}
