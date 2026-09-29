import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import { decisionData, decisionError, type Decision } from "@/modules/ads/lib/decide";

/**
 * POST /api/admin/ads/creatives/:id/decide
 *   { decision: "validee" } | { decision: "refusee", reason, detail? }
 *
 * Le seul chemin qui change le statut d'une créa (voir lib/decide).
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const body = (await req.json().catch(() => ({}))) as { decision?: string; reason?: string; detail?: string };
  const d: Decision | null =
    body.decision === "validee" ? { decision: "validee" } : body.decision === "refusee" ? { decision: "refusee", reason: String(body.reason ?? ""), detail: body.detail } : null;
  if (!d) return NextResponse.json({ error: "Décision attendue : validee ou refusee." }, { status: 400 });

  const creative = await payload.findByID({ collection: "ad-creatives", id, depth: 0, overrideAccess: true }).catch(() => null);
  if (!creative) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const error = decisionError(creative as never, d);
  if (error) return NextResponse.json({ error }, { status: 409 });

  await payload.update({ collection: "ad-creatives", id, data: decisionData(d, user.id, new Date()) as never, overrideAccess: true });
  payload.logger.info(`[publicité] créa ${id} ${d.decision === "validee" ? "validée" : `refusée (${d.reason})`} par ${user.email}.`);
  return NextResponse.json({ status: d.decision });
}
