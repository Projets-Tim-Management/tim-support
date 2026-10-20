import { NextResponse } from "next/server";

import { adminRequest } from "@/modules/ads/lib/route-auth";
import { decisionData, decisionError, type Decision } from "@/modules/ads/lib/decide";
import { proposeFromRefusal } from "@/modules/ads/lib/refusal-instruction";

/**
 * POST /api/admin/ads/creatives/:id/decide
 *   { decision: "validee" } | { decision: "refusee", reason, detail? } | { decision: "rouvrir" }
 *
 * Le seul chemin qui change le statut d'une créa (voir lib/decide). Un refus
 * propose aussi une consigne pour l'agent, à confirmer dans « À valider »
 * (lib/refusal-instruction) ; elle ne fait jamais échouer le refus.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;

  const body = (await req.json().catch(() => ({}))) as { decision?: string; reason?: string; detail?: string };
  const d: Decision | null =
    body.decision === "validee"
      ? { decision: "validee" }
      : body.decision === "refusee"
        ? { decision: "refusee", reason: String(body.reason ?? ""), detail: body.detail }
        : body.decision === "rouvrir"
          ? { decision: "rouvrir" }
          : null;
  if (!d) return NextResponse.json({ error: "Décision attendue : validee ou refusee." }, { status: 400 });

  const creative = await payload.findByID({ collection: "ad-creatives", id, depth: 0, overrideAccess: true }).catch(() => null);
  if (!creative) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // Publiée chez Meta : sa campagne la compte dans sa publication (ou elle est déjà en ligne).
  const campaignId = typeof creative.campaign === "object" && creative.campaign ? (creative.campaign as { id: number }).id : creative.campaign;
  const campaign = campaignId ? ((await payload.findByID({ collection: "ad-campaigns", id: campaignId as number, depth: 0, overrideAccess: true }).catch(() => null)) as { publication?: { creas?: (number | string)[] } | null } | null) : null;
  const published = creative.status === "en-ligne" || Boolean(campaign?.publication?.creas?.map(String).includes(String(creative.id)));
  const error = decisionError(creative as never, d, published);
  if (error) return NextResponse.json({ error }, { status: 409 });

  await payload.update({ collection: "ad-creatives", id, data: decisionData(d, user.id, new Date()) as never, overrideAccess: true });
  payload.logger.info(`[publicité] créa ${id} ${d.decision === "validee" ? "validée" : d.decision === "rouvrir" ? "rouverte" : `refusée (${d.reason})`} par ${user.email}.`);
  const proposed = d.decision === "refusee" ? await proposeFromRefusal(payload, creative as never, d) : null;
  return NextResponse.json({ status: d.decision, consigneProposee: proposed });
}
