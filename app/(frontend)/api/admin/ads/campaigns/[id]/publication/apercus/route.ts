import { NextResponse } from "next/server";

import { publicationPreviews, PublishError } from "@/modules/ads/lib/publish/run";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/** GET /api/admin/ads/campaigns/:id/publication/apercus — les aperçus Meta de chaque publicité (HTML d'iframe). */
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  try {
    return NextResponse.json({ previews: await publicationPreviews(auth.payload, id) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: e instanceof PublishError ? 409 : 502 });
  }
}
