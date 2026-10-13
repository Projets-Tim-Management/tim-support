import { NextResponse } from "next/server";

import { learningGesture, parseLearningGesture } from "@/modules/ads/lib/notebook-actions";
import { adminRequest } from "@/modules/ads/lib/route-auth";

/**
 * POST /api/admin/ads/learnings/:id  { action: "promouvoir" | "garder" }
 *
 * Un apprentissage « global proposé » devient global (validé par l'admin qui
 * clique, signé et daté par le hook de la collection) ou reste propre à sa
 * campagne.
 */
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: Params) {
  const { id } = await params;
  const auth = await adminRequest(req);
  if ("response" in auth) return auth.response;
  const { payload, user } = auth;

  const g = parseLearningGesture((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if (!g) return NextResponse.json({ error: "Geste attendu : promouvoir ou garder." }, { status: 400 });
  const row = await payload.findByID({ collection: "ad-learnings", id, depth: 0, overrideAccess: true }).catch(() => null);
  if (!row) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const out = learningGesture(row as never, g);
  if ("error" in out) return NextResponse.json({ error: out.error }, { status: 409 });

  await payload.update({ collection: "ad-learnings", id, data: out.data as never, user, overrideAccess: true });
  return NextResponse.json({ status: out.data.status, scope: out.data.scope });
}
