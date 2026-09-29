import { NextResponse } from "next/server";

import { adminRequest } from "@/modules/ads/lib/route-auth";
import type { DownloadCreative } from "@/modules/ads/lib/download";
import { DOWNLOADABLE, zipResponse } from "@/modules/ads/lib/download-server";

/** GET /api/admin/ads/creatives/:id/download — le ZIP d'une créa validée. */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload } = auth;

  const c = (await payload.findByID({ collection: "ad-creatives", id, depth: 1, overrideAccess: true }).catch(() => null)) as
    | (DownloadCreative & { status?: string; campaign?: { id: number | string } | number | string })
    | null;
  if (!c) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!DOWNLOADABLE.includes(String(c.status))) return NextResponse.json({ error: "Seule une créa validée se télécharge." }, { status: 409 });
  const campaignId = typeof c.campaign === "object" && c.campaign ? c.campaign.id : c.campaign;
  return zipResponse(payload, campaignId as number | string, [c], c.angle);
}
