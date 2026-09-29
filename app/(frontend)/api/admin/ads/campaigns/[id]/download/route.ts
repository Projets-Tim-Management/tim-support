import { NextResponse } from "next/server";

import { hasAdminRole } from "@/core/access";
import { payloadClient } from "@/core/payload-client";
import type { DownloadCreative } from "@/modules/ads/lib/download";
import { DOWNLOADABLE, zipResponse } from "@/modules/ads/lib/download-server";

/** GET /api/admin/ads/campaigns/:id/download — le ZIP de toutes les créas validées d'une campagne. */
export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const payload = await payloadClient();
  const { user } = await payload.auth({ headers: req.headers });
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!hasAdminRole(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const r = await payload.find({
    collection: "ad-creatives",
    where: { and: [{ campaign: { equals: id } }, { status: { in: DOWNLOADABLE } }] },
    sort: "createdAt",
    pagination: false,
    depth: 1,
    overrideAccess: true,
  });
  if (!r.docs.length) return NextResponse.json({ error: "Aucune créa validée pour cette campagne." }, { status: 404 });
  return zipResponse(payload, id, r.docs as unknown as DownloadCreative[]);
}
